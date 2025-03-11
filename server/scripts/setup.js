const { logger } = require('../utils/logger');
const { config } = require('../config/config');
const database = require('../config/database');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');

class SetupManager {
  constructor() {
    this.setupTasks = [
      { name: 'Create Directories', task: this.createDirectories.bind(this) },
      { name: 'Initialize Database', task: this.initializeDatabase.bind(this) },
      { name: 'Run Migrations', task: this.runMigrations.bind(this) },
      { name: 'Load Initial Data', task: this.loadInitialData.bind(this) },
      { name: 'Setup Monitoring', task: this.setupMonitoring.bind(this) },
      { name: 'Verify Configuration', task: this.verifyConfiguration.bind(this) }
    ];
  }

  async run() {
    logger.info('Starting server setup...');

    try {
      for (const { name, task } of this.setupTasks) {
        logger.info(`Running setup task: ${name}`);
        await task();
        logger.info(`Completed setup task: ${name}`);
      }

      logger.info('Server setup completed successfully');
    } catch (error) {
      logger.error('Setup failed:', error);
      throw error;
    }
  }

  async createDirectories() {
    const directories = [
      'logs/error',
      'logs/combined',
      'uploads',
      'uploads/temp',
      'uploads/profiles',
      'uploads/services',
      'backup',
      'backup/temp'
    ];

    for (const dir of directories) {
      const fullPath = path.join(__dirname, '..', dir);
      try {
        await fs.mkdir(fullPath, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }
    }
  }

  async initializeDatabase() {
    try {
      // Connect to database
      await database.connect();

      // Create indexes
      const models = require('../Models');
      for (const [modelName, model] of Object.entries(models)) {
        await model.createIndexes();
        logger.info(`Created indexes for model: ${modelName}`);
      }
    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  async runMigrations() {
    try {
      const Migrator = require('./migrations/migrate');
      const migrator = new Migrator();
      
      // Run pending migrations
      await migrator.up();
      
      // Log migration status
      const status = await migrator.status();
      logger.info('Migration status:', status);
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  async loadInitialData() {
    try {
      // Load cities
      await this.runScript('./fetchCities.js');
      logger.info('Cities data loaded');

      // Load categories
      await this.runScript('./populateCategories.js');
      logger.info('Categories data loaded');

      // Create admin user if not exists
      await this.createAdminUser();
      logger.info('Admin user verified');
    } catch (error) {
      logger.error('Initial data loading failed:', error);
      throw error;
    }
  }

  async runScript(scriptPath) {
    return new Promise((resolve, reject) => {
      const fullPath = path.join(__dirname, scriptPath);
      const child = spawn('node', [fullPath], {
        stdio: 'inherit'
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Script ${scriptPath} failed with code ${code}`));
        }
      });
    });
  }

  async createAdminUser() {
    const User = require('../Models/user');
    const bcrypt = require('bcryptjs');

    const adminData = {
      email: config.admin.email,
      password: await bcrypt.hash(config.admin.password, config.security.bcryptRounds),
      role: 'admin',
      isActive: true,
      profile: {
        name: 'System Administrator',
        phone: ''
      }
    };

    try {
      await User.findOneAndUpdate(
        { email: adminData.email },
        adminData,
        { upsert: true, new: true }
      );
    } catch (error) {
      logger.error('Failed to create admin user:', error);
      throw error;
    }
  }

  async setupMonitoring() {
    if (!config.monitoring.enabled) {
      logger.info('Monitoring is disabled, skipping setup');
      return;
    }

    try {
      // Create monitoring directories
      const monitoringDirs = [
        'logs/metrics',
        'logs/alerts'
      ];

      for (const dir of monitoringDirs) {
        await fs.mkdir(path.join(__dirname, '..', dir), { recursive: true });
      }

      // Initialize monitoring system
      const monitor = require('./monitor');
      await monitor.start();
      logger.info('Monitoring system initialized');
    } catch (error) {
      logger.error('Monitoring setup failed:', error);
      throw error;
    }
  }

  async verifyConfiguration() {
    const requiredEnvVars = [
      'NODE_ENV',
      'PORT',
      'MONGODB_URI',
      'JWT_SECRET'
    ];

    // Check required environment variables
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Verify MongoDB connection
    const dbHealth = await database.checkHealth();
    if (!dbHealth.ok) {
      throw new Error(`Database health check failed: ${dbHealth.error}`);
    }

    // Verify directory permissions
    const dirsToCheck = [
      'logs',
      'uploads',
      'backup'
    ];

    for (const dir of dirsToCheck) {
      const fullPath = path.join(__dirname, '..', dir);
      try {
        const testFile = path.join(fullPath, '.test');
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
      } catch (error) {
        throw new Error(`Directory ${dir} is not writable: ${error.message}`);
      }
    }

    logger.info('Configuration verification completed');
  }
}

// Run setup if executed directly
if (require.main === module) {
  const setup = new SetupManager();
  setup.run()
    .then(() => {
      logger.info('Setup completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Setup failed:', error);
      process.exit(1);
    });
}

module.exports = SetupManager;
