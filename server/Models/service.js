const mongoose = require('mongoose');

const customFieldSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['text', 'number', 'boolean', 'select'],
    required: true
  },
  options: [{
    type: String,
    trim: true
  }],
  required: {
    type: Boolean,
    default: false
  },
  value: mongoose.Schema.Types.Mixed
}, { _id: false });

const serviceSchema = new mongoose.Schema({
  professionalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Professional',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subcategory: {
    type: String,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  duration: {
    type: Number,
    required: true,
    min: 15, // Minimum 15 minutes
    max: 480 // Maximum 8 hours
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  customFields: [customFieldSchema],
  tags: [{
    type: String,
    trim: true
  }],
  images: [{
    url: String,
    caption: String
  }],
  requirements: {
    type: String,
    trim: true
  },
  cancellationPolicy: {
    type: String,
    enum: ['flexible', 'moderate', 'strict'],
    default: 'moderate'
  },
  location: {
    type: {
      type: String,
      enum: ['remote', 'onsite', 'both'],
      default: 'onsite'
    },
    address: String,
    travelFee: Number
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for faster queries
serviceSchema.index({ professionalId: 1, category: 1 });
serviceSchema.index({ tags: 1 });

// Virtual populate for appointments
serviceSchema.virtual('appointments', {
  ref: 'Appointment',
  localField: '_id',
  foreignField: 'serviceId'
});

// Method to check if a service can be booked at a specific time
serviceSchema.methods.isAvailableAt = async function(startTime, endTime) {
  const appointments = await this.model('Appointment').find({
    serviceId: this._id,
    startTime: { $lt: endTime },
    endTime: { $gt: startTime }
  });
  return appointments.length === 0;
};

// Pre-save middleware to validate custom fields
serviceSchema.pre('save', function(next) {
  if (this.customFields) {
    for (const field of this.customFields) {
      if (field.type === 'select' && (!field.options || field.options.length === 0)) {
        next(new Error('Select type custom fields must have options'));
      }
      if (field.required && field.value == null) {
        next(new Error(`Required custom field "${field.name}" must have a value`));
      }
    }
  }
  next();
});

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service;
