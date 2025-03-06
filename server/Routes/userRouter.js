const express = require('express');
const userController = require('../Controllers/userController');
const { auth } = require('../middleware/authMiddleware'); // Ensure correct import

const router = express.Router();

// Public auth routes
router.post('/register', userController.signUp);
router.post('/login', userController.login);

// Protected routes
router.use(auth); // Ensure middleware is correctly referenced
router.get('/users', userController.getAllUsers);
router.get('/users/:id', userController.getUserById);
router.put('/users/:id', userController.updateUser);
router.delete('/users/:id', userController.deleteUser);

module.exports = router;
