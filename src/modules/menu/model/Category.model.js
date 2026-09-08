/**
 * @file src/modules/menu/model/Category.model.js
 * @description Dynamic menu category model with multilingual support and soft-delete
 * 
 * Features:
 * - Localized names and descriptions (en, am)
 * - Multi-tenant scoping (merchant field)
 * - Soft delete via deletedAt field
 * - Display ordering for UI
 * - Audit logging via auditPlugin
 * 
 * Relationships:
 * - merchant: Reference to Merchant
 * - createdBy/updatedBy/deletedBy: Reference to User
 * - MenuItem.categoryId references this model
 * 
 * Soft Delete Pattern:
 * - deletedAt: null = active record
 * - deletedAt: Date = soft-deleted record
 * - Use softDelete() method to soft delete
 * - Use restore() method to restore
 */

const mongoose = require('mongoose');
const localizedTextSchema = require('../../../../utils/schemas/localizedText');
const commonFields = require('../../../../utils/schemas/commonFields');
const auditPlugin = require('../../../../utils/auditPlugin');

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

    // Optional icon/image reference
    icon: {
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

    // Common tracking fields (isActive, createdBy, updatedBy, deletedBy, deletedAt)
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

// Compound index for efficient merchant queries (excluding soft-deleted)
categorySchema.index({ merchant: 1, isActive: 1, deletedAt: 1 });

// Compound index for sorting by display order within merchant
categorySchema.index({ merchant: 1, displayOrder: 1 });

// Index for soft-delete queries
categorySchema.index({ deletedAt: 1 });

// Unique constraint: English name must be unique per merchant (active records only)
// This allows different merchants to have categories with the same name
categorySchema.index(
  { merchant: 1, 'name.en': 1 },
  { 
    unique: true,
    partialFilterExpression: { isActive: true, deletedAt: null } // Only enforce for active, non-deleted categories
  }
);

// ══════════════════════════════════════════════════════════════════════════
// VIRTUALS
// ══════════════════════════════════════════════════════════════════════════

// Virtual for menu items count (can be populated if needed)
categorySchema.virtual('menuItemsCount', {
  ref: 'Menu',
  localField: '_id',
  foreignField: 'categoryId',
  count: true
});

// Virtual to check if category is soft-deleted
categorySchema.virtual('isDeleted').get(function() {
  return this.deletedAt !== null;
});

// ══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════

// Pre-save: Set updatedBy from request context
categorySchema.pre('save', function(next) {
  // updatedBy is set on every save (create or update)
  const { getCurrentUser } = require('../../../../utils/request-context');
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
  const { getCurrentUser } = require('../../../../utils/request-context');
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
 * Soft delete category
 * Sets deletedAt timestamp and deletedBy user, optionally sets isActive to false
 * 
 * @param {ObjectId} [userId] - User performing the deletion
 * @returns {Promise<Category>}
 */
categorySchema.methods.softDelete = function(userId) {
  this.deletedAt = new Date();
  this.isActive = false;
  
  if (userId) {
    this.deletedBy = userId;
  } else {
    // Try to get from request context
    const { getCurrentUser } = require('../../../../utils/request-context');
    const user = getCurrentUser();
    if (user && user._id) {
      this.deletedBy = user._id;
    }
  }
  
  return this.save();
};

/**
 * Restore soft-deleted category
 * Clears deletedAt and deletedBy, sets isActive to true
 * 
 * @returns {Promise<Category>}
 */
categorySchema.methods.restore = function() {
  this.deletedAt = null;
  this.deletedBy = null;
  this.isActive = true;
  return this.save();
};

// ══════════════════════════════════════════════════════════════════════════
// STATIC METHODS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Find active categories for a merchant (excluding soft-deleted)
 * 
 * @param {ObjectId} merchantId
 * @returns {Query}
 */
categorySchema.statics.findActiveByMerchant = function(merchantId) {
  return this.find({ 
    merchant: merchantId, 
    isActive: true,
    deletedAt: null 
  }).sort({ displayOrder: 1, 'name.en': 1 });
};

/**
 * Find all categories for a merchant (including soft-deleted)
 * 
 * @param {ObjectId} merchantId
 * @param {boolean} [includeDeleted=false] - Include soft-deleted categories
 * @returns {Query}
 */
categorySchema.statics.findByMerchant = function(merchantId, includeDeleted = false) {
  const query = { merchant: merchantId };
  
  if (!includeDeleted) {
    query.deletedAt = null;
  }
  
  return this.find(query).sort({ displayOrder: 1, 'name.en': 1 });
};

/**
 * Check if category name exists for merchant (case-insensitive)
 * Excludes soft-deleted categories
 * 
 * @param {string} nameEn - English name to check
 * @param {ObjectId} merchantId
 * @param {ObjectId} [excludeId] - Exclude this ID (for updates)
 * @returns {Promise<boolean>}
 */
categorySchema.statics.nameExistsForMerchant = async function(nameEn, merchantId, excludeId = null) {
  const query = {
    merchant: merchantId,
    'name.en': new RegExp(`^${nameEn.trim()}$`, 'i'), // Case-insensitive match
    isActive: true,
    deletedAt: null // Exclude soft-deleted categories
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
  auditedFields: ['name', 'description', 'icon', 'displayOrder', 'isActive', 'deletedAt'],
  auditDeletes: true
});

// ══════════════════════════════════════════════════════════════════════════
// MODEL EXPORT
// ══════════════════════════════════════════════════════════════════════════

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);
