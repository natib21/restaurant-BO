// models/menuGroupModel.js
const mongoose = require('mongoose');
const slugify = require('slugify');

const menuGroupItemSchema = new mongoose.Schema({
  menu: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Menu',
    required: true,
  },
  sortOrder: {
    type: Number,
    default: 0,
  },
  // Optional overrides specific to this menu group only
  overridePrice: {
    type: Number,
    min: 0,
    default: null,
  },
  customName: {
    type: String,
    trim: true,
  },
  customDescription: {
    type: String,
    trim: true,
  },
  isHidden: {
    type: Boolean,
    default: false,
  },
});

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

    activeDays: [
      {
        type: String,
        enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      },
    ],

    blockedDays: [
      {
        type: String,
        enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      },
    ],

    timeSlots: [
      {
        start: { type: String }, // e.g., "09:00"
        end: { type: String }, // e.g., "23:00"
      },
    ],

    specialDates: [
      {
        date: { type: Date, required: true },
        recurringYearly: { type: Boolean, default: false },
      },
    ],

    isAlcoholMenu: { type: Boolean, default: false },

    priority: {
      type: Number,
      default: 0, // Higher number = shown first
    },

    // The actual list of items in this menu group
    items: [menuGroupItemSchema],

    createdAt: {
      type: Date,
      default: Date.now,
      select: false,
    },
    isSystemDefault: Boolean,
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ========================= INDEXES =========================
menuGroupSchema.index({ merchant: 1, visibility: 1 });
menuGroupSchema.index({ merchant: 1, priority: -1 });
menuGroupSchema.index({ merchant: 1, isAlcoholMenu: 1 });

// ========================= SLUG =========================
menuGroupSchema.pre('save', function (next) {
  if (this.isModified('name') || !this.slug) {
    this.slug = slugify(`${this.merchant}-${this.name}`, { lower: true, strict: true });
  }
  next();
});

// Optional: Auto-cleanup empty items or hidden ones on query
/* menuGroupSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'items.menu',
    match: { available: true, inStock: true }, // only active items
  });
  next();
}); */

module.exports = mongoose.model('MenuGroup', menuGroupSchema);
