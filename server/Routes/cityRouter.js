const express = require('express');
const router = express.Router();
const cityController = require('../Controllers/cityController');
const authMiddleware = require('../middleware/authMiddleware');

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ message: 'נדרשת הרשאת מנהל' });
  }
  next();
};

// Public routes
router.get('/', cityController.getAllCities);
router.get('/search', cityController.searchCities);
router.get('/districts', cityController.getDistricts);
router.get('/district/:district', cityController.getCitiesByDistrict);
router.get('/nearby', cityController.getNearbyCities);
router.get('/:id', cityController.getCityById);

// Protected routes (admin only)
router.use(authMiddleware.verifyToken, isAdmin);


router.post('/', cityController.createCity);
router.put('/:id', cityController.updateCity);
router.delete('/:id', cityController.deleteCity);

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('City Router Error:', err);
  res.status(500).json({
    message: 'שגיאה בטיפול בבקשה',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;
