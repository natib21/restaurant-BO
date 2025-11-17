// models/menuGroupModel.js
const mongoose = require('mongoose');
const slugify = require('slugify');

const menuGroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Menu group must have a name'],
      trim: true,
      maxlength: 60,
    },

    slug: String,

    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },

    description: { type: String, trim: true },
    bannerImage: { type: String },

    // Visibility & Scheduling
    visibility: {
      type: String,
      enum: ['always', 'scheduled', 'hidden'],
      default: 'always',
    },

    // Weekly recurring days
    activeDays: [
      {
        type: String,
        enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      },
    ],

    blockedDays: [
      {
        // e.g., no alcohol menu on Tuesday in Dubai
        type: String,
        enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      },
    ],

    // Daily time slots
    timeSlots: [
      {
        start: { type: String }, // "07:00"
        end: { type: String }, // "11:00"
      },
    ],

    // Special dates (Ramadan, Eid, Christmas, etc.)
    specialDates: [
      {
        date: { type: Date, required: true },
        recurringYearly: { type: Boolean, default: false },
      },
    ],

    isAlcoholMenu: { type: Boolean, default: false }, // Auto-control for dry days

    priority: { type: Number, default: 0 }, // Higher = shown first

    createdAt: { type: Date, default: Date.now, select: false },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: All items in this menu group
menuGroupSchema.virtual('items', {
  ref: 'Menu',
  foreignField: 'menuGroup',
  localField: '_id',
});

// Indexes
menuGroupSchema.index({ merchant: 1, visibility: 1 });
menuGroupSchema.index({ priority: -1 });

// Slug
menuGroupSchema.pre('save', function (next) {
  this.slug = slugify(`${this.merchant}-${this.name}`, { lower: true });
  next();
});

module.exports = mongoose.model('MenuGroup', menuGroupSchema);
