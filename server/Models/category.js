const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  icon: {
    type: String,
    required: true,
    trim: true
  },
  subcategories: [{
    type: String,
    trim: true
  }],
  searchTerms: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  },
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  metadata: {
    imageUrl: String,
    color: String,
    featuredOrder: Number
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
categorySchema.index({ name: 'text', description: 'text', searchTerms: 'text' });
categorySchema.index({ slug: 1 });
categorySchema.index({ isActive: 1 });
categorySchema.index({ order: 1 });

// Virtual for full path
categorySchema.virtual('path').get(function() {
  return this.parentCategory ? `${this.parentCategory.path}/${this.slug}` : this.slug;
});

// Virtual for professional count
categorySchema.virtual('professionalCount', {
  ref: 'Professional',
  localField: '_id',
  foreignField: 'categoryId',
  count: true
});

// Methods
categorySchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

// Static methods
categorySchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort('order name');
};

categorySchema.statics.findBySlug = function(slug) {
  return this.findOne({ slug, isActive: true });
};

categorySchema.statics.findWithProfessionalCount = function() {
  return this.find({ isActive: true })
    .populate('professionalCount')
    .sort('order name');
};

categorySchema.statics.searchCategories = function(query) {
  return this.find(
    { 
      $text: { $search: query },
      isActive: true
    },
    { 
      score: { $meta: 'textScore' }
    }
  ).sort({ score: { $meta: 'textScore' } });
};

// Pre-save middleware
categorySchema.pre('save', function(next) {
  if (!this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  }
  next();
});

// Ensure child categories are also deactivated
categorySchema.pre('save', async function(next) {
  if (this.isModified('isActive') && !this.isActive) {
    await this.constructor.updateMany(
      { parentCategory: this._id },
      { isActive: false }
    );
  }
  next();
});

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
