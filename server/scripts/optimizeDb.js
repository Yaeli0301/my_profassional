const mongoose = require('mongoose');
const { logger } = require('../utils/logger');
const database = require('../config/database');

class DatabaseOptimizer {
  constructor() {
    this.stats = {
      indexesOptimized: 0,
      collectionsAnalyzed: 0,
      queriesOptimized: 0,
      documentsCompressed: 0
    };
  }

  async optimize() {
    try {
      logger.info('Starting database optimization...');
      
      await database.connect();
      const db = mongoose.connection.db;
      
      // Get all collections
      const collections = await db.listCollections().toArray();
      
      for (const collection of collections) {
        await this.optimizeCollection(db, collection.name);
      }

      // Compact the database
      await db.command({ compact: 'admin' });
      
      logger.info('Database optimization completed', this.stats);
      
      return this.stats;
    } catch (error) {
      logger.error('Database optimization failed:', error);
      throw error;
    } finally {
      await database.disconnect();
    }
  }

  async optimizeCollection(db, collectionName) {
    const collection = db.collection(collectionName);
    logger.info(`Optimizing collection: ${collectionName}`);

    try {
      // Analyze collection
      const stats = await collection.stats();
      this.stats.collectionsAnalyzed++;

      // Optimize indexes
      await this.optimizeIndexes(collection, stats);

      // Analyze and optimize queries
      await this.analyzeQueries(collection);

      // Compact collection
      await db.command({ compact: collectionName });
      
      logger.info(`Collection ${collectionName} optimized successfully`);
    } catch (error) {
      logger.error(`Error optimizing collection ${collectionName}:`, error);
    }
  }

  async optimizeIndexes(collection, stats) {
    try {
      // Get existing indexes
      const indexes = await collection.indexes();
      
      // Find unused indexes
      const unusedIndexes = indexes.filter(index => 
        !index.name.startsWith('_id_') && // Keep _id index
        stats.indexSizes[index.name] > 0 && // Index has size
        !this.isIndexUseful(index)
      );

      // Drop unused indexes
      for (const index of unusedIndexes) {
        logger.info(`Dropping unused index ${index.name} on ${collection.collectionName}`);
        await collection.dropIndex(index.name);
        this.stats.indexesOptimized++;
      }

      // Create missing indexes based on common query patterns
      await this.createOptimalIndexes(collection);
    } catch (error) {
      logger.error(`Error optimizing indexes for ${collection.collectionName}:`, error);
    }
  }

  isIndexUseful(index) {
    // Add logic to determine if an index is useful based on your application's needs
    // This is a simplified example
    const usefulPatterns = [
      { updatedAt: 1 },
      { createdAt: 1 },
      { userId: 1 },
      { status: 1 },
      { type: 1 }
    ];

    return usefulPatterns.some(pattern => 
      Object.keys(pattern).every(key => index.key[key])
    );
  }

  async createOptimalIndexes(collection) {
    const optimalIndexes = [
      { 
        key: { updatedAt: 1 },
        expireAfterSeconds: 30 * 24 * 60 * 60 // 30 days TTL
      },
      {
        key: { status: 1, createdAt: -1 },
        background: true
      },
      {
        key: { userId: 1, type: 1 },
        background: true
      }
    ];

    for (const index of optimalIndexes) {
      try {
        await collection.createIndex(index.key, {
          background: true,
          ...index
        });
        this.stats.indexesOptimized++;
      } catch (error) {
        if (!error.message.includes('already exists')) {
          logger.error(`Error creating index on ${collection.collectionName}:`, error);
        }
      }
    }
  }

  async analyzeQueries(collection) {
    try {
      // Get query patterns from system.profile
      const queryPatterns = await this.getQueryPatterns(collection);

      // Optimize each query pattern
      for (const pattern of queryPatterns) {
        await this.optimizeQueryPattern(collection, pattern);
        this.stats.queriesOptimized++;
      }
    } catch (error) {
      logger.error(`Error analyzing queries for ${collection.collectionName}:`, error);
    }
  }

  async getQueryPatterns(collection) {
    // This is a simplified example. In a real application,
    // you would analyze the system.profile collection or application logs
    return [
      { op: 'query', query: { status: 1 }, sort: { createdAt: -1 } },
      { op: 'query', query: { userId: 1 }, sort: { updatedAt: -1 } }
    ];
  }

  async optimizeQueryPattern(collection, pattern) {
    try {
      // Create index for the query pattern if needed
      if (pattern.query && Object.keys(pattern.query).length > 0) {
        const indexKeys = { ...pattern.query };
        if (pattern.sort) {
          Object.assign(indexKeys, pattern.sort);
        }

        await collection.createIndex(indexKeys, { background: true });
      }
    } catch (error) {
      if (!error.message.includes('already exists')) {
        logger.error(`Error optimizing query pattern for ${collection.collectionName}:`, error);
      }
    }
  }
}

// Run optimization if executed directly
if (require.main === module) {
  const optimizer = new DatabaseOptimizer();
  optimizer.optimize()
    .then(() => process.exit(0))
    .catch(error => {
      logger.error('Optimization failed:', error);
      process.exit(1);
    });
}

module.exports = DatabaseOptimizer;
