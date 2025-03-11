const winston = require('winston');
const path = require('path');
const { config } = require('../config/config');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define level colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Add colors to Winston
winston.addColors(colors);

// Create format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Create format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: config.log.level || 'info',
  levels,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat
    }),

    // Error log file transport
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/error/error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),

    // Combined log file transport
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/combined/combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/error/exceptions.log')
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/error/rejections.log')
    })
  ]
});

/**
 * Stream object for Morgan integration
 */
const stream = {
  write: (message) => logger.http(message.trim())
};

/**
 * Request logging middleware
 */
const logRequest = (req, res, next) => {
  // Skip logging for health check endpoints
  if (req.path === '/health' || req.path === '/metrics') {
    return next();
  }

  const startTime = new Date();
  const requestId = req.id;

  // Log request
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      'user-agent': req.get('user-agent'),
      'content-type': req.get('content-type'),
      'accept': req.get('accept')
    },
    ip: req.ip,
    userId: req.user?.id
  });

  // Log response
  res.on('finish', () => {
    const duration = new Date() - startTime;
    
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });

  next();
};

/**
 * Get recent logs from file
 */
const getRecentLogs = async ({
  level = 'error',
  limit = 100,
  startDate,
  endDate
} = {}) => {
  try {
    const logFile = level === 'error' 
      ? path.join(__dirname, '../logs/error/error.log')
      : path.join(__dirname, '../logs/combined/combined.log');

    const logs = await new Promise((resolve, reject) => {
      const results = [];
      const stream = winston.stream({ file: logFile, start: -1 });

      stream.on('log', (log) => {
        // Apply filters
        if (startDate && log.timestamp < startDate) return;
        if (endDate && log.timestamp > endDate) return;
        if (level && log.level !== level) return;

        results.push(log);

        // Stop if we have enough logs
        if (results.length >= limit) {
          stream.close();
          resolve(results);
        }
      });

      stream.on('error', reject);
      stream.on('finish', () => resolve(results));
    });

    return logs;
  } catch (error) {
    logger.error('Error getting logs:', error);
    throw error;
  }
};

/**
 * Clean old logs
 */
const cleanOldLogs = async (days = 30) => {
  try {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - days);

    // Clean error logs
    const errorLogs = await getRecentLogs({ level: 'error' });
    const newErrorLogs = errorLogs.filter(log => 
      new Date(log.timestamp) > oldDate
    );

    // Clean combined logs
    const combinedLogs = await getRecentLogs();
    const newCombinedLogs = combinedLogs.filter(log => 
      new Date(log.timestamp) > oldDate
    );

    // Write new logs
    await Promise.all([
      fs.writeFile(
        path.join(__dirname, '../logs/error/error.log'),
        newErrorLogs.map(log => JSON.stringify(log)).join('\n')
      ),
      fs.writeFile(
        path.join(__dirname, '../logs/combined/combined.log'),
        newCombinedLogs.map(log => JSON.stringify(log)).join('\n')
      )
    ]);

    logger.info(`Cleaned logs older than ${days} days`);
  } catch (error) {
    logger.error('Error cleaning logs:', error);
    throw error;
  }
};

module.exports = {
  logger,
  stream,
  logRequest,
  getRecentLogs,
  cleanOldLogs
};
