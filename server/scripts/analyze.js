const { logger } = require('../utils/logger');
const database = require('../config/database');
const { cache } = require('../middleware/cacheMiddleware');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class Analyzer {
  constructor() {
    this.reports = [];
    this.reportsDir = path.join(__dirname, '../reports');
  }

  async analyze() {
    logger.info('Starting application analysis...');

    try {
      // Create reports directory if it doesn't exist
      await fs.mkdir(this.reportsDir, { recursive: true });

      // Run all analyses
      await this.analyzeSystem();
      await this.analyzeMemory();
      await this.analyzeDatabase();
      await this.analyzeCache();
      await this.analyzeEndpoints();
      await this.analyzePerformance();
      await this.generateReport();

      logger.info('Analysis completed successfully');
    } catch (error) {
      logger.error('Analysis failed:', error);
      throw error;
    }
  }

  async analyzeSystem() {
    logger.info('Analyzing system resources...');

    const cpus = os.cpus();
    const systemReport = {
      type: 'system',
      timestamp: new Date(),
      data: {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        cpus: {
          count: cpus.length,
          model: cpus[0].model,
          speed: cpus[0].speed,
          usage: cpus.map(cpu => {
            const total = Object.values(cpu.times).reduce((a, b) => a + b);
            const idle = cpu.times.idle;
            return ((total - idle) / total) * 100;
          })
        },
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          usage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
        },
        uptime: os.uptime(),
        loadAvg: os.loadavg()
      }
    };

    this.reports.push(systemReport);
  }

  async analyzeMemory() {
    logger.info('Analyzing memory usage...');

    const memoryReport = {
      type: 'memory',
      timestamp: new Date(),
      data: {
        process: process.memoryUsage(),
        heap: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
          external: process.memoryUsage().external,
          usage: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100
        },
        system: {
          total: os.totalmem(),
          free: os.freemem(),
          usage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
        }
      }
    };

    this.reports.push(memoryReport);
  }

  async analyzeDatabase() {
    logger.info('Analyzing database performance...');

    try {
      const stats = await database.getStats();
      const performance = await database.monitorPerformance();

      const dbReport = {
        type: 'database',
        timestamp: new Date(),
        data: {
          stats,
          performance,
          collections: await this.analyzeCollections(),
          indexes: await this.analyzeIndexes(),
          queries: await this.analyzeQueries()
        }
      };

      this.reports.push(dbReport);
    } catch (error) {
      logger.error('Database analysis failed:', error);
      throw error;
    }
  }

  async analyzeCollections() {
    const collections = await database.connection.db.collections();
    const results = [];

    for (const collection of collections) {
      const stats = await collection.stats();
      results.push({
        name: collection.collectionName,
        documents: stats.count,
        size: stats.size,
        avgObjSize: stats.avgObjSize,
        storageSize: stats.storageSize,
        indexes: stats.nindexes,
        totalIndexSize: stats.totalIndexSize
      });
    }

    return results;
  }

  async analyzeIndexes() {
    const collections = await database.connection.db.collections();
    const results = [];

    for (const collection of collections) {
      const indexes = await collection.indexes();
      results.push({
        collection: collection.collectionName,
        indexes: indexes.map(index => ({
          name: index.name,
          keys: index.key,
          unique: index.unique || false,
          sparse: index.sparse || false
        }))
      });
    }

    return results;
  }

  async analyzeQueries() {
    const collections = await database.connection.db.collections();
    const results = [];

    for (const collection of collections) {
      const explain = await collection.find({}).explain('executionStats');
      results.push({
        collection: collection.collectionName,
        executionStats: explain.executionStats
      });
    }

    return results;
  }

  async analyzeCache() {
    logger.info('Analyzing cache performance...');

    const cacheReport = {
      type: 'cache',
      timestamp: new Date(),
      data: {
        stats: cache.getStats(),
        keys: cache.keys().length,
        memory: process.memoryUsage().heapUsed,
        hitRate: (() => {
          const stats = cache.getStats();
          return stats.hits / (stats.hits + stats.misses) * 100;
        })(),
        distribution: (() => {
          const keys = cache.keys();
          const types = {};
          keys.forEach(key => {
            const type = key.split(':')[0];
            types[type] = (types[type] || 0) + 1;
          });
          return types;
        })()
      }
    };

    this.reports.push(cacheReport);
  }

  async analyzeEndpoints() {
    logger.info('Analyzing endpoint performance...');

    // Get endpoint metrics from the app
    const metrics = global.app?.locals?.metrics || {};

    const endpointReport = {
      type: 'endpoints',
      timestamp: new Date(),
      data: {
        total: Object.keys(metrics).length,
        metrics: Object.entries(metrics).map(([path, data]) => ({
          path,
          requests: data.requests,
          avgResponseTime: data.totalTime / data.requests,
          errors: data.errors,
          lastAccessed: data.lastAccessed
        })),
        mostUsed: Object.entries(metrics)
          .sort((a, b) => b[1].requests - a[1].requests)
          .slice(0, 5)
          .map(([path, data]) => ({
            path,
            requests: data.requests
          })),
        slowest: Object.entries(metrics)
          .sort((a, b) => (b[1].totalTime / b[1].requests) - (a[1].totalTime / a[1].requests))
          .slice(0, 5)
          .map(([path, data]) => ({
            path,
            avgResponseTime: data.totalTime / data.requests
          }))
      }
    };

    this.reports.push(endpointReport);
  }

  async analyzePerformance() {
    logger.info('Analyzing overall performance...');

    const performanceReport = {
      type: 'performance',
      timestamp: new Date(),
      data: {
        system: {
          cpu: {
            usage: os.loadavg()[0],
            cores: os.cpus().length
          },
          memory: {
            used: os.totalmem() - os.freemem(),
            total: os.totalmem()
          }
        },
        process: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        },
        metrics: global.app?.locals?.metrics || {}
      }
    };

    this.reports.push(performanceReport);
  }

  async generateReport() {
    const report = {
      timestamp: new Date(),
      summary: this.generateSummary(),
      reports: this.reports,
      recommendations: this.generateRecommendations()
    };

    // Save report
    const reportPath = path.join(this.reportsDir, `analysis-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    logger.info('Analysis report generated:', reportPath);
    return report;
  }

  generateSummary() {
    const dbReport = this.reports.find(r => r.type === 'database');
    const cacheReport = this.reports.find(r => r.type === 'cache');
    const memoryReport = this.reports.find(r => r.type === 'memory');

    return {
      status: 'healthy',
      metrics: {
        databaseSize: dbReport?.data.stats.database.dataSize || 0,
        cacheHitRate: cacheReport?.data.hitRate || 0,
        memoryUsage: memoryReport?.data.heap.usage || 0,
        uptime: process.uptime()
      }
    };
  }

  generateRecommendations() {
    const recommendations = [];

    // Memory recommendations
    const memoryReport = this.reports.find(r => r.type === 'memory');
    if (memoryReport?.data.heap.usage > 80) {
      recommendations.push({
        type: 'memory',
        severity: 'high',
        message: 'High memory usage detected. Consider increasing memory limit or optimizing memory usage.'
      });
    }

    // Cache recommendations
    const cacheReport = this.reports.find(r => r.type === 'cache');
    if (cacheReport?.data.hitRate < 50) {
      recommendations.push({
        type: 'cache',
        severity: 'medium',
        message: 'Low cache hit rate. Consider adjusting cache TTL or caching strategy.'
      });
    }

    // Database recommendations
    const dbReport = this.reports.find(r => r.type === 'database');
    if (dbReport) {
      const unusedIndexes = dbReport.data.indexes
        .filter(index => index.usage < 1000)
        .map(index => index.name);

      if (unusedIndexes.length > 0) {
        recommendations.push({
          type: 'database',
          severity: 'medium',
          message: `Consider removing unused indexes: ${unusedIndexes.join(', ')}`
        });
      }
    }

    return recommendations;
  }
}

// Run analysis if script is run directly
if (require.main === module) {
  const analyzer = new Analyzer();
  analyzer.analyze()
    .then(() => process.exit(0))
    .catch(error => {
      logger.error('Analysis script failed:', error);
      process.exit(1);
    });
}

module.exports = Analyzer;
