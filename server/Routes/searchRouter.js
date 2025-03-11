const express = require('express');
const { body, query } = require('express-validator');
const { validationMiddleware } = require('../middleware/validationMiddleware');
const { cacheMiddleware } = require('../middleware/cacheMiddleware');
const { performanceCheck } = require('../middleware/performanceMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const searchController = require('../Controllers/searchController');

const router = express.Router();

/**
 * @route   GET /api/search/professionals
 * @desc    Search professionals with filters
 * @access  Public
 */
router.get('/professionals',
  [
    // Validation
    query('query')
      .optional()
      .trim()
      .isLength({ min: 2 })
      .withMessage('נדרשות לפחות 2 אותיות לחיפוש'),
    query('category')
      .optional()
      .isMongoId()
      .withMessage('קטגוריה לא תקינה'),
    query('city')
      .optional()
      .isMongoId()
      .withMessage('עיר לא תקינה'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('מספר עמוד חייב להיות מספר חיובי'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('מגבלת תוצאות חייבת להיות בין 1 ל-100'),
    query('sort')
      .optional()
      .isIn(['rating', 'reviews', 'price', 'createdAt'])
      .withMessage('סדר מיון לא תקין'),
    query('order')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('כיוון מיון לא תקין')
  ],
  validationMiddleware,
  cacheMiddleware({ ttl: 300 }), // Cache for 5 minutes
  performanceCheck(1000), // Monitor requests taking longer than 1 second
  asyncHandler(searchController.searchProfessionals)
);

/**
 * @route   GET /api/search/autocomplete
 * @desc    Get autocomplete suggestions
 * @access  Public
 */
router.get('/autocomplete',
  [
    query('q')
      .trim()
      .isLength({ min: 2 })
      .withMessage('נדרשות לפחות 2 אותיות לחיפוש')
  ],
  validationMiddleware,
  cacheMiddleware({ ttl: 60 }), // Cache for 1 minute
  asyncHandler(searchController.getAutocompleteSuggestions)
);

/**
 * @route   GET /api/search/popular
 * @desc    Get popular searches
 * @access  Public
 */
router.get('/popular',
  cacheMiddleware({ ttl: 3600 }), // Cache for 1 hour
  asyncHandler(searchController.getPopularSearches)
);

/**
 * @route   GET /api/search/related
 * @desc    Get related searches
 * @access  Public
 */
router.get('/related',
  [
    query('q')
      .trim()
      .notEmpty()
      .withMessage('נדרש מונח חיפוש')
  ],
  validationMiddleware,
  cacheMiddleware({ ttl: 1800 }), // Cache for 30 minutes
  asyncHandler(searchController.getRelatedSearches)
);

module.exports = router;
