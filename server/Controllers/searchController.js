const Professional = require('../Models/professional');
const Category = require('../Models/category');
const City = require('../Models/city');
const { logger } = require('../utils/logger');
const { config } = require('../config/config');
const { APIError } = require('../middleware/errorMiddleware');

/**
 * Search professionals with filters
 */
exports.searchProfessionals = async (req, res, next) => {
  try {
    const {
      query = '',
      category,
      city,
      page = 1,
      limit = config.pagination.defaultLimit,
      sort = 'rating',
      order = 'desc'
    } = req.query;

    // Build search query
    const searchQuery = {
      isActive: true,
      isVerified: true
    };

    // Add text search if query provided
    if (query) {
      searchQuery.$or = [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { 'services.name': { $regex: query, $options: 'i' } }
      ];
    }

    // Add category filter
    if (category) {
      searchQuery.categories = category;
    }

    // Add city filter
    if (city) {
      searchQuery.city = city;
    }

    // Build sort options
    const sortOptions = {};
    switch (sort) {
      case 'rating':
        sortOptions.averageRating = order === 'desc' ? -1 : 1;
        break;
      case 'reviews':
        sortOptions.reviewCount = order === 'desc' ? -1 : 1;
        break;
      case 'price':
        sortOptions['services.price'] = order === 'desc' ? -1 : 1;
        break;
      default:
        sortOptions.createdAt = -1;
    }

    // Execute search with pagination
    const [professionals, total] = await Promise.allSettled([
      Professional.find(searchQuery)
        .populate('categories', 'name')
        .populate('city', 'name')
        .sort(sortOptions)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Professional.countDocuments(searchQuery)
    ]);

    // Check for errors in the search promise
    if (professionals.status === 'rejected') {
      logger.error('Search error occurred while processing the request:', professionals.reason);
      throw new APIError('Error executing search query', 500);
    }

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    // Format response
    const results = professionals.value.map(professional => ({
      id: professional._id,
      name: professional.name,
      description: professional.description,
      categories: professional.categories,
      city: professional.city,
      averageRating: professional.averageRating,
      reviewCount: professional.reviewCount,
      services: professional.services,
      imageUrl: professional.imageUrl
    }));

    res.status(200).json({
      results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasMore
      }
    });

    // Log search metrics
    logger.info('Search performed:', {
      query,
      category,
      city,
      resultsCount: results.length,
      total
    });

  } catch (error) {
    logger.error('Search error occurred while processing the request:', error);
    next(error);
  }
};

/**
 * Get autocomplete suggestions
 */
exports.getAutocompleteSuggestions = async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q || q.length < config.search.minQueryLength) {
      throw new APIError('נדרשות לפחות 2 אותיות לחיפוש', 400);
    }

    // Search in multiple collections
    const [professionals, categories, cities] = await Promise.all([
      Professional.find(
        { name: { $regex: q, $options: 'i' }, isActive: true },
        'name'
      ).limit(5),
      Category.find(
        { name: { $regex: q, $options: 'i' } },
        'name'
      ).limit(3),
      City.find(
        { name: { $regex: q, $options: 'i' } },
        'name'
      ).limit(3)
    ]);

    // Format suggestions
    const suggestions = {
      status: 'success',
      professionals: professionals.map(p => ({
        type: 'professional',
        id: p._id,
        text: p.name
      })),
      categories: categories.map(c => ({
        type: 'category',
        id: c._id,
        text: c.name
      })),
      cities: cities.map(c => ({
        type: 'city',
        id: c._id,
        text: c.name
      }))
    };

    res.json(suggestions);

  } catch (error) {
    next(error);
  }
};

/**
 * Get popular searches
 */
exports.getPopularSearches = async (req, res, next) => {
  try {
    // Here you would implement logic to get popular searches
    // This could be based on search history, trending topics, etc.
    const popularSearches = [
      { text: 'מאמן כושר', count: 150 },
      { text: 'מעצב שיער', count: 120 },
      { text: 'מטפל זוגי', count: 100 }
    ];

    res.json(popularSearches);

  } catch (error) {
    next(error);
  }
};

/**
 * Get related searches
 */
exports.getRelatedSearches = async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q) {
      throw new APIError('נדרש מונח חיפוש', 400);
    }

    // Find categories related to the search term
    const relatedCategories = await Category.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { keywords: { $regex: q, $options: 'i' } }
      ]
    }).limit(5);

    // Get professionals in these categories
    const professionals = await Professional.find({
      categories: { $in: relatedCategories.map(c => c._id) }
    })
    .distinct('categories');

    // Get all related categories
    const allRelatedCategories = await Category.find({
      _id: { $in: professionals }
    });

    // Format related searches
    const relatedSearches = allRelatedCategories.map(category => ({
      text: category.name,
      category: category._id
    }));

    res.json(relatedSearches);

  } catch (error) {
    next(error);
  }
};
