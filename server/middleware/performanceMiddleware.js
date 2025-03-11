const { performance } = require('perf_hooks');
const { config } = require('../config/config');
const { logger } = require('../utils/logger');

/**
 * Performance monitoring middleware
 */
exports.performanceMiddleware = (options = {}) => {
  const {
    slowRequestThreshold = config.monitoring.slowRequestThreshold,
    excludePaths = ['/health', '/metrics'],
    sampleRate = 1.0 // 1.0 = monitor all requests, 0.5 = monitor 50% of requests
  } = options;

  return (req, res, next) => {
    // Skip excluded paths
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Apply sampling rate
    if (Math.random() > sampleRate) {
      return next();
    }

    // Start performance measurement
    const start = performance.now();
    const startTime = new Date();

    // Get initial memory usage
    const startMemory = process.memoryUsage();

    // Track response size
    let responseSize = 0;
    const originalWrite = res.write;
    const originalEnd = res.end;

    res.write = function(chunk) {
      responseSize += chunk.length;
      originalWrite.apply(res, arguments);
    };

    res.end = function(chunk) {
      if (chunk) {
        responseSize += chunk.length;
      }
      originalEnd.apply(res, arguments);
    };

    // After response is sent
    res.on('finish', () => {
      const duration = performance.now() - start;
      const endMemory = process.memoryUsage();

      // Calculate memory difference
      const memoryDiff = {
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
        external: endMemory.external - startMemory.external,
        arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers
      };

      // Prepare metrics
      const metrics = {
        timestamp: startTime.toISOString(),
        duration: Math.round(duration),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        responseSize,
        query: Object.keys(req.query).length,
        memory: memoryDiff,
        user: req.user?.id || 'anonymous',
        ip: req.ip,
        userAgent: req.get('user-agent')
      };

      // Log slow requests
      if (duration > slowRequestThreshold) {
        logger.warn('Slow request detected:', {
          ...metrics,
          threshold: slowRequestThreshold
        });
      }

      // Log metrics
      logger.info('Request metrics:', metrics);

      // Store metrics for monitoring
      storeMetrics(metrics);
    });

    next();
  };
};

// Store last 1000 requests for monitoring
const metricsStore = {
  requests: [],
  maxSize: 1000,
  
  add(metrics) {
    this.requests.push(metrics);
    if (this.requests.length > this.maxSize) {
      this.requests.shift();
    }
  },

  getStats() {
    if (this.requests.length === 0) return null;

    const durations = this.requests.map(r => r.duration);
    return {
      count: this.requests.length,
      duration: {
        min: Math.min(...durations),
        max: Math.max(...durations),
        avg: durations.reduce((a, b) => a + b, 0) / durations.length
      },
      status: this.requests.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {}),
      methods: this.requests.reduce((acc, r) => {
        acc[r.method] = (acc[r.method] || 0) + 1;
        return acc;
      }, {})
    };
  },

  getSlowRequests(threshold) {
    return this.requests
      .filter(r => r.duration > threshold)
      .sort((a, b) => b.duration - a.duration);
  },

  clear() {
    this.requests = [];
  }
};

/**
 * Store metrics
 */
const storeMetrics = (metrics) => {
  metricsStore.add(metrics);
};

/**
 * Get performance check middleware
 */
exports.performanceCheck = (threshold) => {
  return (req, res, next) => {
    const start = performance.now();

    res.on('finish', () => {
      const duration = performance.now() - start;
      if (duration > threshold) {
        logger.warn('Performance threshold exceeded:', {
          path: req.path,
          duration,
          threshold
        });
      }
    });

    next();
  };
};

/**
 * Memory usage middleware
 */
exports.memoryCheck = (threshold) => {
  return (req, res, next) => {
    const memoryUsage = process.memoryUsage();
    const heapUsed = memoryUsage.heapUsed / 1024 / 1024; // MB

    if (heapUsed > threshold) {
      logger.warn('High memory usage detected:', {
        heapUsed: `${heapUsed.toFixed(2)}MB`,
        threshold: `${threshold}MB`
      });

      // Optional: Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.info('Garbage collection triggered');
      }
    }

    next();
  };
};

/**
 * CPU usage middleware
 */
exports.cpuCheck = (threshold) => {
  return (req, res, next) => {
    const startUsage = process.cpuUsage();

    res.on('finish', () => {
      const endUsage = process.cpuUsage(startUsage);
      const totalUsage = (endUsage.user + endUsage.system) / 1000000; // seconds

      if (totalUsage > threshold) {
        logger.warn('High CPU usage detected:', {
          path: req.path,
          cpuTime: `${totalUsage.toFixed(2)}s`,
          threshold: `${threshold}s`
        });
      }
    });

    next();
  };
};

// Export metrics store for monitoring
exports.metricsStore = metricsStore;
