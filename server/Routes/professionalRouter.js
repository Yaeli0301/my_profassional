const express = require('express');
const router = express.Router();
const professionalController = require('../Controllers/professionalController');
const { auth } = require('../middleware/authMiddleware'); // Ensure correct import

// Public routes
router.get('/', professionalController.getAllProfessionals);
router.get('/:id', professionalController.getProfessionalById);

// Protected routes - require authentication
router.use(auth); // Ensure middleware is correctly referenced

// Professional profile management
router.post('/', professionalController.addProfessional);
router.put('/:id', professionalController.updateProfessional);
router.delete('/:id', professionalController.deleteProfessional);

// Availability management
router.put('/:id/availability', professionalController.updateAvailability);

// Service management
router.post('/:id/services', professionalController.addService);
router.put('/:id/services/:serviceId', professionalController.updateService);
router.delete('/:id/services/:serviceId', professionalController.deleteService);

module.exports = router;
