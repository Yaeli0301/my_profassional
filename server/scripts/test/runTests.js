const { spawn } = require('child_process');
const { logger } = require('../../utils/logger');
const path = require('path');
const fs = require('fs').promises;

class TestRunner {
  constructor() {
    this.testsDir = path.join(__dirname, '../../tests');
    this.coverageDir = path.join(__dirname, '../../coverage');
    this.testFiles = [];
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0
    };
  }

  async initialize() {
    try {
      // Create test directories if they don't exist
      await fs.mkdir(this.testsDir, { recursive: true });
      await fs.mkdir(path.join(this.testsDir, 'unit'), { recursive: true });
      await fs.mkdir(path.join(this.testsDir, 'integration'), { recursive: true });
      await fs.mkdir(path.join(this.testsDir, 'e2e'), { recursive: true });

      // Create test setup file if it doesn't exist
      const setupPath = path.join(this.testsDir, 'setup.js');
      if (!await this.fileExists(setupPath)) {
        await this.createSetupFile(setupPath);
      }

      logger.info('Test environment initialized');
    } catch (error) {
      logger.error('Failed to initialize test environment:', error);
      throw error;
    }
  }

  async fileExists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async createSetupFile(path) {
    const content = `
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { config } = require('../config/config');

let mongod;

// Setup before tests
beforeAll(async () => {
  // Create in-memory MongoDB instance
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  // Connect to in-memory database
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
});

// Cleanup after tests
afterAll(async () => {
  // Disconnect and stop MongoDB instance
  await mongoose.disconnect();
  await mongod.stop();
});

// Reset database between tests
beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
});

// Global test timeout
jest.setTimeout(30000);

// Mock external services
jest.mock('../utils/notifications');
jest.mock('../utils/socketManager');

// Environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
`;

    await fs.writeFile(path, content.trim());
  }

  async findTestFiles() {
    const findFiles = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files = [];

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...(await findFiles(fullPath)));
        } else if (entry.name.endsWith('.test.js')) {
          files.push(fullPath);
        }
      }

      return files;
    };

    this.testFiles = await findFiles(this.testsDir);
  }

  async run(options = {}) {
    const {
      coverage = true,
      watch = false,
      filter = '',
      updateSnapshots = false,
      ci = false
    } = options;

    try {
      await this.initialize();
      await this.findTestFiles();

      if (this.testFiles.length === 0) {
        logger.warn('No test files found');
        return;
      }

      logger.info(`Found ${this.testFiles.length} test files`);

      const args = [
        '--detectOpenHandles',
        '--forceExit'
      ];

      if (coverage) {
        args.push('--coverage');
      }

      if (watch) {
        args.push('--watch');
      }

      if (filter) {
        args.push('--testNamePattern', filter);
      }

      if (updateSnapshots) {
        args.push('--updateSnapshot');
      }

      if (ci) {
        args.push('--ci');
        args.push('--runInBand');
      }

      const startTime = Date.now();

      await new Promise((resolve, reject) => {
        const jest = spawn('jest', args, {
          stdio: 'inherit',
          env: {
            ...process.env,
            NODE_ENV: 'test'
          }
        });

        jest.on('close', code => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Tests failed with code ${code}`));
          }
        });

        jest.on('error', reject);
      });

      this.results.duration = Date.now() - startTime;

      // Parse coverage report if enabled
      if (coverage) {
        await this.parseCoverageReport();
      }

      logger.info('Tests completed successfully', this.results);
    } catch (error) {
      logger.error('Tests failed:', error);
      throw error;
    }
  }

  async parseCoverageReport() {
    try {
      const coverageFile = path.join(this.coverageDir, 'coverage-final.json');
      const coverage = JSON.parse(await fs.readFile(coverageFile, 'utf-8'));

      let totalStatements = 0;
      let coveredStatements = 0;

      Object.values(coverage).forEach(file => {
        totalStatements += Object.keys(file.statementMap).length;
        coveredStatements += Object.values(file.s).filter(v => v > 0).length;
      });

      this.results.coverage = {
        percentage: (coveredStatements / totalStatements) * 100,
        statements: {
          total: totalStatements,
          covered: coveredStatements
        }
      };
    } catch (error) {
      logger.error('Failed to parse coverage report:', error);
    }
  }

  async generateTestFile(type, name) {
    const template = `
const request = require('supertest');
const app = require('${type === 'unit' ? '../../' : '../'}server');
const mongoose = require('mongoose');

describe('${name}', () => {
  ${type === 'integration' ? `
  let token;
  
  beforeAll(async () => {
    // Setup test data and authenticate
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    token = response.body.token;
  });` : ''}

  beforeEach(() => {
    // Setup for each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  test('should do something', async () => {
    // Write your test here
    expect(true).toBe(true);
  });
});
`;

    const dir = path.join(this.testsDir, type);
    const filePath = path.join(dir, `${name}.test.js`);

    await fs.writeFile(filePath, template.trim());
    logger.info(`Created test file: ${filePath}`);
  }
}

// Handle command line arguments
if (require.main === module) {
  const command = process.argv[2];
  const options = process.argv.slice(3).reduce((opts, arg) => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      opts[key] = value || true;
    }
    return opts;
  }, {});

  const runner = new TestRunner();

  const commands = {
    async run() {
      await runner.run(options);
    },
    async create() {
      if (!options.type || !options.name) {
        throw new Error('Test type and name are required (--type=unit|integration|e2e --name=TestName)');
      }
      await runner.generateTestFile(options.type, options.name);
    }
  };

  if (!command || !commands[command]) {
    console.log(`
Usage: node runTests.js <command> [options]

Commands:
  run            Run tests
  create         Create a new test file

Options for run:
  --coverage     Generate coverage report
  --watch        Watch for changes
  --filter       Filter tests by name
  --updateSnapshot  Update snapshots
  --ci          Run in CI mode

Options for create:
  --type        Test type (unit|integration|e2e)
  --name        Test name
`);
    process.exit(1);
  }

  commands[command]()
    .then(() => process.exit(0))
    .catch(error => {
      logger.error('Test command failed:', error);
      process.exit(1);
    });
}

module.exports = TestRunner;
