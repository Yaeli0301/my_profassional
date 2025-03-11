const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const mkdirp = require('mkdirp');
const { config } = require('./config/config');
const { initializeDatabase } = require('./config/database');
const { logger, stream, logRequest } = require('./utils/logger');
const { performanceMiddleware } = require('./middleware/performanceMiddleware');
const { errorHandler, notFoundHandler } = require('./middleware/errorMiddleware');

// Initialize express app
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for development
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors(config.cors));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined', { stream }));
app.use(logRequest);

// Performance monitoring
app.use(performanceMiddleware());

// Static files
app.use('/static', express.static(path.join(__dirname, config.static.path), {
  maxAge: config.static.maxAge
}));

// API Routes
app.use(`${config.api.prefix}/search`, require('./Routes/searchRouter'));
app.use(`${config.api.prefix}/auth`, require('./Routes/authRouter'));
app.use(`${config.api.prefix}/users`, require('./Routes/userRouter'));
app.use(`${config.api.prefix}/professionals`, require('./Routes/professionalRouter'));
app.use(`${config.api.prefix}/appointments`, require('./Routes/appointmentRouter'));
app.use(`${config.api.prefix}/categories`, require('./Routes/categoryRouter'));
app.use(`${config.api.prefix}/cities`, require('./Routes/cityRouter'));
app.use(`${config.api.prefix}/comments`, require('./Routes/commentRouter'));
app.use(`${config.api.prefix}/reviews`, require('./Routes/reviewRouter'));
app.use(`${config.api.prefix}/services`, require('./Routes/serviceRouter'));
app.use(`${config.api.prefix}/monitoring`, require('./Routes/monitoringRouter'));

app.get('/test-cors', (req, res) => {
  res.json({ message: 'CORS is working!' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});


// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Initialize database and start server
const startServer = async () => {
  try {
    // Connect to database
    await initializeDatabase();

    // Create required directories
    await Promise.all([
      mkdirp(path.join(__dirname, 'logs/error')),
      mkdirp(path.join(__dirname, 'logs/combined')),
      mkdirp(path.join(__dirname, 'uploads')),
      mkdirp(path.join(__dirname, 'backup')),
      mkdirp(path.join(__dirname, 'backup/temp'))
    ].map(p => p.catch(err => {
      logger.warn(`Directory creation warning: ${err.message}`);
      return null;
    })));

    // Start server
    const server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.NODE_ENV} mode`);
    });

    // Initialize Socket.IO if enabled
    if (config.socket.enabled) {
      const { initializeSocket } = require('./utils/socketManager');
      initializeSocket(server);
      logger.info('Socket.IO initialized');
    }

    // Graceful shutdown handler
    const shutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);
      
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Shutdown timed out'));
        }, 10000); // 10 seconds timeout
      });

      try {
        // Close server and database
        await Promise.race([
          new Promise((resolve) => {
            server.close(() => {
              logger.info('Server closed');
              resolve();
            });
          }),
          timeoutPromise
        ]);

        await mongoose.connection.close();
        logger.info('Database connection closed');

        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Register shutdown handlers
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    signals.forEach(signal => {
      process.on(signal, () => shutdown(signal));
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Export for testing
module.exports = {
  app,
  startServer
};

// Start the server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
