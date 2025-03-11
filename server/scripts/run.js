const { logger } = require('../utils/logger');
const { config } = require('../config/config');
const database = require('../config/database');
const path = require('path');
const fs = require('fs').promises;

async function ensureDirectories() {
  const directories = [
    path.join(__dirname, '../logs/error'),
    path.join(__dirname, '../logs/combined'),
    path.join(__dirname, '../uploads'),
    path.join(__dirname, '../backup'),
    path.join(__dirname, '../backup/temp')
  ];

  for (const dir of directories) {
    try {
      await fs.mkdir(dir, { recursive: true });
      logger.info(`Directory created/verified: ${dir}`);
    } catch (error) {
      logger.error(`Failed to create directory: ${dir}`, error);
      throw error;
    }
  }
}

function maskConnectionString(uri) {
  if (!uri) return 'Not configured';
  try {
    const url = new URL(uri);
    if (url.password) {
      url.password = '****';
    }
    return url.toString();
  } catch (error) {
    return 'Invalid connection string';
  }
}

async function startServer() {
  try {
    // Ensure required directories exist
    await ensureDirectories();

    // Connect to database with retry logic
    let dbConnected = false;
    let retryCount = 0;
    const maxRetries = 3;

    while (!dbConnected && retryCount < maxRetries) {
      try {
        await database.connect();
        dbConnected = true;
        logger.info('Database connection established successfully');
      } catch (error) {
        retryCount++;
        if (retryCount === maxRetries) {
          logger.error('Failed to connect to database after maximum retries:', error);
          throw error;
        }
        logger.warn(`Database connection attempt ${retryCount} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
      }
    }

    // Import and start server
    const app = require('../server');
    const port = config.port;

    const server = app.listen(port, () => {
      logger.info(`Server running in ${config.NODE_ENV} mode on port ${port}`);
      
      // Log server configuration with masked sensitive data
      logger.info('Server configuration:', {
        environment: config.NODE_ENV,
        port: config.port,
        database: config.isDevelopment ? 'in-memory' : maskConnectionString(config.db.uri),
        cors: config.cors.origin,
        monitoring: config.monitoring.enabled ? 'enabled' : 'disabled',
        clustering: config.clustering.enabled ? 'enabled' : 'disabled'
      });
    });

    // Handle server errors
    server.on('error', (error) => {
      logger.error('Server error:', error);
      gracefulShutdown(server, 'server error');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      gracefulShutdown(server, 'uncaught exception');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown(server, 'unhandled rejection');
    });

    // Handle termination signals
    process.on('SIGTERM', () => gracefulShutdown(server, 'SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown(server, 'SIGINT'));

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function gracefulShutdown(server, signal) {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  let shutdownComplete = false;
  
  // Set a timeout for the shutdown process
  const shutdownTimeout = setTimeout(() => {
    if (!shutdownComplete) {
      logger.error('Shutdown timed out, forcing exit');
      process.exit(1);
    }
  }, config.shutdown.timeout || 30000);

  try {
    // Stop accepting new requests
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Close database connection
    await database.disconnect();
    logger.info('Database connection closed');

    // Clear shutdown timeout
    clearTimeout(shutdownTimeout);
    shutdownComplete = true;

    // Exit process
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    if (!shutdownComplete) {
      process.exit(1);
    }
  }
}

// Start server if running directly
if (require.main === module) {
  startServer();
}

module.exports = startServer;
