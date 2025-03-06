const Review = require('../Models/review');
const Professional = require('../Models/professional');

// Get reviews for a professional with pagination
const getProfessionalReviews = async (req, res) => {
  try {
    const { professionalId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ professionalId })
        .populate('userId', 'firstName lastName profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments({ professionalId })
    ]);

    res.status(200).json({
      reviews,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching reviews', error: err.message });
  }
};

// Get review statistics for a professional
const getReviewStats = async (req, res) => {
  try {
    const { professionalId } = req.params;

    const stats = await Review.aggregate([
      { $match: { professionalId: professionalId } },
      {
        $group: {
          _id: null,
          average: { $avg: '$rating' },
          total: { $sum: 1 },
          ratings: {
            $push: '$rating'
          }
        }
      },
      {
        $project: {
          _id: 0,
          average: { $round: ['$average', 1] },
          total: 1,
          distribution: {
            1: { $size: { $filter: { input: '$ratings', as: 'r', cond: { $eq: ['$$r', 1] } } } },
            2: { $size: { $filter: { input: '$ratings', as: 'r', cond: { $eq: ['$$r', 2] } } } },
            3: { $size: { $filter: { input: '$ratings', as: 'r', cond: { $eq: ['$$r', 3] } } } },
            4: { $size: { $filter: { input: '$ratings', as: 'r', cond: { $eq: ['$$r', 4] } } } },
            5: { $size: { $filter: { input: '$ratings', as: 'r', cond: { $eq: ['$$r', 5] } } } }
          }
        }
      }
    ]);

    res.status(200).json(stats[0] || { average: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching review statistics', error: err.message });
  }
};

// Create a new review
const createReview = async (req, res) => {
  try {
    const { professionalId, rating, comment } = req.body;
    const userId = req.user._id;

    // Check if user has already reviewed this professional
    const existingReview = await Review.findOne({ userId, professionalId });
    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this professional' });
    }

    // Check if professional exists
    const professional = await Professional.findById(professionalId);
    if (!professional) {
      return res.status(404).json({ message: 'Professional not found' });
    }

    // Create new review
    const review = new Review({
      userId,
      professionalId,
      rating,
      comment
    });

    await review.save();

    // Populate user details before sending response
    await review.populate('userId', 'firstName lastName profilePicture');

    res.status(201).json(review);
  } catch (err) {
    res.status(400).json({ message: 'Error creating review', error: err.message });
  }
};

// Update a review
const updateReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const review = await Review.findOne({ _id: req.params.id, userId: req.user._id });

    if (!review) {
      return res.status(404).json({ message: 'Review not found or unauthorized' });
    }

    review.rating = rating;
    review.comment = comment;
    await review.save();

    await review.populate('userId', 'firstName lastName profilePicture');

    res.status(200).json(review);
  } catch (err) {
    res.status(400).json({ message: 'Error updating review', error: err.message });
  }
};

// Delete a review
const deleteReview = async (req, res) => {
  try {
    const review = await Review.findOne({ _id: req.params.id, userId: req.user._id });

    if (!review) {
      return res.status(404).json({ message: 'Review not found or unauthorized' });
    }

    await review.remove();
    res.status(200).json({ message: 'Review deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting review', error: err.message });
  }
};

// Get reviews by current user
const getUserReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ userId: req.user._id })
      .populate('professionalId', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.status(200).json(reviews);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching user reviews', error: err.message });
  }
};

module.exports = {
  getProfessionalReviews,
  getReviewStats,
  createReview,
  updateReview,
  deleteReview,
  getUserReviews
};
