const mongoose = require('mongoose');
const { config } = require('./config');
const { logger } = require('../utils/logger');

/**
 * Initialize database connection
 */
exports.initializeDatabase = async () => {
  try {
    // Set mongoose options
    mongoose.set('strictQuery', true);
    mongoose.set('debug', config.isDevelopment);

    // Connect to MongoDB
    await mongoose.connect(config.db.uri, config.db.options);

    logger.info('Database connected successfully to MongoDB at ' + config.db.uri);

    // Handle connection events
    mongoose.connection.on('error', (error) => {
      logger.error('Database error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Database disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('Database reconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        logger.info('Database connection closed through app termination');
        process.exit(0);
      } catch (error) {
        logger.error('Error closing database connection:', error);
        process.exit(1);
      }
    });

    return mongoose.connection;
  } catch (error) {
    logger.error('Database connection error: Check your database URI and options.', error);
    throw error;
  }
};

/**
 * Check database health
 */
exports.checkDatabaseHealth = async () => {
  try {
    const status = await mongoose.connection.db.admin().ping();
    return {
      status: status.ok === 1 ? 'connected' : 'error',
      latency: status.ok === 1 ? status.latency : null
    };
  } catch (error) {
    logger.error('Database health check failed: ' + error.message);
    return {
      status: 'error',
      error: error.message
    };
  }
};

/**
 * Get database statistics
 */
exports.getDatabaseStats = async () => {
  try {
    const [dbStats, collections] = await Promise.all([
      mongoose.connection.db.stats(),
      mongoose.connection.db.listCollections().toArray()
    ]);

    // Get collection stats
    const collectionStats = await Promise.all(
      collections.map(async (collection) => {
        const stats = await mongoose.connection.db
          .collection(collection.name)
          .stats();
        return {
          name: collection.name,
          count: stats.count,
          size: stats.size,
          avgObjSize: stats.avgObjSize
        };
      })
    );

    return {
      database: dbStats.db,
      collections: collectionStats,
      totalSize: dbStats.dataSize,
      indexes: dbStats.indexes,
      connections: mongoose.connection.client.topology.connections.length
    };
  } catch (error) {
    logger.error('Error getting database stats:', error);
    throw error;
  }
};

/**
 * Create database backup
 */
exports.createBackup = async () => {
  try {
    const { spawn } = require('child_process');
    const path = require('path');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(config.backup.path, `backup-${timestamp}`);

    // Create backup using mongodump
    await new Promise((resolve, reject) => {
      const mongodump = spawn('mongodump', [
        `--uri=${config.db.uri}`,
        `--out=${backupPath}`
      ]);

      mongodump.on('close', (code) => {
        if (code === 0) {
          logger.info('Database backup created:', { path: backupPath });
          resolve();
        } else {
          reject(new Error(`Backup failed with code ${code}`));
        }
      });

      mongodump.on('error', reject);
    });

    // Clean old backups
    await cleanOldBackups();

    return {
      success: true,
      path: backupPath,
      timestamp
    };
  } catch (error) {
    logger.error('Backup creation error:', error);
    throw error;
  }
};

/**
 * Clean old backups
 */
const cleanOldBackups = async () => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    
    const backupDir = config.backup.path;
    const files = await fs.readdir(backupDir);
    
    // Sort backups by date (newest first)
    const backups = files
      .filter(file => file.startsWith('backup-'))
      .sort()
      .reverse();

    // Remove old backups
    if (backups.length > config.backup.maxBackups) {
      const oldBackups = backups.slice(config.backup.maxBackups);
      await Promise.all(
        oldBackups.map(backup => 
          fs.rm(path.join(backupDir, backup), { recursive: true })
        )
      );

      logger.info('Old backups cleaned:', {
        removed: oldBackups.length,
        remaining: config.backup.maxBackups
      });
    }
  } catch (error) {
    logger.error('Error cleaning old backups:', error);
    throw error;
  }
};

/**
 * Restore database from backup
 */
exports.restoreBackup = async (backupPath) => {
  try {
    const { spawn } = require('child_process');

    // Restore using mongorestore
    await new Promise((resolve, reject) => {
      const mongorestore = spawn('mongorestore', [
        `--uri=${config.db.uri}`,
        '--drop',
        backupPath
      ]);

      mongorestore.on('close', (code) => {
        if (code === 0) {
          logger.info('Database restored from backup:', { path: backupPath });
          resolve();
        } else {
          reject(new Error(`Restore failed with code ${code}`));
        }
      });

      mongorestore.on('error', reject);
    });

    return {
      success: true,
      path: backupPath,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Backup restoration error:', error);
    throw error;
  }
};

/**
 * Database optimization functions
 */
exports.optimizationTools = {
  // Create indexes
  createIndexes: async () => {
    try {
      const models = mongoose.modelNames();
      const results = await Promise.all(
        models.map(async (modelName) => {
          const model = mongoose.model(modelName);
          const indexes = await model.collection.getIndexes();
          return { model: modelName, indexes };
        })
      );
      return results;
    } catch (error) {
      logger.error('Error creating indexes:', error);
      throw error;
    }
  },

  // Analyze queries
  analyzeQueries: async () => {
    try {
      const slowQueries = await mongoose.connection.db
        .admin()
        .command({ profile: -1 });
      return slowQueries;
    } catch (error) {
      logger.error('Error analyzing queries:', error);
      throw error;
    }
  },

  // Compact database
  compactDatabase: async () => {
    try {
      const collections = await mongoose.connection.db
        .listCollections()
        .toArray();
      
      await Promise.all(
        collections.map(collection =>
          mongoose.connection.db.command({
            compact: collection.name
          })
        )
      );

      logger.info('Database compaction completed');
    } catch (error) {
      logger.error('Error compacting database:', error);
      throw error;
    }
  }
};
