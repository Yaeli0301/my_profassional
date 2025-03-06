const express = require('express');
const commentController = require('../Controllers/commentController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Add a new comment
router.post('/', authMiddleware, commentController.addComment);

// Get top 5 comments for a professional
router.get('/top/:professionalId', commentController.getTopComments);

// Get all comments for a professional
router.get('/:professionalId', commentController.getProfessionalComments);

module.exports = router;
