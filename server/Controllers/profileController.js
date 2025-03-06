const User = require('../Models/user');
const fs = require('fs');
const path = require('path');

// העלאת תמונת פרופיל
const uploadProfilePicture = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // אם קיימת תמונה קודמת, מוחקים אותה
    if (user.profilePicture) {
      fs.unlinkSync(user.profilePicture);
    }

    user.profilePicture = req.file.path;
    await user.save();

    res.status(200).json({ message: 'Profile picture uploaded successfully', filePath: req.file.path });
  } catch (error) {
    res.status(500).json({ message: 'Failed to upload profile picture. Please try again.' });
  }
};

// שליפת תמונת פרופיל לפי ID משתמש
const getProfilePicture = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || !user.profilePicture) return res.status(404).json({ message: 'No profile picture found' });

    res.sendFile(path.resolve(user.profilePicture));
  } catch (error) {
    res.status(500).json({ message: 'Failed to retrieve profile picture. Please try again.' });
  }
};

// מחיקת תמונת פרופיל
const deleteProfilePicture = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || !user.profilePicture) return res.status(404).json({ message: 'No profile picture found' });

    fs.unlinkSync(user.profilePicture); // מוחקים את התמונה מהשרת
    user.profilePicture = null;
    await user.save();

    res.status(200).json({ message: 'Profile picture deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete profile picture. Please try again.' });
  }
};

module.exports = {
  uploadProfilePicture,
  getProfilePicture,
  deleteProfilePicture
};
