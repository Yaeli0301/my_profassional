const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  professionalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Professional',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true,
    maxlength: 500
  },
  date: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Middleware to update professional's average rating
reviewSchema.post('save', async function() {
  const Professional = mongoose.model('Professional');
  
  const reviews = await this.constructor.find({ professionalId: this.professionalId });
  const totalRatings = reviews.length;
  const averageRating = reviews.reduce((acc, review) => acc + review.rating, 0) / totalRatings;

  await Professional.findByIdAndUpdate(this.professionalId, {
    rating: averageRating,
    totalRatings: totalRatings
  });
});

// Middleware to update professional's average rating after review deletion
reviewSchema.post('remove', async function() {
  const Professional = mongoose.model('Professional');
  
  const reviews = await this.constructor.find({ professionalId: this.professionalId });
  const totalRatings = reviews.length;
  const averageRating = totalRatings > 0 
    ? reviews.reduce((acc, review) => acc + review.rating, 0) / totalRatings
    : 0;

  await Professional.findByIdAndUpdate(this.professionalId, {
    rating: averageRating,
    totalRatings: totalRatings
  });
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
