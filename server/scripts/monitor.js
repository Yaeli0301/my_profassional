const mongoose = require('mongoose');
const { logger } = require('../utils/logger');
const database = require('../config/database');
const os = require('os');
const { EventEmitter } = require('events');

class DatabaseMonitor extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      system: {
        cpu: [],
        memory: [],
        loadAvg: []
      },
      database: {
        connections: [],
        operations: [],
        latency: [],
        memory: []
      },
      queries: {
        slow: [],
        failed: []
      },
      collections: new Map()
    };

    this.thresholds = {
      slowQueryMs: 1000,
      highMemoryUsage: 0.85, // 85% of system memory
      highCpuUsage: 0.80,    // 80% CPU usage
      maxConnections: 1000
    };

    this.interval = null;
    this.isMonitoring = false;
  }

  async start(intervalMs = 60000) {
    if (this.isMonitoring) {
      logger.warn('Monitoring is already running');
      return;
    }

    try {
      this.isMonitoring = true;
      logger.info('Starting database monitoring...');

      // Connect to database if not connected
      if (!database.isConnected) {
        await database.connect();
      }

      // Initial collection of metrics
      await this.collectMetrics();

      // Set up periodic monitoring
      this.interval = setInterval(async () => {
        try {
          await this.collectMetrics();
          await this.analyzeMetrics();
        } catch (error) {
          logger.error('Error collecting metrics:', error);
        }
      }, intervalMs);

      // Monitor mongoose operations
      this.setupMongooseMonitoring();

    } catch (error) {
      logger.error('Failed to start monitoring:', error);
      this.isMonitoring = false;
      throw error;
    }
  }

  async stop() {
    if (!this.isMonitoring) {
      return;
    }

    clearInterval(this.interval);
    this.isMonitoring = false;
    logger.info('Database monitoring stopped');
  }

  setupMongooseMonitoring() {
    mongoose.connection.on('query', (query) => {
      const startTime = Date.now();
      
      query.on('end', () => {
        const duration = Date.now() - startTime;
        
        if (duration > this.thresholds.slowQueryMs) {
          this.metrics.queries.slow.push({
            timestamp: new Date(),
            query: query.query,
            duration,
            collection: query.model?.collection?.name
          });

          this.emit('slowQuery', {
            duration,
            query: query.query,
            collection: query.model?.collection?.name
          });
        }
      });
    });
  }

  async collectMetrics() {
    try {
      // System metrics
      const systemMetrics = this.collectSystemMetrics();
      this.metrics.system.cpu.push(systemMetrics.cpu);
      this.metrics.system.memory.push(systemMetrics.memory);
      this.metrics.system.loadAvg.push(systemMetrics.loadAvg);

      // Database metrics
      const dbMetrics = await this.collectDatabaseMetrics();
      this.metrics.database.connections.push(dbMetrics.connections);
      this.metrics.database.operations.push(dbMetrics.operations);
      this.metrics.database.latency.push(dbMetrics.latency);
      this.metrics.database.memory.push(dbMetrics.memory);

      // Collection metrics
      await this.collectCollectionMetrics();

      // Trim metrics arrays to keep last 24 hours of data (assuming 1-minute intervals)
      const maxDataPoints = 1440; // 24 hours * 60 minutes
      this.trimMetricsArrays(maxDataPoints);

    } catch (error) {
      logger.error('Error collecting metrics:', error);
      throw error;
    }
  }

  collectSystemMetrics() {
    return {
      timestamp: new Date(),
      cpu: os.loadavg()[0] / os.cpus().length, // CPU usage as percentage
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem()
      },
      loadAvg: os.loadavg()
    };
  }

  async collectDatabaseMetrics() {
    const db = mongoose.connection.db;
    const adminDb = db.admin();
    
    const [serverStatus, dbStats] = await Promise.all([
      adminDb.serverStatus(),
      db.stats()
    ]);

    return {
      timestamp: new Date(),
      connections: serverStatus.connections,
      operations: serverStatus.opcounters,
      latency: serverStatus.operationLatencies || {},
      memory: {
        virtual: serverStatus.mem.virtual,
        resident: serverStatus.mem.resident,
        mapped: serverStatus.mem.mapped
      },
      dbStats: {
        dataSize: dbStats.dataSize,
        storageSize: dbStats.storageSize,
        indexes: dbStats.indexes,
        indexSize: dbStats.indexSize
      }
    };
  }

  async collectCollectionMetrics() {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    for (const collection of collections) {
      const stats = await db.collection(collection.name).stats();
      this.metrics.collections.set(collection.name, {
        timestamp: new Date(),
        size: stats.size,
        count: stats.count,
        avgObjSize: stats.avgObjSize,
        storageSize: stats.storageSize,
        indexes: stats.nindexes,
        indexSize: stats.totalIndexSize
      });
    }
  }

  async analyzeMetrics() {
    const alerts = [];
    const currentMetrics = {
      system: {
        cpu: this.metrics.system.cpu[this.metrics.system.cpu.length - 1],
        memory: this.metrics.system.memory[this.metrics.system.memory.length - 1]
      },
      database: {
        connections: this.metrics.database.connections[this.metrics.database.connections.length - 1],
        operations: this.metrics.database.operations[this.metrics.database.operations.length - 1]
      }
    };

    // Check system metrics
    if (currentMetrics.system.cpu > this.thresholds.highCpuUsage) {
      alerts.push({
        level: 'warning',
        type: 'highCpuUsage',
        value: currentMetrics.system.cpu,
        threshold: this.thresholds.highCpuUsage
      });
    }

    const memoryUsage = 1 - (currentMetrics.system.memory.free / currentMetrics.system.memory.total);
    if (memoryUsage > this.thresholds.highMemoryUsage) {
      alerts.push({
        level: 'warning',
        type: 'highMemoryUsage',
        value: memoryUsage,
        threshold: this.thresholds.highMemoryUsage
      });
    }

    // Check database metrics
    if (currentMetrics.database.connections.current > this.thresholds.maxConnections) {
      alerts.push({
        level: 'critical',
        type: 'tooManyConnections',
        value: currentMetrics.database.connections.current,
        threshold: this.thresholds.maxConnections
      });
    }

    // Emit alerts
    if (alerts.length > 0) {
      this.emit('alerts', alerts);
      logger.warn('Database monitoring alerts:', alerts);
    }

    return alerts;
  }

  trimMetricsArrays(maxLength) {
    Object.keys(this.metrics.system).forEach(key => {
      if (this.metrics.system[key].length > maxLength) {
        this.metrics.system[key] = this.metrics.system[key].slice(-maxLength);
      }
    });

    Object.keys(this.metrics.database).forEach(key => {
      if (this.metrics.database[key].length > maxLength) {
        this.metrics.database[key] = this.metrics.database[key].slice(-maxLength);
      }
    });

    if (this.metrics.queries.slow.length > maxLength) {
      this.metrics.queries.slow = this.metrics.queries.slow.slice(-maxLength);
    }
  }

  getMetricsReport() {
    return {
      timestamp: new Date(),
      system: {
        cpu: this.calculateAverages(this.metrics.system.cpu),
        memory: this.calculateAverages(this.metrics.system.memory),
        loadAvg: this.calculateAverages(this.metrics.system.loadAvg)
      },
      database: {
        connections: this.calculateAverages(this.metrics.database.connections),
        operations: this.calculateAverages(this.metrics.database.operations),
        latency: this.calculateAverages(this.metrics.database.latency),
        memory: this.calculateAverages(this.metrics.database.memory)
      },
      queries: {
        slow: this.metrics.queries.slow.length,
        failed: this.metrics.queries.failed.length
      },
      collections: Array.from(this.metrics.collections.entries()).map(([name, stats]) => ({
        name,
        ...stats
      }))
    };
  }

  calculateAverages(array) {
    if (!array.length) return null;
    if (typeof array[0] === 'number') {
      return array.reduce((a, b) => a + b, 0) / array.length;
    }
    return array[array.length - 1]; // Return most recent for objects
  }
}

// Run monitoring if executed directly
if (require.main === module) {
  const monitor = new DatabaseMonitor();
  
  monitor.on('alerts', (alerts) => {
    logger.warn('Monitoring alerts:', alerts);
  });

  monitor.start()
    .then(() => {
      logger.info('Database monitoring started');
    })
    .catch(error => {
      logger.error('Failed to start monitoring:', error);
      process.exit(1);
    });

  // Handle process termination
  process.on('SIGTERM', async () => {
    await monitor.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await monitor.stop();
    process.exit(0);
  });
}

module.exports = DatabaseMonitor;
