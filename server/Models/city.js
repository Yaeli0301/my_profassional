const mongoose = require('mongoose');

const citySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  district: {
    type: String,
    required: true,
    trim: true,
    enum: [
      'צפון',
      'חיפה',
      'מרכז',
      'תל אביב',
      'ירושלים',
      'דרום',
      'יהודה ושומרון'
    ]
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function(v) {
          return v.length === 2 &&
                 v[0] >= -180 && v[0] <= 180 && // longitude
                 v[1] >= -90 && v[1] <= 90;     // latitude
        },
        message: 'Invalid coordinates'
      }
    }
  },
  population: {
    type: Number,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create indexes
citySchema.index({ name: 'text' });
citySchema.index({ location: '2dsphere' });
citySchema.index({ district: 1 });

// Virtual for formatted name
citySchema.virtual('formattedName').get(function() {
  return this.name;
});

// Methods
citySchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

citySchema.statics.findByDistrict = function(district) {
  return this.find({ district }).sort('name');
};

citySchema.statics.findNearby = function(coordinates, maxDistance = 10000) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance
      }
    }
  });
};

citySchema.statics.searchByName = function(query) {
  return this.find(
    { $text: { $search: query } },
    { score: { $meta: 'textScore' } }
  ).sort({ score: { $meta: 'textScore' } });
};

// Pre-save middleware
citySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const City = mongoose.model('City', citySchema);

module.exports = City;
