// models/menuItemModel.js
const mongoose = require('mongoose');
const slugify = require('slugify');

const variantSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    maxlength: 60,
    default: 'Regular', // fallback
  },
  // Keep size/volume for specific cases
  size: {
    type: String,
    trim: true,
    maxlength: 50,
    // Remove 'required' or make it conditional
  },
  volume: {
    type: String,
    trim: true,
    // e.g., "330ml", "Large", "500g"
  },
  price: {
    type: Number,
    min: [0, 'Price cannot be negative'],
  },
  calories: { type: Number },
  available: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false }, // useful for pre-selecting in UI
});

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

    isVeg: { type: Boolean, default: null }, // null = not specified
    isSpicy: { type: Boolean, default: false },

    // Variants (most items have multiple sizes/prices)
    variants: {
      type: [variantSchema],
      default: [], // ensures it's always an array
    },

    // Fallback price if no variants (rare, for simple items)
    price: { type: Number, min: 0 },

    image: { type: String, default: 'default-menu-item.jpg' },
    images: [String],

    prepTime: { type: String, default: '15-25 min' },

    ingredients: [String],
    allergens: [String],

    available: { type: Boolean, default: true },
    inStock: { type: Boolean, default: true },

    // Ratings
    ratingAverage: {
      type: Number,
      default: 4.5,
      min: [1, 'Rating must be above 1.0'],
      max: [5, 'Rating must be below 5.0'],
      set: v => Math.round(v * 10) / 10,
    },
    ratingQuantity: { type: Number, default: 0 },

    tags: [String], // e.g., ["trending", "chef-special", "ramadan", "vegan"]

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

// ========================= INDEXES =========================

menuSchema.index({ merchant: 1, available: 1 });
menuSchema.index({ merchant: 1, branches: 1 }); // fastest query
menuSchema.index({ branches: 1, available: 1 });

// ========================= MIDDLEWARE =========================
// Generate unique slug + update timestamp
menuSchema.pre('save', function (next) {
  if (this.isModified('name') || !this.slug) {
    const baseSlug = slugify(this.name, { lower: true, strict: true });
    this.slug = `${baseSlug}-${Date.now().toString(36)}`;
  }
  this.updatedAt = Date.now();
  next();
});

// ========================= VIRTUALS =========================
// Average price across variants
menuSchema.virtual('averagePrice').get(function () {
  if (this.variants && this.variants.length > 0) {
    const sum = this.variants.reduce((acc, v) => acc + v.price, 0);
    return Math.round(sum / this.variants.length);
  }
  return this.price || 0;
});

// Default variant (usually first one)
menuSchema.virtual('defaultVariant').get(function () {
  return this.variants?.[0] || null;
});

module.exports = mongoose.model('Menu', menuSchema);
