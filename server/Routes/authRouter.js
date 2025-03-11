const express = require('express');
const userController = require('../Controllers/userController');
const { validateRecaptcha } = require('../middleware/authMiddleware');

const router = express.Router();

// User registration route
router.post('/register', validateRecaptcha, userController.signUp);

// User login route
router.post('/login', userController.login);

module.exports = router;
