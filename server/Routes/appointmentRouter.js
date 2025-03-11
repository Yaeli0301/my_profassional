const express = require('express');
const router = express.Router();
const appointmentController = require('../Controllers/appointmentController');
const { auth } = require('../middleware/authMiddleware');

// Protected routes - require authentication
router.use(auth);

// Create new appointment
router.post('/', appointmentController.create);

// Sync appointment with Google Calendar
router.post('/:appointmentId/sync-google', appointmentController.syncWithGoogle);

// Update appointment status
router.patch('/:appointmentId/status', appointmentController.updateStatus);

// Get upcoming appointments for the authenticated user
router.get('/upcoming', appointmentController.getUpcoming);

// Get professional's calendar
router.get('/professional/:professionalId/calendar', appointmentController.getProfessionalCalendar);

module.exports = router;
