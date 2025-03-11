const User = require('../Models/user');
const Professional = require('../Models/professional');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');

// Set up storage engine for multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './server/uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

// Initialize upload
const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 5 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  }
}).single('profilePicture');

// Check file type
function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb('Error: Images only!');
  }
}

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id,
      status: user.status 
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().populate('cityId');
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('cityId');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update user
const updateUser = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err });
    }

    try {
      const updateData = { ...req.body };
      
      if (req.file) {
        updateData.profilePicture = req.file.path;
      }

      const updatedUser = await User.findByIdAndUpdate(
        req.params.id,
        updateData,
        {
          new: true,
          runValidators: true,
        }
      );

      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.status(200).json(updatedUser);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) return res.status(404).json({ message: 'User not found' });
    
    // If user was a professional, delete their professional profile too
    if (deletedUser.status === 'מקצוען') {
      await Professional.findOneAndDelete({ userId: deletedUser._id });
    }
    
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Sign up new user
const signUp = async (req, res) => {
  try {
    const { email, password, status, professionalDetails, ...userData } = req.body;
    
    // Check if email exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    // Validate required fields
    if (!email || !password || !userData.firstName || !userData.lastName || !userData.cityId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Validate professional details if registering as professional
    if (status === 'מקצוען') {
      if (!professionalDetails || !professionalDetails.category || !professionalDetails.experienceYears) {
        return res.status(400).json({ message: 'Missing required professional details' });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = new User({
      ...userData,
      email,
      password: hashedPassword,
      status
    });

    await newUser.save();

    // If professional, create professional profile
    if (status === 'מקצוען') {
      const professional = new Professional({
        userId: newUser._id,
        ...professionalDetails
      });
      await professional.save();
    }

    // Generate token
    const token = generateToken(newUser);

    res.status(201).json({
      message: 'User signed up successfully',
      token,
      user: {
        _id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        status: newUser.status
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ 
      message: 'Error signing up user', 
      error: error.message 
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Get professional details if user is a professional
    let professionalDetails = null;
    if (user.status === 'מקצוען') {
      professionalDetails = await Professional.findOne({ userId: user._id });
    }

    // Generate token
    const token = generateToken(user);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        status: user.status,
        professionalDetails
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  signUp,
  login,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser
};
