const express = require('express');
const { checkDatabaseHealth, getDatabaseStats } = require('../config/database');
const { getCacheStats } = require('../middleware/cacheMiddleware');
const { getConnectedClients, getRoomsInfo } = require('../utils/socketManager');
const { logger } = require('../utils/logger');
const { config } = require('../config/config');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   GET /api/monitoring/health
 * @desc    Get system health status
 * @access  Public
 */
router.get('/health', asyncHandler(async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
    database: dbHealth,
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  };

  if (dbHealth.status !== 'connected') {
    health.status = 'error';
  }

  res.json(health);
}));

/**
 * @route   GET /api/monitoring/metrics
 * @desc    Get detailed system metrics
 * @access  Admin
 */
router.get('/metrics', 
  authMiddleware(['admin']),
  asyncHandler(async (req, res) => {
    const [dbStats, cacheStats, socketInfo] = await Promise.all([
      getDatabaseStats(),
      getCacheStats(),
      getRoomsInfo()
    ]);

    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      database: dbStats,
      cache: cacheStats,
      socket: {
        connectedClients: getConnectedClients(),
        rooms: socketInfo
      }
    };

    res.json(metrics);
  })
);

/**
 * @route   GET /api/monitoring/logs
 * @desc    Get recent logs
 * @access  Admin
 */
router.get('/logs',
  authMiddleware(['admin']),
  asyncHandler(async (req, res) => {
    const { level = 'error', limit = 100, startDate, endDate } = req.query;

    const logs = await logger.getRecentLogs({
      level,
      limit: parseInt(limit),
      startDate,
      endDate
    });

    res.json(logs);
  })
);

/**
 * @route   GET /api/monitoring/performance
 * @desc    Get performance metrics
 * @access  Admin
 */
router.get('/performance',
  authMiddleware(['admin']),
  asyncHandler(async (req, res) => {
    const performance = {
      timestamp: new Date().toISOString(),
      memory: {
        ...process.memoryUsage(),
        heapStats: v8.getHeapStatistics(),
        heapSpaceStats: v8.getHeapSpaceStatistics()
      },
      cpu: process.cpuUsage(),
      resourceUsage: process.resourceUsage(),
      eventLoopUtilization: performance.eventLoopUtilization()
    };

    res.json(performance);
  })
);

/**
 * @route   POST /api/monitoring/gc
 * @desc    Trigger garbage collection
 * @access  Admin
 */
router.post('/gc',
  authMiddleware(['admin']),
  asyncHandler(async (req, res) => {
    if (global.gc) {
      const beforeMemory = process.memoryUsage();
      global.gc();
      const afterMemory = process.memoryUsage();

      res.json({
        message: 'Garbage collection completed',
        before: beforeMemory,
        after: afterMemory,
        freed: {
          heapTotal: beforeMemory.heapTotal - afterMemory.heapTotal,
          heapUsed: beforeMemory.heapUsed - afterMemory.heapUsed
        }
      });
    } else {
      res.status(400).json({
        message: 'Garbage collection not available. Run node with --expose-gc flag.'
      });
    }
  })
);

/**
 * @route   GET /api/monitoring/config
 * @desc    Get current configuration
 * @access  Admin
 */
router.get('/config',
  authMiddleware(['admin']),
  (req, res) => {
    // Filter out sensitive information
    const safeConfig = {
      ...config,
      jwt: { ...config.jwt, secret: undefined },
      email: { ...config.email, smtp: { ...config.email.smtp, auth: undefined } }
    };

    res.json(safeConfig);
  }
);

/**
 * @route   GET /api/monitoring/connections
 * @desc    Get active connections info
 * @access  Admin
 */
router.get('/connections',
  authMiddleware(['admin']),
  asyncHandler(async (req, res) => {
    const socketRooms = await getRoomsInfo();
    
    const connections = {
      timestamp: new Date().toISOString(),
      sockets: {
        total: getConnectedClients(),
        rooms: socketRooms
      },
      database: {
        status: (await checkDatabaseHealth()).status,
        connections: (await getDatabaseStats()).connections
      }
    };

    res.json(connections);
  })
);

/**
 * @route   POST /api/monitoring/test-notification
 * @desc    Send test notification
 * @access  Admin
 */
router.post('/test-notification',
  authMiddleware(['admin']),
  asyncHandler(async (req, res) => {
    const { type = 'email', recipient } = req.body;

    if (!recipient) {
      return res.status(400).json({
        message: 'Recipient is required'
      });
    }

    const notifications = require('../utils/notifications');
    let result;

    switch (type) {
      case 'email':
        result = await notifications.sendEmail({
          to: recipient,
          subject: 'Test Notification',
          template: 'test-notification',
          context: { timestamp: new Date().toISOString() }
        });
        break;
      case 'push':
        result = await notifications.sendPushNotification({
          userId: recipient,
          title: 'Test Notification',
          body: 'This is a test notification'
        });
        break;
      default:
        return res.status(400).json({
          message: 'Invalid notification type'
        });
    }

    res.json({
      message: 'Test notification sent',
      result
    });
  })
);

module.exports = router;
