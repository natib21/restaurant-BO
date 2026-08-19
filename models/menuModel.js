const mongoose = require('mongoose');
const slugify = require('slugify');
const auditPlugin = require('../utils/auditPlugin');

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
});

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

const menuSchema = new mongoose.Schema(
  {
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: [true, 'Menu item must belong to a merchant'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Menu item must have a name'],
      trim: true,
      maxlength: 100,
    },

    slug: String,

    description: {
      type: String,
      trim: true,
      maxlength: 800,
    },

    type: {
      type: String,
      enum: ['food', 'drink'],
      required: true,
      default: 'food',
    },

    category: {
      type: String,
      trim: true,
      required: [true, 'Category is required'],
    },

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

    isVeg: { type: Boolean, default: null },
    isSpicy: { type: Boolean, default: false },

    variants: {
      type: [variantSchema],
      default: [],
    },

    price: { type: Number, min: 0 },

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
    prepTime: { type: String, default: '15-25 min' },

    recipe: {
      ingredients: {
        type: [menuIngredientSchema],
        default: [],
      },
    },
    allergens: [String],

    available: { type: Boolean, default: true },
    inStock: { type: Boolean, default: true },

    publishStatus: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published',
      index: true,
    },

    // ✅ PHASE 0: KDS integration - station assignment
    kitchenStation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KitchenStation',
      default: null,
      index: true,
    },

    ratingAverage: {
      type: Number,
      default: 4.5,
      min: [1, 'Rating must be above 1.0'],
      max: [5, 'Rating must be below 5.0'],
      set: v => Math.round(v * 10) / 10,
    },
    ratingQuantity: { type: Number, default: 0 },

    tags: [String],

    createdAt: {
      type: Date,
      default: Date.now,
      select: false,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// FIX: this file previously had two extra indexes referencing a `branches`
// field that doesn't exist anywhere in this schema (`{ merchant: 1, branches: 1 }`
// and `{ branches: 1, available: 1 }`). Mongo will happily build an index on a
// path that's always undefined — it just never gets used and wastes write
// overhead. If branch-level menu visibility is something you need (the way
// `Combo` supports `branchOverrides`), that has to be added as a real field
// first — see note in the review.
menuSchema.index({ merchant: 1, available: 1 });

menuSchema.pre('save', function (next) {
  if (this.isModified('name') || !this.slug) {
    const baseSlug = slugify(this.name, { lower: true, strict: true });
    this.slug = `${baseSlug}-${Date.now().toString(36)}`;
  }
  this.updatedAt = Date.now();
  next();
});

menuSchema.virtual('averagePrice').get(function () {
  if (this.variants && this.variants.length > 0) {
    const sum = this.variants.reduce((acc, v) => acc + v.price, 0);
    return Math.round(sum / this.variants.length);
  }
  return this.price || 0;
});

menuSchema.virtual('defaultVariant').get(function () {
  return this.variants?.[0] || null;
});

menuSchema.virtual('imageData').get(function () {
  if (this.image) {
    return `/api/v1/files/${this.image}/content`;
  }
  return null;
});

menuSchema.virtual('imagesData').get(function () {
  if (this.images && this.images.length > 0) {
    return this.images.map(id => `/api/v1/files/${id}/content`);
  }
  return [];
});

// Apply audit plugin BEFORE model creation
menuSchema.plugin(auditPlugin, {
  resource: 'Menu',
  auditedFields: ['name', 'price', 'category', 'available', 'publishStatus', 'kitchenStation', 'inStock'],
});

module.exports = mongoose.model('Menu', menuSchema);
