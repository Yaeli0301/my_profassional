const { logger } = require('../utils/logger');
const { config } = require('../config/config');

/**
 * Custom API Error class
 */
class APIError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_SERVER_ERROR', details = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Async handler wrapper to eliminate try-catch blocks
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
  next(new APIError('הדף המבוקש לא נמצא', 404, 'NOT_FOUND'));
};

/**
 * Error response formatter
 */
const formatError = (error, includeStack = false) => {
  const response = {
    status: 'error',
    message: error.message || 'שגיאה לא צפויה',
    code: error.code || 'INTERNAL_SERVER_ERROR'
  };

  // Include error details if available
  if (error.details) {
    response.details = error.details;
  }

  // Include stack trace in development
  if (includeStack && error.stack && config.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  return response;
};

/**
 * Main error handler
 */
const errorHandler = (error, req, res, next) => {
  // Log error
  const logLevel = error.status >= 500 ? 'error' : 'warn';
  logger[logLevel]('Error occurred while processing the request:', {
    error: {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      query: req.query,
      body: req.body,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id
    }
  });

  // Set status code
  const statusCode = error.status || 500;
  res.status(statusCode);

  // Format and send error response
  const errorResponse = formatError(error, config.NODE_ENV === 'development');
  res.json(errorResponse);
};

/**
 * Validation error handler
 */
const handleValidationError = (error) => {
  if (error.name === 'ValidationError') {
    const details = Object.keys(error.errors).reduce((acc, key) => {
      acc[key] = error.errors[key].message;
      return acc;
    }, {});

    return new APIError(
      'שגיאת אימות נתונים',
      400,
      'VALIDATION_ERROR',
      details
    );
  }
  return error;
};

/**
 * MongoDB error handler
 */
const handleMongoError = (error) => {
  if (error.name === 'MongoError' || error.name === 'MongoServerError') {
    switch (error.code) {
      case 11000:
        return new APIError(
          'ערך כבר קיים במערכת',
          409,
          'DUPLICATE_KEY',
          error.keyValue
        );
      default:
        return new APIError(
          'שגיאת בסיס נתונים',
          500,
          'DATABASE_ERROR'
        );
    }
  }
  return error;
};

/**
 * JWT error handler
 */
const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return new APIError(
      'טוקן לא תקין',
      401,
      'INVALID_TOKEN'
    );
  }
  if (error.name === 'TokenExpiredError') {
    return new APIError(
      'טוקן פג תוקף',
      401,
      'TOKEN_EXPIRED'
    );
  }
  return error;
};

/**
 * File upload error handler
 */
const handleFileUploadError = (error) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new APIError(
      'גודל הקובץ חורג מהמותר',
      400,
      'FILE_TOO_LARGE'
    );
  }
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new APIError(
      'סוג קובץ לא נתמך',
      400,
      'UNSUPPORTED_FILE_TYPE'
    );
  }
  return error;
};

/**
 * Rate limit error handler
 */
const handleRateLimitError = (error) => {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    return new APIError(
      'יותר מדי בקשות, נסה שוב מאוחר יותר',
      429,
      'RATE_LIMIT_EXCEEDED'
    );
  }
  return error;
};

/**
 * Combine all error handlers
 */
const handleError = (error) => {
  return [
    handleValidationError,
    handleMongoError,
    handleJWTError,
    handleFileUploadError,
    handleRateLimitError
  ].reduce((err, handler) => handler(err), error);
};

/**
 * Final error handler middleware
 */
const finalErrorHandler = (error, req, res, next) => {
  const handledError = handleError(error);
  errorHandler(handledError, req, res, next);
};

module.exports = {
  APIError,
  asyncHandler,
  notFoundHandler,
  errorHandler: finalErrorHandler,
  handleError
};
