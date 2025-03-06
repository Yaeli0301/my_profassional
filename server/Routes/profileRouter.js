const express = require('express');
const multer = require('multer');
const router = express.Router();
const { uploadProfilePicture, getProfilePicture, deleteProfilePicture } = require('../Controllers/profileController');

const fs = require('fs'); // Add this line to import fs

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads');
    }
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: storage }); // שמירת הקבצים בתיקיית uploads

// נתיבים
const userController = require('../Controllers/userController'); // Correctly import userController

router.put('/:id', upload.single('profilePicture'), uploadProfilePicture); // Add this line for updating profile
router.put('/update/:id', userController.updateUser); // Add this line for updating user profile
router.post('/:id/upload', upload.single('profilePicture'), uploadProfilePicture); // Keep the existing upload route
router.get('/:id', getProfilePicture);
router.delete('/:id', deleteProfilePicture);

module.exports = router;
