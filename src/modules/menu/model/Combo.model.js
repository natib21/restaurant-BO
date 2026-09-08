/**
 * @file src/modules/menu/model/Combo.model.js
 * @description Combo/meal deal model with branch overrides and soft-delete
 * 
 * Features:
 * - Localized names and descriptions (en, am)
 * - Multi-tenant scoping (merchant field)
 * - Multiple menu items with quantities
 * - Pricing with discounts
 * - Branch-specific overrides
 * - Time-based availability
 * - Soft delete via deletedAt field
 * 
 * Relationships:
 * - merchant: Reference to Merchant (required)
 * - branches: Array of Branch references
 * - items.menuItem: Reference to MenuItem
 * - branchOverrides.branch: Reference to Branch
 * - image: Reference to FileAsset
 */

const mongoose = require('mongoose');
const slugify = require('slugify');
const localizedTextSchema = require('../../../../utils/schemas/localizedText');
const commonFields = require('../../../../utils/schemas/commonFields');

// Helper for time-to-minutes conversion (useful for filtering availability)
const timeToMinutes = timeStr => {
  const [hrs, mins] = timeStr.split(':').map(Number);
  return hrs * 60 + mins;
};

// ══════════════════════════════════════════════════════════════════════════
// SUB-SCHEMAS
// ══════════════════════════════════════════════════════════════════════════

// SHARED ITEM SCHEMA
const comboItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Menu',
    required: true,
  },
  nameFallback: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
}, { _id: false });

// BRANCH OVERRIDE SCHEMA
const branchOverrideSchema = new mongoose.Schema({
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
  },
  isActive: Boolean,
  comboPrice: Number,
  items: [comboItemSchema],
  availableOnDays: [
    {
      type: String,
      enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    },
  ],
  timeSlots: [
    {
      start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
      end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
    },
  ],
  validFrom: Date,
  validUntil: Date,
}, { _id: true });

// ══════════════════════════════════════════════════════════════════════════
// MAIN SCHEMA
// ══════════════════════════════════════════════════════════════════════════

const comboSchema = new mongoose.Schema(
  {
    // Multi-tenant scoping
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    
    // Localized name (required)
    name: {
      type: localizedTextSchema,
      required: [true, 'Combo must have a name'],
    },
    
    slug: String,
    
    // Localized description (optional)
    description: {
      type: localizedTextSchema,
      required: false,
    },

    // Global Default Items
    items: {
      type: [comboItemSchema],
      validate: [v => v.length > 0, 'Combo must include at least one item'],
    },

    // Pricing
    originalPrice: { type: Number, default: 0 },
    comboPrice: {
      type: Number,
      required: [true, 'Combo price is required'],
      min: [0.01, 'Combo price must be greater than zero'],
    },

    image: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileAsset',
      default: null,
    },
    
    branches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],

    // Availability
    validFrom: Date,
    validUntil: Date,
    availableOnDays: [
      {
        type: String,
        enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      },
    ],
    timeSlots: [
      {
        start: String, // "11:00"
        end: String, // "15:00"
      },
    ],

    priority: { type: Number, default: 0 },
    tags: [String],
    branchOverrides: [branchOverrideSchema],
    
    // Common fields (isActive, createdBy, updatedBy, deletedBy, deletedAt)
    ...commonFields
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ══════════════════════════════════════════════════════════════════════════
// INDEXES
// ══════════════════════════════════════════════════════════════════════════

comboSchema.index({ merchant: 1, branches: 1, isActive: 1, deletedAt: 1 });
comboSchema.index({ 'branchOverrides.branch': 1 });
comboSchema.index({ validUntil: 1 }, { expireAfterSeconds: 0 });
comboSchema.index({ deletedAt: 1 });

// ══════════════════════════════════════════════════════════════════════════
// VIRTUALS
// ══════════════════════════════════════════════════════════════════════════

// Calculated savings
comboSchema.virtual('savingsAmount').get(function () {
  return this.originalPrice > this.comboPrice ? this.originalPrice - this.comboPrice : 0;
});

comboSchema.virtual('savingsPercentage').get(function () {
  if (!this.originalPrice || this.originalPrice <= this.comboPrice) return 0;
  return Math.round(((this.originalPrice - this.comboPrice) / this.originalPrice) * 100);
});

comboSchema.virtual('imageData').get(function () {
  if (this.image) {
    return `/api/v1/files/${this.image}/content`;
  }
  return null;
});

comboSchema.virtual('isDeleted').get(function() {
  return this.deletedAt !== null;
});

// ══════════════════════════════════════════════════════════════════════════
// INSTANCE METHODS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Check if combo is currently available
 * Logic: Checks specific branch override first, then falls back to global settings.
 * 
 * @param {ObjectId} [branchId] - Branch to check availability for
 * @returns {boolean}
 */
comboSchema.methods.isAvailableNow = function (branchId) {
  const now = new Date();
  const currentDay = now.toLocaleString('en-us', { weekday: 'lowercase' });
  const currentTimeMin = timeToMinutes(`${now.getHours()}:${now.getMinutes()}`);

  // 1. Basic Status Checks
  if (!this.isActive || this.deletedAt) return false;

  // 2. Check for Branch Override
  const override = this.branchOverrides.find(b => b.branch.toString() === branchId?.toString());
  const context = override || this;
  
  if (context.validFrom && now < context.validFrom) return false;
  if (context.validUntil && now > context.validUntil) return false;
  
  // 3. Check Day
  if (context.availableOnDays?.length > 0 && !context.availableOnDays.includes(currentDay)) {
    return false;
  }

  // 4. Check Time Slots
  if (context.timeSlots?.length > 0) {
    return context.timeSlots.some(slot => {
      return (
        currentTimeMin >= timeToMinutes(slot.start) && currentTimeMin <= timeToMinutes(slot.end)
      );
    });
  }

  return true;
};

/**
 * Soft delete combo
 * 
 * @param {ObjectId} [userId] - User performing the deletion
 * @returns {Promise<Combo>}
 */
comboSchema.methods.softDelete = function(userId) {
  this.deletedAt = new Date();
  this.isActive = false;
  
  if (userId) {
    this.deletedBy = userId;
  } else {
    const { getCurrentUser } = require('../../../../utils/request-context');
    const user = getCurrentUser();
    if (user && user._id) {
      this.deletedBy = user._id;
    }
  }
  
  return this.save();
};

/**
 * Restore soft-deleted combo
 * 
 * @returns {Promise<Combo>}
 */
comboSchema.methods.restore = function() {
  this.deletedAt = null;
  this.deletedBy = null;
  this.isActive = true;
  return this.save();
};

// ══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════

comboSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    // Use English name for slug generation
    const nameForSlug = this.name?.en || this.name;
    this.slug = slugify(nameForSlug, {
      lower: true,
      strict: true,
    });
  }
  
  // Set updatedBy from request context
  const { getCurrentUser } = require('../../../../utils/request-context');
  const user = getCurrentUser();
  
  if (user && user._id) {
    this.updatedBy = user._id;
    if (this.isNew && !this.createdBy) {
      this.createdBy = user._id;
    }
  }
  
  next();
});

// ══════════════════════════════════════════════════════════════════════════
// MODEL EXPORT
// ══════════════════════════════════════════════════════════════════════════

const Combo = mongoose.model('Combo', comboSchema);

module.exports = Combo;
