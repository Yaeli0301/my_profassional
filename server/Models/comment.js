const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const commentSchema = new mongoose.Schema({
  professional: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Professional',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxLength: 1000
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  reports: [reportSchema],
  isBlocked: {
    type: Boolean,
    default: false
  },
  blockReason: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
commentSchema.index({ professional: 1, createdAt: -1 });
commentSchema.index({ user: 1, createdAt: -1 });
commentSchema.index({ 'reports.status': 1 });

// Virtual for total reports
commentSchema.virtual('totalReports').get(function() {
  return this.reports.length;
});

// Virtual for pending reports
commentSchema.virtual('pendingReports').get(function() {
  return this.reports.filter(report => report.status === 'pending').length;
});

// Methods
commentSchema.methods.addReport = function(userId, reason) {
  if (!this.reports.some(report => report.user.equals(userId))) {
    this.reports.push({
      user: userId,
      reason: reason
    });
    return true;
  }
  return false;
};

commentSchema.methods.handleReport = function(reportId, action) {
  const report = this.reports.id(reportId);
  if (report) {
    report.status = action === 'approve' ? 'approved' : 'rejected';
    return true;
  }
  return false;
};

// Middleware to update professional's rating
commentSchema.post('save', async function(doc) {
  try {
    const Professional = mongoose.model('Professional');
    const professional = await Professional.findById(doc.professional);
    
    if (professional) {
      const comments = await this.constructor.find({ 
        professional: doc.professional,
        isBlocked: false 
      });
      
      const totalRating = comments.reduce((sum, comment) => sum + comment.rating, 0);
      professional.rating = totalRating / comments.length;
      professional.reviewCount = comments.length;
      await professional.save();
    }
  } catch (error) {
    console.error('Error updating professional rating:', error);
  }
});

// Static methods
commentSchema.statics.getReportedComments = function(options = {}) {
  return this.find({
    'reports.status': 'pending'
  })
  .populate('user', 'firstName lastName email profilePicture')
  .populate('professional', 'firstName lastName email')
  .populate('reports.user', 'firstName lastName email')
  .sort({ 'reports.createdAt': -1 })
  .skip(options.skip)
  .limit(options.limit);
};

commentSchema.statics.getProfessionalComments = function(professionalId, options = {}) {
  return this.find({
    professional: professionalId,
    isBlocked: false
  })
  .populate('user', 'firstName lastName profilePicture')
  .sort({ createdAt: -1 })
  .skip(options.skip)
  .limit(options.limit);
};

commentSchema.statics.getUserComments = function(userId, options = {}) {
  return this.find({
    user: userId,
    isBlocked: false
  })
  .populate('professional', 'firstName lastName profilePicture')
  .sort({ createdAt: -1 })
  .skip(options.skip)
  .limit(options.limit);
};

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
