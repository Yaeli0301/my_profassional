const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  professional: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Professional',
    required: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled'],
    default: 'pending'
  },
  notes: {
    type: String,
    trim: true
  },
  googleEventId: {
    type: String
  },
  price: {
    type: Number,
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  notifications: [{
    type: {
      type: String,
      enum: ['email', 'sms'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      required: true
    },
    scheduledFor: {
      type: Date,
      required: true
    },
    sentAt: Date,
    error: String
  }],
  reminders: [{
    type: {
      type: String,
      enum: ['email', 'sms'],
      required: true
    },
    minutesBefore: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending'
    }
  }]
}, {
  timestamps: true
});

// Virtual field for duration in minutes
appointmentSchema.virtual('duration').get(function() {
  return Math.round((this.endTime - this.startTime) / (1000 * 60));
});

// Middleware to set endTime based on service duration
appointmentSchema.pre('save', async function(next) {
  if (this.isModified('startTime') || this.isModified('service')) {
    const Service = mongoose.model('Service');
    const service = await Service.findById(this.service);
    if (service) {
      this.endTime = new Date(this.startTime.getTime() + service.duration * 60000);
      this.price = service.price;
    }
  }
  next();
});

// Index for efficient querying
appointmentSchema.index({ professional: 1, startTime: 1 });
appointmentSchema.index({ client: 1, startTime: 1 });
appointmentSchema.index({ status: 1 });

// Methods
appointmentSchema.methods.canCancel = function() {
  // Allow cancellation up to 24 hours before appointment
  return this.status === 'pending' && 
         moment(this.startTime).diff(moment(), 'hours') >= 24;
};

appointmentSchema.methods.canReschedule = function() {
  // Allow rescheduling up to 24 hours before appointment
  return ['pending', 'confirmed'].includes(this.status) && 
         moment(this.startTime).diff(moment(), 'hours') >= 24;
};

// Statics
appointmentSchema.statics.findOverlapping = async function(professionalId, startTime, endTime) {
  return this.find({
    professional: professionalId,
    status: { $nin: ['cancelled'] },
    $or: [
      {
        startTime: { $lt: endTime },
        endTime: { $gt: startTime }
      }
    ]
  });
};

appointmentSchema.statics.findUpcoming = async function(userId, userType = 'client') {
  const query = {
    status: { $in: ['pending', 'confirmed'] },
    startTime: { $gt: new Date() }
  };

  if (userType === 'client') {
    query.client = userId;
  } else {
    query.professional = userId;
  }

  return this.find(query)
    .populate('professional')
    .populate('client')
    .populate('service')
    .sort('startTime');
};

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;
