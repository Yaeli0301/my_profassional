const { validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const { APIError } = require('./errorMiddleware');

/**
 * Validation middleware
 * Checks for validation errors and formats them
 */
exports.validationMiddleware = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().reduce((acc, error) => {
      acc[error.param] = error.msg;
      return acc;
    }, {});

    logger.debug('Validation errors:', {
      path: req.path,
      errors: formattedErrors
    });

    throw new APIError('שגיאת אימות נתונים', 400, 'VALIDATION_ERROR', formattedErrors);
  }
  
  next();
};

/**
 * Common validation rules
 */
exports.commonValidations = {
  // Pagination
  pagination: {
    page: {
      optional: true,
      isInt: { min: 1 },
      toInt: true,
      errorMessage: 'מספר עמוד חייב להיות מספר חיובי'
    },
    limit: {
      optional: true,
      isInt: { min: 1, max: 100 },
      toInt: true,
      errorMessage: 'מגבלת תוצאות חייבת להיות בין 1 ל-100'
    }
  },

  // IDs
  mongoId: {
    isMongoId: true,
    errorMessage: 'מזהה לא תקין'
  },

  // User
  email: {
    isEmail: true,
    normalizeEmail: true,
    errorMessage: 'כתובת אימייל לא תקינה'
  },
  password: {
    isLength: { min: 6 },
    errorMessage: 'סיסמה חייבת להכיל לפחות 6 תווים'
  },
  phone: {
    matches: /^(\+972|0)([23489]|5[0-9]|77)[0-9]{7}$/,
    errorMessage: 'מספר טלפון לא תקין'
  },

  // Professional
  name: {
    trim: true,
    isLength: { min: 2, max: 50 },
    errorMessage: 'שם חייב להיות בין 2 ל-50 תווים'
  },
  description: {
    trim: true,
    isLength: { min: 10, max: 1000 },
    errorMessage: 'תיאור חייב להיות בין 10 ל-1000 תווים'
  },
  categories: {
    isArray: true,
    errorMessage: 'קטגוריות חייבות להיות מערך'
  },
  services: {
    isArray: true,
    errorMessage: 'שירותים חייבים להיות מערך'
  },

  // Appointments
  datetime: {
    isISO8601: true,
    errorMessage: 'תאריך ושעה לא תקינים'
  },
  duration: {
    isInt: { min: 15, max: 480 },
    toInt: true,
    errorMessage: 'משך הפגישה חייב להיות בין 15 ל-480 דקות'
  },

  // Reviews
  rating: {
    isInt: { min: 1, max: 5 },
    toInt: true,
    errorMessage: 'דירוג חייב להיות בין 1 ל-5'
  },
  review: {
    trim: true,
    isLength: { min: 10, max: 500 },
    errorMessage: 'ביקורת חייבת להיות בין 10 ל-500 תווים'
  },

  // Comments
  comment: {
    trim: true,
    isLength: { min: 1, max: 1000 },
    errorMessage: 'תגובה חייבת להיות בין 1 ל-1000 תווים'
  },

  // Search
  searchQuery: {
    trim: true,
    isLength: { min: 2 },
    errorMessage: 'מונח חיפוש חייב להכיל לפחות 2 תווים'
  },

  // Files
  fileType: {
    isIn: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
    errorMessage: 'סוג קובץ לא נתמך'
  },
  fileSize: {
    isInt: { max: 5242880 }, // 5MB
    errorMessage: 'גודל קובץ מקסימלי הוא 5MB'
  }
};

/**
 * Custom validation rules
 */
exports.customValidations = {
  // Check if date is in the future
  isFutureDate: (value) => {
    const date = new Date(value);
    const now = new Date();
    if (date <= now) {
      throw new Error('התאריך חייב להיות בעתיד');
    }
    return true;
  },

  // Check if time is within working hours (e.g., 8:00-20:00)
  isWithinWorkingHours: (value) => {
    const date = new Date(value);
    const hours = date.getHours();
    if (hours < 8 || hours >= 20) {
      throw new Error('השעה חייבת להיות בין 8:00 ל-20:00');
    }
    return true;
  },

  // Check if array has unique values
  hasUniqueValues: (array) => {
    const uniqueValues = new Set(array);
    if (uniqueValues.size !== array.length) {
      throw new Error('ערכים חייבים להיות ייחודיים');
    }
    return true;
  },

  // Check if value exists in database
  existsInModel: (Model, field = '_id') => {
    return async (value) => {
      const exists = await Model.exists({ [field]: value });
      if (!exists) {
        throw new Error('ערך לא קיים במערכת');
      }
      return true;
    };
  },

  // Check if value is unique in database
  isUniqueInModel: (Model, field, excludeId = null) => {
    return async (value) => {
      const query = { [field]: value };
      if (excludeId) {
        query._id = { $ne: excludeId };
      }
      const exists = await Model.exists(query);
      if (exists) {
        throw new Error('ערך כבר קיים במערכת');
      }
      return true;
    };
  }
};

/**
 * Sanitization middleware
 */
exports.sanitize = {
  // Remove HTML tags
  stripHtml: (value) => {
    return value.replace(/<[^>]*>/g, '');
  },

  // Remove extra spaces
  normalizeSpaces: (value) => {
    return value.replace(/\s+/g, ' ').trim();
  },

  // Convert to lowercase
  toLowerCase: (value) => {
    return value.toLowerCase();
  },

  // Convert to uppercase
  toUpperCase: (value) => {
    return value.toUpperCase();
  },

  // Remove special characters
  removeSpecialChars: (value) => {
    return value.replace(/[^a-zA-Z0-9\u0590-\u05FF\s]/g, '');
  }
};
