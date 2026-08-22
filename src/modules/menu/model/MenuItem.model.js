/**
 * @file src/modules/menu/model/MenuItem.model.js
 * @description Menu item model with multilingual support, variants, and soft-delete
 * 
 * Features:
 * - Localized names and descriptions (en, am)
 * - Multi-tenant scoping (merchant field)
 * - Category relationship (required categoryId)
 * - Variants support (different sizes, prices)
 * - Soft delete via deletedAt field
 * - Audit logging
 * - KDS integration (kitchen station assignment)
 * 
 * Relationships:
 * - merchant: Reference to Merchant (required)
 * - categoryId: Reference to Category (required)
 * - kitchenStation: Reference to KitchenStation (optional)
 * - image: Reference to FileAsset (optional)
 */

const mongoose = require('mongoose');
const slugify = require('slugify');
const auditPlugin = require('../../../../utils/auditPlugin');
const localizedTextSchema = require('../../../../utils/schemas/localizedText');
const commonFields = require('../../../../utils/schemas/commonFields');

// ══════════════════════════════════════════════════════════════════════════
// SUB-SCHEMAS
// ══════════════════════════════════════════════════════════════════════════

const variantSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    maxlength: 60,
    default: 'Regular',
  },
  size: {
    type: String,
    trim: true,
    maxlength: 50,
  },
  volume: {
    type: String,
    trim: true,
  },
  price: {
    type: Number,
    min: [0, 'Price cannot be negative'],
    required: [true, 'Variant price is required'],
  },
  calories: { type: Number },
  available: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
}, { _id: false });

const menuIngredientSchema = new mongoose.Schema(
  {
    ingredient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      enum: ['kg', 'g', 'liter', 'ml', 'pieces', 'boxes', 'cans'],
      required: true,
    },
  },
  { _id: false }
);

// ══════════════════════════════════════════════════════════════════════════
// MAIN SCHEMA
// ══════════════════════════════════════════════════════════════════════════

const menuItemSchema = new mongoose.Schema(
  {
    // Multi-tenant scoping
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: [true, 'Menu item must belong to a merchant'],
      index: true,
    },
    
    // Category relationship (required)
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Menu item must have a category'],
      index: true,
    },
    
    // ✅ Multilingual name support (en, am)
    name: {
      type: localizedTextSchema,
      required: [true, 'Menu item must have a name'],
    },

    slug: String,

    // ✅ Multilingual description support (en, am)
    description: {
      type: localizedTextSchema,
      required: false,
    },

    // Type: food or drink
    type: {
      type: String,
      enum: ['food', 'drink'],
      required: true,
      default: 'food',
    },

    // DEPRECATED: Legacy string-based category (kept for backward compatibility)
    // TODO: Remove after full migration to categoryId
    category: {
      type: String,
      trim: true,
      required: false,
    },
    
    // Food-specific properties
    isFasting: {
      type: Boolean,
      default: null,
      index: true,
    },
    cuisineOrigin: {
      type: String,
      enum: ['local', 'international'],
      default: 'local',
      index: true,
    },
    cuisineTags: {
      type: [String],
      default: [],
    },

    // Drink-specific properties
    drinkType: {
      type: String,
      enum: [
        'soft-drink',
        'juice',
        'beer',
        'wine',
        'cocktail',
        'hot-drink',
        'milkshake',
        'water',
        null,
      ],
      default: null,
    },
    isAlcoholic: { type: Boolean, default: false },
    alcoholPercentage: { type: Number, min: 0, max: 100, default: 0 },

    // Dietary properties
    isVeg: { type: Boolean, default: null },
    isSpicy: { type: Boolean, default: false },

    // Pricing and variants
    variants: {
      type: [variantSchema],
      default: [],
    },
    price: { type: Number, min: 0 },

    // Images
    image: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileAsset',
      default: null,
    },
    images: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileAsset',
      },
    ],
    
    // Preparation
    prepTime: { type: String, default: '15-25 min' },

    // Recipe and allergens
    recipe: {
      ingredients: {
        type: [menuIngredientSchema],
        default: [],
      },
    },
    allergens: [String],

    // Availability
    available: { type: Boolean, default: true },
    inStock: { type: Boolean, default: true },

    // Publishing
    publishStatus: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published',
      index: true,
    },

    // KDS integration
    kitchenStation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KitchenStation',
      default: null,
      index: true,
    },

    // Ratings
    ratingAverage: {
      type: Number,
      default: 4.5,
      min: [1, 'Rating must be above 1.0'],
      max: [5, 'Rating must be below 5.0'],
      set: v => Math.round(v * 10) / 10,
    },
    ratingQuantity: { type: Number, default: 0 },

    // Tags
    tags: [String],

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

menuItemSchema.index({ merchant: 1, available: 1, deletedAt: 1 });
menuItemSchema.index({ merchant: 1, categoryId: 1, deletedAt: 1 });
menuItemSchema.index({ merchant: 1, publishStatus: 1, available: 1 });
menuItemSchema.index({ merchant: 1, isFasting: 1 });
menuItemSchema.index({ merchant: 1, cuisineOrigin: 1 });
menuItemSchema.index({ merchant: 1, type: 1 });
menuItemSchema.index({ deletedAt: 1 });

// ══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════

menuItemSchema.pre('save', function (next) {
  if (this.isModified('name') || !this.slug) {
    // Use English name for slug generation
    const nameForSlug = this.name?.en || this.name || '';
    const baseSlug = slugify(nameForSlug, { lower: true, strict: true });
    this.slug = `${baseSlug}-${Date.now().toString(36)}`;
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

menuItemSchema.virtual('averagePrice').get(function () {
  if (this.variants && this.variants.length > 0) {
    const sum = this.variants.reduce((acc, v) => acc + v.price, 0);
    return Math.round(sum / this.variants.length);
  }
  return this.price || 0;
});

menuItemSchema.virtual('defaultVariant').get(function () {
  return this.variants?.[0] || null;
});

menuItemSchema.virtual('imageData').get(function () {
  if (this.image) {
    return `/api/v1/files/${this.image}/content`;
  }
  return null;
});

menuItemSchema.virtual('imagesData').get(function () {
  if (this.images && this.images.length > 0) {
    return this.images.map(id => `/api/v1/files/${id}/content`);
  }
  return [];
});

menuItemSchema.virtual('isDeleted').get(function() {
  return this.deletedAt !== null;
});

// ══════════════════════════════════════════════════════════════════════════
// INSTANCE METHODS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Soft delete menu item
 * 
 * @param {ObjectId} [userId] - User performing the deletion
 * @returns {Promise<MenuItem>}
 */
menuItemSchema.methods.softDelete = function(userId) {
  this.deletedAt = new Date();
  this.isActive = false;
  this.available = false; // Also mark as unavailable
  
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
 * Restore soft-deleted menu item
 * 
 * @returns {Promise<MenuItem>}
 */
menuItemSchema.methods.restore = function() {
  this.deletedAt = null;
  this.deletedBy = null;
  this.isActive = true;
  return this.save();
};

// ══════════════════════════════════════════════════════════════════════════
// PLUGINS
// ══════════════════════════════════════════════════════════════════════════

menuItemSchema.plugin(auditPlugin, {
  resource: 'MenuItem',
  auditedFields: ['name', 'price', 'categoryId', 'available', 'publishStatus', 'kitchenStation', 'inStock'],
});

// ══════════════════════════════════════════════════════════════════════════
// MODEL EXPORT
// ══════════════════════════════════════════════════════════════════════════

const MenuItem = mongoose.model('Menu', menuItemSchema);

module.exports = MenuItem;
