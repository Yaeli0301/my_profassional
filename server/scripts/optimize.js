const { logger } = require('../utils/logger');
const database = require('../config/database');
const { cache } = require('../middleware/cacheMiddleware');
const { config } = require('../config/config');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');

class SystemOptimizer {
  constructor() {
    this.optimizations = {
      database: [],
      cache: [],
      indexes: [],
      files: []
    };
  }

  async optimize() {
    logger.info('Starting system optimization...');

    try {
      // Connect to database if not connected
      if (!database.isConnected) {
        await database.connect();
      }

      // Run all optimizations
      await Promise.all([
        this.optimizeDatabase(),
        this.optimizeCache(),
        this.optimizeIndexes(),
        this.optimizeFiles()
      ]);

      logger.info('System optimization completed successfully');
      return this.optimizations;
    } catch (error) {
      logger.error('System optimization failed:', error);
      throw error;
    }
  }

  async optimizeDatabase() {
    logger.info('Optimizing database...');

    try {
      // Get database stats before optimization
      const statsBefore = await database.getStats();

      // Run database optimizations
      const optimizations = await Promise.all([
        this.compactCollections(),
        this.repairIndexes(),
        this.updateStatistics(),
        this.cleanupOrphanedDocuments()
      ]);

      // Get database stats after optimization
      const statsAfter = await database.getStats();

      this.optimizations.database = {
        sizeBefore: statsBefore.size,
        sizeAfter: statsAfter.size,
        spaceReclaimed: statsBefore.size - statsAfter.size,
        optimizations: optimizations.flat()
      };

      logger.info('Database optimization completed');
    } catch (error) {
      logger.error('Database optimization failed:', error);
      throw error;
    }
  }

  async compactCollections() {
    const optimizations = [];
    const collections = await mongoose.connection.db.listCollections().toArray();

    for (const collection of collections) {
      try {
        const statsBefore = await mongoose.connection.db
          .collection(collection.name)
          .stats();

        await mongoose.connection.db.command({
          compact: collection.name,
          force: true
        });

        const statsAfter = await mongoose.connection.db
          .collection(collection.name)
          .stats();

        optimizations.push({
          type: 'compact',
          collection: collection.name,
          sizeBefore: statsBefore.size,
          sizeAfter: statsAfter.size,
          spaceReclaimed: statsBefore.size - statsAfter.size
        });
      } catch (error) {
        logger.error(`Failed to compact collection ${collection.name}:`, error);
      }
    }

    return optimizations;
  }

  async repairIndexes() {
    const optimizations = [];
    const collections = await mongoose.connection.db.listCollections().toArray();

    for (const collection of collections) {
      try {
        const indexes = await mongoose.connection.db
          .collection(collection.name)
          .indexes();

        for (const index of indexes) {
          await mongoose.connection.db.command({
            reIndex: collection.name,
            index: index.name
          });

          optimizations.push({
            type: 'reindex',
            collection: collection.name,
            index: index.name
          });
        }
      } catch (error) {
        logger.error(`Failed to repair indexes for ${collection.name}:`, error);
      }
    }

    return optimizations;
  }

  async updateStatistics() {
    const optimizations = [];
    const collections = await mongoose.connection.db.listCollections().toArray();

    for (const collection of collections) {
      try {
        await mongoose.connection.db.command({
          analyzeShardKey: collection.name
        });

        optimizations.push({
          type: 'statistics',
          collection: collection.name
        });
      } catch (error) {
        logger.error(`Failed to update statistics for ${collection.name}:`, error);
      }
    }

    return optimizations;
  }

  async cleanupOrphanedDocuments() {
    const optimizations = [];
    const models = mongoose.models;

    for (const [modelName, model] of Object.entries(models)) {
      try {
        // Find and remove documents with broken references
        const schema = model.schema;
        const refs = this.findSchemaReferences(schema);

        for (const ref of refs) {
          const count = await model.countDocuments({
            [ref.path]: { $exists: true },
            $where: `this.${ref.path} != null`
          });

          if (count > 0) {
            await model.deleteMany({
              [ref.path]: { $exists: true },
              $where: `this.${ref.path} != null`
            });

            optimizations.push({
              type: 'cleanup',
              model: modelName,
              reference: ref.path,
              documentsRemoved: count
            });
          }
        }
      } catch (error) {
        logger.error(`Failed to cleanup orphaned documents for ${modelName}:`, error);
      }
    }

    return optimizations;
  }

  findSchemaReferences(schema, path = '') {
    const refs = [];

    schema.eachPath((pathname, schemaType) => {
      const fullPath = path ? `${path}.${pathname}` : pathname;

      if (schemaType.options.ref) {
        refs.push({
          path: fullPath,
          model: schemaType.options.ref
        });
      } else if (schemaType.schema) {
        refs.push(...this.findSchemaReferences(schemaType.schema, fullPath));
      }
    });

    return refs;
  }

  async optimizeCache() {
    logger.info('Optimizing cache...');

    try {
      const statsBefore = cache.getStats();

      // Clear expired entries
      const expiredKeys = await this.clearExpiredCache();

      // Preload frequently accessed data
      const preloadedKeys = await this.preloadCache();

      // Optimize memory usage
      const memoryOptimization = await this.optimizeCacheMemory();

      this.optimizations.cache = {
        statsBefore,
        statsAfter: cache.getStats(),
        expiredKeysRemoved: expiredKeys.length,
        preloadedKeys: preloadedKeys.length,
        memoryOptimization
      };

      logger.info('Cache optimization completed');
    } catch (error) {
      logger.error('Cache optimization failed:', error);
      throw error;
    }
  }

  async clearExpiredCache() {
    const expiredKeys = [];
    const keys = cache.keys();

    for (const key of keys) {
      if (!cache.get(key)) {
        cache.del(key);
        expiredKeys.push(key);
      }
    }

    return expiredKeys;
  }

  async preloadCache() {
    const preloadedKeys = [];

    // Preload frequently accessed data
    const commonData = [
      { key: 'categories', model: 'Category' },
      { key: 'cities', model: 'City' }
    ];

    for (const data of commonData) {
      try {
        const items = await mongoose.model(data.model).find();
        cache.set(data.key, items, config.cache.ttl);
        preloadedKeys.push(data.key);
      } catch (error) {
        logger.error(`Failed to preload ${data.key}:`, error);
      }
    }

    return preloadedKeys;
  }

  async optimizeCacheMemory() {
    const memoryBefore = process.memoryUsage().heapUsed;

    // Remove duplicate values
    const keys = cache.keys();
    const values = new Map();

    for (const key of keys) {
      const value = cache.get(key);
      const valueStr = JSON.stringify(value);

      if (values.has(valueStr)) {
        cache.del(key);
      } else {
        values.set(valueStr, key);
      }
    }

    const memoryAfter = process.memoryUsage().heapUsed;

    return {
      memoryBefore,
      memoryAfter,
      memorySaved: memoryBefore - memoryAfter
    };
  }

  async optimizeIndexes() {
    logger.info('Optimizing indexes...');

    try {
      // Get current indexes
      const currentIndexes = await this.getCurrentIndexes();

      // Analyze index usage
      const unusedIndexes = await this.findUnusedIndexes();

      // Remove unused indexes
      const removedIndexes = await this.removeUnusedIndexes(unusedIndexes);

      // Create missing indexes
      const addedIndexes = await this.createMissingIndexes();

      this.optimizations.indexes = {
        before: currentIndexes.length,
        removed: removedIndexes.length,
        added: addedIndexes.length,
        after: currentIndexes.length - removedIndexes.length + addedIndexes.length
      };

      logger.info('Index optimization completed');
    } catch (error) {
      logger.error('Index optimization failed:', error);
      throw error;
    }
  }

  async getCurrentIndexes() {
    const indexes = [];
    const collections = await mongoose.connection.db.listCollections().toArray();

    for (const collection of collections) {
      const collectionIndexes = await mongoose.connection.db
        .collection(collection.name)
        .indexes();
      indexes.push(...collectionIndexes);
    }

    return indexes;
  }

  async findUnusedIndexes() {
    const unusedIndexes = [];
    const collections = await mongoose.connection.db.listCollections().toArray();

    for (const collection of collections) {
      const stats = await mongoose.connection.db
        .collection(collection.name)
        .aggregate([{ $indexStats: {} }])
        .toArray();

      for (const stat of stats) {
        if (stat.accesses.ops === 0 && !stat.name.includes('_id_')) {
          unusedIndexes.push({
            collection: collection.name,
            index: stat.name
          });
        }
      }
    }

    return unusedIndexes;
  }

  async removeUnusedIndexes(unusedIndexes) {
    const removedIndexes = [];

    for (const index of unusedIndexes) {
      try {
        await mongoose.connection.db
          .collection(index.collection)
          .dropIndex(index.index);
        removedIndexes.push(index);
      } catch (error) {
        logger.error(`Failed to remove index ${index.index}:`, error);
      }
    }

    return removedIndexes;
  }

  async createMissingIndexes() {
    const addedIndexes = [];
    const models = mongoose.models;

    for (const [modelName, model] of Object.entries(models)) {
      try {
        const indexes = await model.createIndexes();
        addedIndexes.push(...indexes);
      } catch (error) {
        logger.error(`Failed to create indexes for ${modelName}:`, error);
      }
    }

    return addedIndexes;
  }

  async optimizeFiles() {
    logger.info('Optimizing files...');

    try {
      // Clean up temporary files
      const tempFiles = await this.cleanupTempFiles();

      // Remove orphaned uploads
      const orphanedFiles = await this.cleanupOrphanedFiles();

      // Organize uploads directory
      const organizedFiles = await this.organizeUploads();

      this.optimizations.files = {
        tempFilesRemoved: tempFiles.length,
        orphanedFilesRemoved: orphanedFiles.length,
        filesOrganized: organizedFiles.length
      };

      logger.info('File optimization completed');
    } catch (error) {
      logger.error('File optimization failed:', error);
      throw error;
    }
  }

  async cleanupTempFiles() {
    const removedFiles = [];
    const tempDir = path.join(__dirname, '../uploads/temp');

    try {
      const files = await fs.readdir(tempDir);

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        const hourOld = Date.now() - (60 * 60 * 1000);

        if (stats.mtimeMs < hourOld) {
          await fs.unlink(filePath);
          removedFiles.push(file);
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup temp files:', error);
    }

    return removedFiles;
  }

  async cleanupOrphanedFiles() {
    const removedFiles = [];
    const uploadsDir = path.join(__dirname, '../uploads');

    try {
      const files = await this.getAllFiles(uploadsDir);
      const dbFiles = await this.getDbFiles();

      for (const file of files) {
        const relativePath = path.relative(uploadsDir, file);
        if (!dbFiles.includes(relativePath)) {
          await fs.unlink(file);
          removedFiles.push(relativePath);
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup orphaned files:', error);
    }

    return removedFiles;
  }

  async getAllFiles(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.getAllFiles(fullPath)));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  async getDbFiles() {
    const files = [];
    const models = mongoose.models;

    for (const model of Object.values(models)) {
      const schema = model.schema;
      const fileFields = this.findFileFields(schema);

      if (fileFields.length > 0) {
        const documents = await model.find({}, fileFields.join(' '));
        for (const doc of documents) {
          fileFields.forEach(field => {
            if (doc[field]) {
              files.push(doc[field]);
            }
          });
        }
      }
    }

    return files;
  }

  findFileFields(schema, prefix = '') {
    const fields = [];

    schema.eachPath((pathname, schemaType) => {
      const fullPath = prefix ? `${prefix}.${pathname}` : pathname;

      if (schemaType.instance === 'String' && 
          (pathname.includes('image') || pathname.includes('file'))) {
        fields.push(fullPath);
      } else if (schemaType.schema) {
        fields.push(...this.findFileFields(schemaType.schema, fullPath));
      }
    });

    return fields;
  }

  async organizeUploads() {
    const organizedFiles = [];
    const uploadsDir = path.join(__dirname, '../uploads');

    try {
      const files = await this.getAllFiles(uploadsDir);

      for (const file of files) {
        const stats = await fs.stat(file);
        const month = new Date(stats.birthtime).toISOString().slice(0, 7);
        const targetDir = path.join(uploadsDir, month);

        await fs.mkdir(targetDir, { recursive: true });
        const targetPath = path.join(targetDir, path.basename(file));

        if (file !== targetPath) {
          await fs.rename(file, targetPath);
          organizedFiles.push(path.basename(file));
        }
      }
    } catch (error) {
      logger.error('Failed to organize uploads:', error);
    }

    return organizedFiles;
  }
}

// Handle direct script execution
if (require.main === module) {
  const optimizer = new SystemOptimizer();
  optimizer.optimize()
    .then(optimizations => {
      console.log('Optimization results:', JSON.stringify(optimizations, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Optimization failed:', error);
      process.exit(1);
    });
}

module.exports = SystemOptimizer;
