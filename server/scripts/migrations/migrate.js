const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../../utils/logger');
const database = require('../../config/database');
const { config } = require('../../config/config');

class Migrator {
  constructor() {
    this.migrationsDir = path.join(__dirname, 'migrations');
    this.migrationsCollection = 'migrations';
  }

  async initialize() {
    try {
      // Connect to database if not connected
      if (!database.isConnected) {
        await database.connect();
      }

      // Create migrations collection if it doesn't exist
      const collections = await database.connection.db.listCollections().toArray();
      if (!collections.find(c => c.name === this.migrationsCollection)) {
        await database.connection.db.createCollection(this.migrationsCollection);
      }

      logger.info('Migration system initialized');
    } catch (error) {
      logger.error('Failed to initialize migration system:', error);
      throw error;
    }
  }

  async up(specific = null) {
    await this.initialize();

    try {
      // Get all migration files
      const migrations = await this.getPendingMigrations();

      if (migrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }

      // Filter specific migration if provided
      const toRun = specific
        ? migrations.filter(m => m.name === specific)
        : migrations;

      if (specific && toRun.length === 0) {
        throw new Error(`Migration ${specific} not found or already applied`);
      }

      // Run migrations in sequence
      for (const migration of toRun) {
        await this.runMigration(migration);
      }

      logger.info('Migrations completed successfully');
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  async down(specific = null) {
    await this.initialize();

    try {
      // Get applied migrations
      const applied = await this.getAppliedMigrations();

      if (applied.length === 0) {
        logger.info('No migrations to rollback');
        return;
      }

      // Sort in reverse order
      const migrations = applied.sort((a, b) => 
        new Date(b.appliedAt) - new Date(a.appliedAt)
      );

      // Filter specific migration if provided
      const toRun = specific
        ? migrations.filter(m => m.name === specific)
        : [migrations[0]]; // Only rollback last migration by default

      if (specific && toRun.length === 0) {
        throw new Error(`Migration ${specific} not found or not applied`);
      }

      // Run rollbacks in sequence
      for (const migration of toRun) {
        await this.rollbackMigration(migration);
      }

      logger.info('Rollback completed successfully');
    } catch (error) {
      logger.error('Rollback failed:', error);
      throw error;
    }
  }

  async create(name) {
    if (!name) {
      throw new Error('Migration name is required');
    }

    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const filename = `${timestamp}-${name}.js`;
    const filepath = path.join(this.migrationsDir, filename);

    const template = `
const { logger } = require('../../../utils/logger');

module.exports = {
  name: '${name}',
  description: 'Description of what this migration does',
  
  async up(db) {
    logger.info('Running migration: ${name}');
    // Add your migration code here
  },

  async down(db) {
    logger.info('Rolling back migration: ${name}');
    // Add your rollback code here
  }
};
`;

    await fs.writeFile(filepath, template.trim());
    logger.info(`Created migration file: ${filename}`);
    return filename;
  }

  async status() {
    await this.initialize();

    try {
      const [pending, applied] = await Promise.all([
        this.getPendingMigrations(),
        this.getAppliedMigrations()
      ]);

      return {
        pending: pending.map(m => ({
          name: m.name,
          filename: m.filename,
          description: m.description
        })),
        applied: applied.map(m => ({
          name: m.name,
          appliedAt: m.appliedAt,
          duration: m.duration
        }))
      };
    } catch (error) {
      logger.error('Failed to get migration status:', error);
      throw error;
    }
  }

  async getPendingMigrations() {
    // Get all migration files
    const files = await fs.readdir(this.migrationsDir);
    const migrations = await Promise.all(
      files
        .filter(f => f.endsWith('.js'))
        .map(async filename => {
          const migration = require(path.join(this.migrationsDir, filename));
          return { ...migration, filename };
        })
    );

    // Get applied migrations
    const applied = await this.getAppliedMigrations();
    const appliedNames = applied.map(m => m.name);

    // Filter out applied migrations
    return migrations
      .filter(m => !appliedNames.includes(m.name))
      .sort((a, b) => a.filename.localeCompare(b.filename));
  }

  async getAppliedMigrations() {
    return await database.connection.db
      .collection(this.migrationsCollection)
      .find()
      .sort({ appliedAt: -1 })
      .toArray();
  }

  async runMigration(migration) {
    const startTime = Date.now();
    logger.info(`Running migration: ${migration.name}`);

    const session = await database.connection.startSession();
    session.startTransaction();

    try {
      // Run migration
      await migration.up(database.connection.db);

      // Record migration
      await database.connection.db
        .collection(this.migrationsCollection)
        .insertOne({
          name: migration.name,
          filename: migration.filename,
          description: migration.description,
          appliedAt: new Date(),
          duration: Date.now() - startTime
        }, { session });

      await session.commitTransaction();
      logger.info(`Migration completed: ${migration.name}`);
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Migration ${migration.name} failed:`, error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  async rollbackMigration(migration) {
    const startTime = Date.now();
    logger.info(`Rolling back migration: ${migration.name}`);

    const session = await database.connection.startSession();
    session.startTransaction();

    try {
      // Load migration file
      const migrationFile = require(path.join(
        this.migrationsDir,
        migration.filename
      ));

      // Run rollback
      await migrationFile.down(database.connection.db);

      // Remove migration record
      await database.connection.db
        .collection(this.migrationsCollection)
        .deleteOne({ name: migration.name }, { session });

      await session.commitTransaction();
      logger.info(`Rollback completed: ${migration.name}`);
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Rollback ${migration.name} failed:`, error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  async validate() {
    const errors = [];
    const migrations = await this.getPendingMigrations();

    for (const migration of migrations) {
      // Check required properties
      if (!migration.name) {
        errors.push(`Migration ${migration.filename} missing 'name' property`);
      }
      if (!migration.up || typeof migration.up !== 'function') {
        errors.push(`Migration ${migration.filename} missing 'up' function`);
      }
      if (!migration.down || typeof migration.down !== 'function') {
        errors.push(`Migration ${migration.filename} missing 'down' function`);
      }

      // Check for duplicate names
      const duplicates = migrations.filter(m => 
        m.name === migration.name && m.filename !== migration.filename
      );
      if (duplicates.length > 0) {
        errors.push(`Duplicate migration name '${migration.name}'`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Handle direct script execution
if (require.main === module) {
  const migrator = new Migrator();
  const command = process.argv[2];
  const arg = process.argv[3];

  const commands = {
    async up() {
      await migrator.up(arg);
    },
    async down() {
      await migrator.down(arg);
    },
    async create() {
      if (!arg) {
        throw new Error('Migration name required');
      }
      await migrator.create(arg);
    },
    async status() {
      const status = await migrator.status();
      console.log(JSON.stringify(status, null, 2));
    },
    async validate() {
      const result = await migrator.validate();
      console.log(JSON.stringify(result, null, 2));
      if (!result.valid) {
        process.exit(1);
      }
    }
  };

  if (!commands[command]) {
    console.log(`
Usage: node migrate.js <command> [options]

Commands:
  up [name]     Run all pending migrations or a specific one
  down [name]   Rollback last migration or a specific one
  create <name> Create a new migration file
  status       Show migration status
  validate     Validate migration files
    `);
    process.exit(1);
  }

  commands[command]()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Command failed:', error);
      process.exit(1);
    });
}

module.exports = Migrator;
