const express = require('express');
const router = express.Router();
const reviewController = require('../Controllers/reviewController');
const { auth } = require('../middleware/authMiddleware'); // Ensure correct import

// Public routes
router.get('/professional/:professionalId', reviewController.getProfessionalReviews);
router.get('/stats/:professionalId', reviewController.getReviewStats);

// Protected routes - require authentication
router.use(auth); // Ensure middleware is correctly referenced

// Create a new review
router.post('/', reviewController.createReview);

// Get reviews by current user
router.get('/user', reviewController.getUserReviews);

// Update a review
router.put('/:id', reviewController.updateReview);

// Delete a review
router.delete('/:id', reviewController.deleteReview);

module.exports = router;
