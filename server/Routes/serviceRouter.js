const express = require('express');
const router = express.Router();
const serviceController = require('../Controllers/serviceController');
const authMiddleware = require('../middleware/authMiddleware');

// Get all services for a professional (public route)
router.get('/professional/:professionalId', serviceController.getProfessionalServices);

// Get a single service (public route)
router.get('/:serviceId', serviceController.getService);

// Protected routes - require authentication
router.use(authMiddleware.auth);


// Create a new service
router.post('/professional/:professionalId', serviceController.createService);

// Update a service
router.put('/professional/:professionalId/service/:serviceId', serviceController.updateService);

// Delete a service
router.delete('/professional/:professionalId/service/:serviceId', serviceController.deleteService);

// Toggle service availability
router.patch('/professional/:professionalId/service/:serviceId/toggle', serviceController.toggleAvailability);

module.exports = router;
