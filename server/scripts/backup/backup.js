const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { createGzip } = require('zlib');
const { pipeline } = require('stream/promises');
const { createReadStream, createWriteStream } = require('fs');
const { logger } = require('../../utils/logger');
const { config } = require('../../config/config');

class DatabaseBackup {
  constructor() {
    this.backupDir = path.join(__dirname, '../../backup');
    this.tempDir = path.join(this.backupDir, 'temp');
    this.retentionDays = 7; // Keep backups for 7 days
  }

  async init() {
    // Ensure backup directories exist
    await fs.mkdir(this.backupDir, { recursive: true });
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  async create() {
    try {
      await this.init();
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `backup-${timestamp}.gz`;
      const tempFilePath = path.join(this.tempDir, `temp-${timestamp}`);
      const finalFilePath = path.join(this.backupDir, backupFileName);

      logger.info('Starting database backup...');

      // Run mongodump
      await this.runMongodump(tempFilePath);

      // Compress the backup
      await this.compressBackup(tempFilePath, finalFilePath);

      // Clean up temp files
      await fs.rm(tempFilePath, { recursive: true, force: true });

      // Remove old backups
      await this.cleanOldBackups();

      logger.info(`Backup completed successfully: ${backupFileName}`);
      return finalFilePath;
    } catch (error) {
      logger.error('Backup failed:', error);
      throw error;
    }
  }

  async restore(backupFile) {
    try {
      if (!backupFile) {
        // If no backup file specified, use the most recent one
        const backups = await this.list();
        if (backups.length === 0) {
          throw new Error('No backups found');
        }
        backupFile = backups[0].path;
      }

      logger.info(`Starting database restore from ${backupFile}...`);

      const tempDir = path.join(this.tempDir, `restore-${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });

      // Decompress the backup
      await this.decompressBackup(backupFile, tempDir);

      // Run mongorestore
      await this.runMongorestore(tempDir);

      // Clean up
      await fs.rm(tempDir, { recursive: true, force: true });

      logger.info('Database restore completed successfully');
    } catch (error) {
      logger.error('Restore failed:', error);
      throw error;
    }
  }

  async list() {
    try {
      const files = await fs.readdir(this.backupDir);
      
      const backups = await Promise.all(
        files
          .filter(file => file.startsWith('backup-') && file.endsWith('.gz'))
          .map(async file => {
            const filePath = path.join(this.backupDir, file);
            const stats = await fs.stat(filePath);
            return {
              name: file,
              path: filePath,
              size: stats.size,
              created: stats.birthtime
            };
          })
      );

      // Sort by creation date, newest first
      return backups.sort((a, b) => b.created - a.created);
    } catch (error) {
      logger.error('Failed to list backups:', error);
      throw error;
    }
  }

  async runMongodump(outputPath) {
    const { uri } = config.db;
    const args = [
      '--uri', uri,
      '--out', outputPath,
      '--gzip'
    ];

    return new Promise((resolve, reject) => {
      const mongodump = spawn('mongodump', args);
      let error = '';

      mongodump.stderr.on('data', (data) => {
        error += data.toString();
      });

      mongodump.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`mongodump failed: ${error}`));
        } else {
          resolve();
        }
      });
    });
  }

  async runMongorestore(inputPath) {
    const { uri } = config.db;
    const args = [
      '--uri', uri,
      '--dir', inputPath,
      '--gzip',
      '--drop' // Drop existing collections before restore
    ];

    return new Promise((resolve, reject) => {
      const mongorestore = spawn('mongorestore', args);
      let error = '';

      mongorestore.stderr.on('data', (data) => {
        error += data.toString();
      });

      mongorestore.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`mongorestore failed: ${error}`));
        } else {
          resolve();
        }
      });
    });
  }

  async compressBackup(inputPath, outputPath) {
    const gzip = createGzip();
    const source = createReadStream(inputPath);
    const destination = createWriteStream(outputPath);

    await pipeline(source, gzip, destination);
  }

  async decompressBackup(inputPath, outputDir) {
    const gunzip = require('zlib').createGunzip();
    const source = createReadStream(inputPath);
    const destination = createWriteStream(path.join(outputDir, 'backup.archive'));

    await pipeline(source, gunzip, destination);
  }

  async cleanOldBackups() {
    try {
      const backups = await this.list();
      const now = new Date();
      const retentionPeriod = this.retentionDays * 24 * 60 * 60 * 1000; // days to milliseconds

      for (const backup of backups) {
        const age = now - backup.created;
        if (age > retentionPeriod) {
          await fs.unlink(backup.path);
          logger.info(`Removed old backup: ${backup.name}`);
        }
      }
    } catch (error) {
      logger.error('Failed to clean old backups:', error);
    }
  }

  async validateBackup(backupPath) {
    try {
      // Check if file exists and is readable
      await fs.access(backupPath, fs.constants.R_OK);

      // Check file size
      const stats = await fs.stat(backupPath);
      if (stats.size === 0) {
        throw new Error('Backup file is empty');
      }

      // Try to read the first few bytes to verify it's a valid gzip file
      const buffer = Buffer.alloc(3);
      const fd = await fs.open(backupPath, 'r');
      await fd.read(buffer, 0, 3, 0);
      await fd.close();

      // Check gzip magic number (1f 8b 08)
      if (buffer[0] !== 0x1f || buffer[1] !== 0x8b || buffer[2] !== 0x08) {
        throw new Error('Invalid backup file format');
      }

      return true;
    } catch (error) {
      logger.error('Backup validation failed:', error);
      return false;
    }
  }
}

// Run backup operations if executed directly
if (require.main === module) {
  const backup = new DatabaseBackup();
  const command = process.argv[2] || 'create';

  (async () => {
    try {
      switch (command) {
        case 'create':
          const backupPath = await backup.create();
          logger.info(`Backup created: ${backupPath}`);
          break;

        case 'restore':
          const backupFile = process.argv[3];
          await backup.restore(backupFile);
          break;

        case 'list':
          const backups = await backup.list();
          console.table(
            backups.map(b => ({
              name: b.name,
              size: `${(b.size / 1024 / 1024).toFixed(2)} MB`,
              created: b.created.toISOString()
            }))
          );
          break;

        default:
          console.log('Usage: node backup.js [create|restore|list] [backup-file]');
      }
    } catch (error) {
      logger.error('Backup operation failed:', error);
      process.exit(1);
    }
    process.exit(0);
  })();
}

module.exports = DatabaseBackup;
