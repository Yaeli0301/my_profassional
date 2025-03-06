const mongoose = require('mongoose');

const professionalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  qualifications: {
    type: String
  },
  certifications: [{
    type: String
  }],
  experienceYears: {
    type: Number,
    required: true
  },
  hourlyRate: {
    type: Number
  },
  rating: {
    type: Number,
    default: 0
  },
  totalRatings: {
    type: Number,
    default: 0
  },
  availability: [{
    day: {
      type: String,
      enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    },
    slots: [{
      startTime: String,
      endTime: String,
      isBooked: {
        type: Boolean,
        default: false
      }
    }]
  }],
  services: [{
    name: String,
    description: String,
    price: Number
  }]
}, {
  timestamps: true
});

// Virtual populate for reviews
professionalSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'professionalId'
});

const Professional = mongoose.model('Professional', professionalSchema);

module.exports = Professional;
