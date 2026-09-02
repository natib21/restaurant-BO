/**
 * @file models/Category.js
 * @description Dynamic menu category model with multilingual support
 * 
 * Features:
 * - Localized names and descriptions (en, am)
 * - Multi-tenant scoping (merchant field)
 * - Soft delete via isActive flag
 * - Display ordering for UI
 * - Audit logging via auditPlugin
 * 
 * Relationships:
 * - merchant: Reference to Merchant
 * - createdBy/updatedBy: Reference to User
 * - MenuItem.categoryId references this model
 */

const mongoose = require('mongoose');
const localizedTextSchema = require('../utils/schemas/localizedText');
const commonFields = require('../utils/schemas/commonFields');
const auditPlugin = require('../utils/auditPlugin');

const categorySchema = new mongoose.Schema(
  {
    // Localized name (required)
    name: {
      type: localizedTextSchema,
      required: [true, 'Category name is required'],
      validate: {
        validator: function(name) {
          // At least English name must be provided
          return name && name.en && name.en.trim().length > 0;
        },
        message: 'English name (name.en) is required'
      }
    },

    // Localized description (optional)
    description: {
      type: localizedTextSchema,
      required: false
    },

    // Optional image URL or path
    image: {
      type: String,
      trim: true,
      default: null
    },

    // Display order for UI sorting
    displayOrder: {
      type: Number,
      default: 0,
      index: true
    },

    // Multi-tenant scoping - REQUIRED
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: [true, 'Merchant is required'],
      index: true
    },

    // Common tracking fields
    ...commonFields
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ══════════════════════════════════════════════════════════════════════════
// INDEXES
// ══════════════════════════════════════════════════════════════════════════

// Compound index for efficient merchant queries
categorySchema.index({ merchant: 1, isActive: 1 });

// Compound index for sorting by display order within merchant
categorySchema.index({ merchant: 1, displayOrder: 1 });

// Unique constraint: English name must be unique per merchant
// This allows different merchants to have categories with the same name
categorySchema.index(
  { merchant: 1, 'name.en': 1 },
  { 
    unique: true,
    partialFilterExpression: { isActive: true } // Only enforce for active categories
  }
);

// ══════════════════════════════════════════════════════════════════════════
// VIRTUALS
// ══════════════════════════════════════════════════════════════════════════

// Virtual for menu items count (can be populated if needed)
categorySchema.virtual('menuItemsCount', {
  ref: 'MenuItem',
  localField: '_id',
  foreignField: 'categoryId',
  count: true
});

// ══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════

// Pre-save: Set updatedBy from request context
categorySchema.pre('save', function(next) {
  // updatedBy is set on every save (create or update)
  const { getCurrentUser } = require('../utils/request-context');
  const user = getCurrentUser();
  
  if (user && user._id) {
    this.updatedBy = user._id;
    
    // createdBy is only set on creation
    if (this.isNew && !this.createdBy) {
      this.createdBy = user._id;
    }
  }
  
  next();
});

// Pre-findOneAndUpdate: Set updatedBy
categorySchema.pre('findOneAndUpdate', function(next) {
  const { getCurrentUser } = require('../utils/request-context');
  const user = getCurrentUser();
  
  if (user && user._id) {
    this.set({ updatedBy: user._id });
  }
  
  next();
});

// ══════════════════════════════════════════════════════════════════════════
// INSTANCE METHODS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Soft delete category (set isActive to false)
 */
categorySchema.methods.softDelete = function() {
  this.isActive = false;
  return this.save();
};

/**
 * Restore soft-deleted category
 */
categorySchema.methods.restore = function() {
  this.isActive = true;
  return this.save();
};

// ══════════════════════════════════════════════════════════════════════════
// STATIC METHODS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Find active categories for a merchant
 * @param {ObjectId} merchantId
 * @returns {Query}
 */
categorySchema.statics.findActiveByMerchant = function(merchantId) {
  return this.find({ merchant: merchantId, isActive: true })
    .sort({ displayOrder: 1, 'name.en': 1 });
};

/**
 * Check if category name exists for merchant (case-insensitive)
 * @param {string} nameEn - English name to check
 * @param {ObjectId} merchantId
 * @param {ObjectId} [excludeId] - Exclude this ID (for updates)
 * @returns {Promise<boolean>}
 */
categorySchema.statics.nameExistsForMerchant = async function(nameEn, merchantId, excludeId = null) {
  const query = {
    merchant: merchantId,
    'name.en': new RegExp(`^${nameEn.trim()}$`, 'i'), // Case-insensitive match
    isActive: true
  };
  
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  
  const existing = await this.findOne(query);
  return !!existing;
};

// ══════════════════════════════════════════════════════════════════════════
// PLUGINS
// ══════════════════════════════════════════════════════════════════════════

// Apply audit logging plugin
categorySchema.plugin(auditPlugin, {
  resource: 'Category',
  auditedFields: ['name', 'description', 'image', 'displayOrder', 'isActive'],
  auditDeletes: true
});

// ══════════════════════════════════════════════════════════════════════════
// MODEL EXPORT
// ══════════════════════════════════════════════════════════════════════════

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);
