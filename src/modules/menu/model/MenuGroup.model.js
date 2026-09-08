/**
 * @file src/modules/menu/model/MenuGroup.model.js
 * @description Menu group model for organizing menu items with scheduling and soft-delete
 * 
 * Features:
 * - Localized names and descriptions (en, am)
 * - Multi-tenant scoping (merchant field)
 * - Branch-level visibility
 * - Scheduling (day/time slots)
 * - Item organization with custom overrides
 * - Soft delete via deletedAt field
 * 
 * Relationships:
 * - merchant: Reference to Merchant (required)
 * - branches: Array of Branch references (required)
 * - items.menu: Reference to MenuItem
 * - bannerImage: Reference to FileAsset
 */

const mongoose = require('mongoose');
const slugify = require('slugify');
const localizedTextSchema = require('../../../../utils/schemas/localizedText');
const commonFields = require('../../../../utils/schemas/commonFields');

// ══════════════════════════════════════════════════════════════════════════
// SUB-SCHEMAS
// ══════════════════════════════════════════════════════════════════════════

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
}, { _id: true });

// ══════════════════════════════════════════════════════════════════════════
// MAIN SCHEMA
// ══════════════════════════════════════════════════════════════════════════

const menuGroupSchema = new mongoose.Schema(
  {
    // Localized name (required)
    name: {
      type: localizedTextSchema,
      required: [true, 'Menu group must have a name'],
    },

    slug: String,

    // Multi-tenant scoping
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },

    // Localized description (optional)
    description: {
      type: localizedTextSchema,
      required: false,
    },
    
    bannerImage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileAsset',
      default: null,
    },

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
    
    branches: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Branch',
      required: true,
      validate: [v => v.length > 0, 'At least one branch required'],
    },
    
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

    isSystemDefault: Boolean,
    
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

menuGroupSchema.index({ branches: 1, visibility: 1, deletedAt: 1 });
menuGroupSchema.index({ branches: 1, priority: -1 });
menuGroupSchema.index({ branches: 1, isAlcoholMenu: 1 });
menuGroupSchema.index({ merchant: 1, branches: 1, deletedAt: 1 });
menuGroupSchema.index({ deletedAt: 1 });

// ══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════

menuGroupSchema.pre('save', function (next) {
  if (this.isModified('name') || !this.slug) {
    // Use English name for slug generation
    const nameForSlug = this.name?.en || this.name;
    const base = slugify(nameForSlug, { lower: true, strict: true });
    this.slug = `${base}-${this._id.toString().slice(-6)}`;
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
// VIRTUALS
// ══════════════════════════════════════════════════════════════════════════

menuGroupSchema.virtual('isDeleted').get(function() {
  return this.deletedAt !== null;
});

// ══════════════════════════════════════════════════════════════════════════
// INSTANCE METHODS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Soft delete menu group
 * 
 * @param {ObjectId} [userId] - User performing the deletion
 * @returns {Promise<MenuGroup>}
 */
menuGroupSchema.methods.softDelete = function(userId) {
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
 * Restore soft-deleted menu group
 * 
 * @returns {Promise<MenuGroup>}
 */
menuGroupSchema.methods.restore = function() {
  this.deletedAt = null;
  this.deletedBy = null;
  this.isActive = true;
  return this.save();
};

// ══════════════════════════════════════════════════════════════════════════
// MODEL EXPORT
// ══════════════════════════════════════════════════════════════════════════

const MenuGroup = mongoose.model('MenuGroup', menuGroupSchema);

module.exports = MenuGroup;
