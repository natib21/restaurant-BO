const mongoose = require('mongoose');
const validator = require('validator');

const officialRepresentativeSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Representative full name is required'],
    trim: true,
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: [true, 'Representative gender is required'],
  },
  phone: {
    type: String,
    required: [true, 'Representative phone number is required'],
    trim: true,
    // Re-use the Ethiopian mobile pattern validation
    validate: {
      validator: function (v) {
        return /^\+?251[79]\d{8}$/.test(v.replace(/\s+/g, ''));
      },
      message: 'Please provide a valid Ethiopian representative phone number',
    },
  },
});
const merchantSchema = new mongoose.Schema({
  businessName: {
    type: String,
    required: [true, 'Business name is required'],
    trim: true,
    unique: true,
    maxlength: [100, 'Business name cannot exceed 100 characters'],
  },
  ownerName: {
    type: officialRepresentativeSchema,
    required: false,
  },

  sector: {
    type: String,
    enum: ['Food & Beverage', 'Retail', 'Service', 'Technology', 'Other'],
    trim: true,
  },
  phone: {
    type: String,
    unique: true,
    trim: true,
    sparse: true,
    validate: {
      validator: function (v) {
        return /^\+?251[79]\d{8}$/.test(v.replace(/\s+/g, '')); // Ethiopian mobile pattern
      },
      message: 'Please provide a valid Ethiopian phone number',
    },
  },
  tinId: {
    type: String,
    trim: true,
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      default: [0, 0],
      validate: {
        validator: function (coords) {
          return (
            coords.length === 2 &&
            coords[0] >= -180 &&
            coords[0] <= 180 &&
            coords[1] >= -90 &&
            coords[1] <= 90
          );
        },
        message: 'Invalid coordinates',
      },
    },
    wereda: { type: String, trim: true },
    city: { type: String, trim: true },
    subCity: { type: String, trim: true },
    building: { type: String, trim: true },
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'suspended', 'inactive'],
    default: 'pending',
  },
  cuisineType: {
    type: [String],
    default: [],
  },
  logo: {
    type: String, // image URL
  },
  coverImage: {
    type: String, // for customer-facing app branding
  },

  subscriptionPlan: {
    type: String,
    enum: ['free', 'basic', 'pro', 'enterprise'],
    default: 'free',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  mode: {
    type: String,
    default: 'Test',
  },
  apiKey: {
    type: String,
    select: false,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  menu: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Menu',
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
  },
  table: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tables',
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

merchantSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

merchantSchema.index({ location: '2dsphere' });

merchantSchema.index({ status: 1, isActive: 1 });
merchantSchema.index({ subscriptionPlan: 1 });
merchantSchema.index({ 'location.city': 1, 'location.subCity': 1 });

merchantSchema.virtual('users', {
  ref: 'User',
  localField: '_id',
  foreignField: 'merchant',
  // match: { role: { $ne: null } },
});

merchantSchema.virtual('orderCount', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'merchant',
  count: true,
});

// ✅ ADD - Method to check if merchant can accept orders
merchantSchema.methods.canAcceptOrders = function () {
  return this.status === 'approved' && this.isActive === true;
};

// ✅ ADD - Method to get display name
merchantSchema.methods.getDisplayName = function () {
  return this.businessName || this.legalName || 'Unnamed Merchant';
};

// ✅ QUERY MIDDLEWARE - Exclude inactive merchants by default
/* merchantSchema.pre(/^find/, function(next) {
  this.find({ status: { $ne: 'inactive' } });
  next();
}); */

merchantSchema.set('toObject', { virtuals: true });
merchantSchema.set('toJSON', { virtuals: true });

const Merchant = mongoose.model('Merchant', merchantSchema);
module.exports = Merchant;
