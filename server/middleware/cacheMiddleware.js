const NodeCache = require('node-cache');
const { config } = require('../config/config');
const { logger } = require('../utils/logger');

// Initialize cache with configuration
const cache = new NodeCache({
  stdTTL: config.cache.ttl,
  checkperiod: config.cache.checkPeriod,
  maxKeys: config.cache.maxKeys,
  useClones: false
});

/**
 * Generate cache key from request
 */
const generateCacheKey = (req) => {
  const parts = [
    req.originalUrl || req.url,
    req.method,
    // Include user ID if authenticated to handle user-specific caching
    req.user?.id || 'anonymous'
  ];

  // Add query parameters if present
  if (Object.keys(req.query).length > 0) {
    parts.push(JSON.stringify(req.query));
  }

  // Add body for POST/PUT requests
  if (['POST', 'PUT'].includes(req.method) && Object.keys(req.body).length > 0) {
    parts.push(JSON.stringify(req.body));
  }

  return parts.join('|');
};

/**
 * Cache middleware
 */
exports.cacheMiddleware = (options = {}) => {
  const {
    ttl = config.cache.ttl,
    key = generateCacheKey,
    condition = () => true
  } = options;

  return async (req, res, next) => {
    // Skip caching if condition is not met
    if (!condition(req)) {
      return next();
    }

    const cacheKey = typeof key === 'function' ? key(req) : key;

    try {
      // Try to get from cache
      const cachedResponse = cache.get(cacheKey);
      
      if (cachedResponse) {
        logger.debug('Cache hit:', { key: cacheKey });
        return res.json(cachedResponse);
      }

      // Store original json method
      const originalJson = res.json;

      // Override json method to cache the response
      res.json = function(data) {
        // Don't cache errors
        if (res.statusCode < 400) {
          cache.set(cacheKey, data, ttl);
          logger.debug('Cache set:', { key: cacheKey, ttl });
        }

        // Call original json method
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logger.error('Cache error:', error);
      next();
    }
  };
};

/**
 * Clear cache by pattern
 */
exports.clearCache = (pattern) => {
  try {
    if (pattern) {
      const keys = cache.keys();
      const matchingKeys = keys.filter(key => key.includes(pattern));
      cache.del(matchingKeys);
      logger.info('Cache cleared by pattern:', { pattern, count: matchingKeys.length });
    } else {
      cache.flushAll();
      logger.info('Cache completely cleared');
    }
  } catch (error) {
    logger.error('Cache clear error:', error);
  }
};

/**
 * Get cache statistics
 */
exports.getCacheStats = () => {
  try {
    return {
      keys: cache.keys().length,
      hits: cache.getStats().hits,
      misses: cache.getStats().misses,
      ksize: cache.getStats().ksize,
      vsize: cache.getStats().vsize
    };
  } catch (error) {
    logger.error('Get cache stats error:', error);
    return {};
  }
};

/**
 * Cache tags for different types of data
 */
exports.cacheTags = {
  PROFESSIONALS: 'professionals',
  CATEGORIES: 'categories',
  CITIES: 'cities',
  SERVICES: 'services',
  APPOINTMENTS: 'appointments',
  REVIEWS: 'reviews',
  COMMENTS: 'comments',
  USERS: 'users'
};

/**
 * Cache key builders for common scenarios
 */
exports.cacheKeys = {
  // List endpoints
  listKey: (resource, query = {}) => 
    `${resource}|list|${JSON.stringify(query)}`,

  // Detail endpoints
  detailKey: (resource, id) => 
    `${resource}|detail|${id}`,

  // Search endpoints
  searchKey: (resource, query) => 
    `${resource}|search|${JSON.stringify(query)}`,

  // User-specific data
  userKey: (userId, resource) => 
    `users|${userId}|${resource}`,

  // Professional-specific data
  professionalKey: (professionalId, resource) => 
    `professionals|${professionalId}|${resource}`
};

/**
 * Cache conditions for common scenarios
 */
exports.cacheConditions = {
  // Only cache GET requests
  onlyGet: (req) => req.method === 'GET',

  // Only cache for non-authenticated requests
  publicOnly: (req) => !req.user,

  // Cache for specific roles
  forRoles: (roles) => (req) => !req.user || roles.includes(req.user.role),

  // Don't cache if specific query params present
  unlessParams: (params) => (req) => 
    !params.some(param => param in req.query),

  // Combine multiple conditions
  all: (...conditions) => (req) => 
    conditions.every(condition => condition(req))
};

/**
 * Cache helpers for route handlers
 */
exports.cacheHelpers = {
  // Invalidate cache for a resource
  invalidateResource: (resource) => {
    exports.clearCache(resource);
  },

  // Invalidate cache for a specific item
  invalidateItem: (resource, id) => {
    exports.clearCache(`${resource}|detail|${id}`);
    exports.clearCache(`${resource}|list`);
  },

  // Invalidate user-specific cache
  invalidateUserCache: (userId) => {
    exports.clearCache(`users|${userId}`);
  },

  // Invalidate professional-specific cache
  invalidateProfessionalCache: (professionalId) => {
    exports.clearCache(`professionals|${professionalId}`);
  }
};
