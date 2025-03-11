const express = require('express');
const router = express.Router();
const categoryController = require('../Controllers/categoryController');
const authMiddleware = require('../middleware/authMiddleware');

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ message: 'נדרשת הרשאת מנהל' });
  }
  next();
};

// Public routes
router.get('/', categoryController.getAllCategories);
router.get('/search', categoryController.searchCategories);
router.get('/slug/:slug', categoryController.getCategoryBySlug);
router.get('/:id', categoryController.getCategoryById);

// Protected routes (admin only)
router.use(authMiddleware.verifyToken, isAdmin);


// Admin routes
router.post('/', categoryController.createCategory);
router.put('/:id', categoryController.updateCategory);
router.delete('/:id', categoryController.deleteCategory);
router.post('/reorder', categoryController.reorderCategories);
router.get('/stats/overview', categoryController.getCategoryStats);

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('Category Router Error:', err);
  res.status(500).json({
    message: 'שגיאה בטיפול בבקשה',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;
