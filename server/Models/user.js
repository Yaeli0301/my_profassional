const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName:
  {
    type: String,
    required: true
  },
  lastName:
  {
    type: String,
    required: true
  },
  email:
  {
    type: String, required:
      true, unique: true
  },
  password:
  {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['מקצוען', 'לקוח רגיל', 'מנהל'],
    default: 'לקוח רגיל'
  },

  cityId:
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'City',
    required: true
  },
  profilePicture: {
    type: String
  },
  professionalDetails: {
    qualifications: { type: String },
    certifications: { type: [String] },
    experienceYears: { type: Number }
  }

});

const User = mongoose.model('User', userSchema);
module.exports = User;
