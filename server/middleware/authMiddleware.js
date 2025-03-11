const jwt = require('jsonwebtoken');
const { config } = require('../config/config');
const { logger } = require('../utils/logger');
const { APIError } = require('./errorMiddleware');
const User = require('../Models/user');

/**
 * Verify JWT token
 */
const verifyToken = async (token) => {
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(decoded.userId)
      .select('-password')
      .lean();

    if (!user) {
      throw new APIError('משתמש לא נמצא', 401, 'USER_NOT_FOUND');
    }

    if (!user.isActive) {
      throw new APIError('חשבון משתמש לא פעיל', 401, 'USER_INACTIVE');
    }

    return user;
  } catch (error) {
    if (error instanceof APIError) throw error;
    
    if (error.name === 'TokenExpiredError') {
      throw new APIError('טוקן פג תוקף', 401, 'TOKEN_EXPIRED');
    }
    
    throw new APIError('טוקן לא תקין', 401, 'INVALID_TOKEN');
  }
};

/**
 * Authentication middleware
 */
exports.authMiddleware = (roles = []) => {
  return async (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];

      if (!token) {
        throw new APIError('לא נמצא טוקן הזדהות', 401, 'NO_TOKEN');
      }

      const user = await verifyToken(token);

      // Check roles if specified
      if (roles.length && !roles.includes(user.role)) {
        throw new APIError('אין הרשאה מתאימה', 403, 'FORBIDDEN');
      }

      // Attach user to request
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't require authentication
 */
exports.optionalAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      const user = await verifyToken(token);
      req.user = user;
    }

    next();
  } catch (error) {
    // Don't throw error, just log it
    logger.debug('Optional auth failed:', error);
    next();
  }
};

/**
 * Role-based authorization middleware
 */
exports.authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new APIError('לא מורשה', 401, 'UNAUTHORIZED');
    }

    if (roles.length && !roles.includes(req.user.role)) {
      throw new APIError('אין הרשאה מתאימה', 403, 'FORBIDDEN');
    }

    next();
  };
};

/**
 * Resource ownership middleware
 */
exports.checkOwnership = (resourceType) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      const userId = req.user.id;

      let isOwner = false;

      switch (resourceType) {
        case 'professional':
          const professional = await Professional.findById(resourceId);
          isOwner = professional?.userId.toString() === userId;
          break;

        case 'appointment':
          const appointment = await Appointment.findById(resourceId);
          isOwner = appointment?.userId.toString() === userId ||
                    appointment?.professionalId.toString() === userId;
          break;

        case 'review':
          const review = await Review.findById(resourceId);
          isOwner = review?.userId.toString() === userId;
          break;

        case 'comment':
          const comment = await Comment.findById(resourceId);
          isOwner = comment?.userId.toString() === userId;
          break;

        default:
          throw new Error(`Unknown resource type: ${resourceType}`);
      }

      if (!isOwner) {
        throw new APIError('אין הרשאה לגשת למשאב זה', 403, 'FORBIDDEN');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Rate limiting middleware
 */
exports.rateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // limit each IP to 100 requests per windowMs
    message = 'יותר מדי בקשות, נסה שוב מאוחר יותר'
  } = options;

  const requests = new Map();

  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    
    // Clean old requests
    if (requests.has(ip)) {
      const userRequests = requests.get(ip);
      const validRequests = userRequests.filter(time => now - time < windowMs);
      
      if (validRequests.length >= max) {
        throw new APIError(message, 429, 'TOO_MANY_REQUESTS');
      }
      
      validRequests.push(now);
      requests.set(ip, validRequests);
    } else {
      requests.set(ip, [now]);
    }

    next();
  };
};

/**
 * CSRF protection middleware
 */
exports.csrfProtection = (req, res, next) => {
  // Only check POST, PUT, DELETE requests
  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
    return next();
  }

  const token = req.headers['x-csrf-token'];
  
  if (!token || token !== req.session.csrfToken) {
    throw new APIError('CSRF token לא תקין', 403, 'INVALID_CSRF_TOKEN');
  }

  next();
};

/**
 * Generate CSRF token
 */
exports.generateCsrfToken = (req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = require('crypto').randomBytes(32).toString('hex');
  }
  
  // Expose CSRF token in response headers
  res.set('X-CSRF-Token', req.session.csrfToken);
  next();
};
