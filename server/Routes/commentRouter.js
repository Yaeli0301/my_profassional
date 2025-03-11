const express = require('express');
const router = express.Router();
const commentController = require('../Controllers/commentController');
const { 
  verifyToken, 
  isAuth, 
  canModerate, 
  isAdmin 
} = require('../middleware/authMiddleware');
const { apiLimiter } = require('../middleware/authMiddleware');

// Apply rate limiting to all comment routes
router.use(apiLimiter);

/**
 * @route   POST /api/comments
 * @desc    Create a new comment
 * @access  Private
 * @body    
 *  - professionalId: ID of the professional
 *  - content: comment text
 *  - rating: 1-5 rating (only for parent comments)
 *  - parentId: ID of parent comment (for replies)
 */
router.post('/',
  verifyToken,
  isAuth,
  commentController.createComment
);

/**
 * @route   GET /api/comments/professional/:professionalId
 * @desc    Get comments for a professional
 * @access  Public
 * @params  
 *  - professionalId: ID of the professional
 *  - page: page number
 *  - limit: comments per page
 */
router.get('/professional/:professionalId',
  commentController.getCommentsByProfessional
);

/**
 * @route   PUT /api/comments/:id
 * @desc    Update a comment
 * @access  Private (comment owner or admin)
 * @params  
 *  - id: comment ID
 * @body    
 *  - content: updated comment text
 *  - rating: updated rating (only for parent comments)
 */
router.put('/:id',
  verifyToken,
  isAuth,
  commentController.updateComment
);

/**
 * @route   DELETE /api/comments/:id
 * @desc    Delete a comment
 * @access  Private (comment owner or admin)
 * @params  
 *  - id: comment ID
 */
router.delete('/:id',
  verifyToken,
  isAuth,
  commentController.deleteComment
);

/**
 * @route   POST /api/comments/:id/report
 * @desc    Report a comment
 * @access  Private
 * @params  
 *  - id: comment ID
 * @body    
 *  - reason: reason for reporting
 */
router.post('/:id/report',
  verifyToken,
  isAuth,
  commentController.reportComment
);

/**
 * @route   POST /api/comments/:id/:action
 * @desc    Like or dislike a comment
 * @access  Private
 * @params  
 *  - id: comment ID
 *  - action: 'like' or 'dislike'
 */
router.post('/:id/:action(like|dislike)',
  verifyToken,
  isAuth,
  commentController.toggleFeedback
);

/**
 * @route   DELETE /api/comments/:id/feedback
 * @desc    Remove feedback (like/dislike) from a comment
 * @access  Private
 * @params  
 *  - id: comment ID
 */
router.delete('/:id/feedback',
  verifyToken,
  isAuth,
  commentController.toggleFeedback
);

// Admin routes
router.use(verifyToken, isAuth);

/**
 * @route   PUT /api/comments/:id/moderate
 * @desc    Moderate a comment (approve/reject)
 * @access  Private (Admin/Moderator)
 * @params  
 *  - id: comment ID
 * @body    
 *  - action: 'approve' or 'reject'
 *  - note: moderation note
 */
router.put('/:id/moderate',
  canModerate,
  commentController.moderateComment
);

/**
 * @route   GET /api/comments/stats
 * @desc    Get comment statistics
 * @access  Private (Admin)
 */
router.get('/stats',
  isAdmin,
  commentController.getCommentStats
);

module.exports = router;
