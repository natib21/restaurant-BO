// models/menuModel.js
const mongoose = require('mongoose');
const slugify = require('slugify');

const variantSchema = new mongoose.Schema({
  size: {
    type: String,
    required: true,
    enum: [
      'XS',
      'S',
      'M',
      'L',
      'XL',
      '250ml',
      '330ml',
      '500ml',
      '1L',
      '2L',
      'Regular',
      'Large',
      'Small',
      'Medium',
    ],
  },
  volume: String,
  price: { type: Number, required: true, min: 0 },
  calories: Number,
  available: { type: Boolean, default: true },
});

const menuSchema = new mongoose.Schema(
  {
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: [true, 'Menu item must belong to a merchant'],
      index: true,
    },

    menuGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuGroup',
      required: [true, 'Item must belong to a menu group'],
      index: true,
    },

    name: {
      type: String,
      required: [true, 'Menu item must have a name'],
      trim: true,
      maxlength: 100,
    },

    slug: String,

    description: { type: String, trim: true, maxlength: 500 },

    type: {
      type: String,
      enum: ['food', 'drink'],
      required: true,
      default: 'food',
    },

    category: { type: String, required: true, trim: true },
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
      validate: [v => v.length > 0, 'At least one variant is required'],
    },

    price: { type: Number, min: 0 }, // fallback if no variants

    image: { type: String, default: 'default.jpg' },
    images: [String],

    prepTime: { type: String, default: '15-20 min' },

    // ==================== SPECIAL COMBO SYSTEM ====================
    isSpecial: {
      type: Boolean,
      default: false,
    },

    comboOffer: {
      name: { type: String }, // e.g., "Family Deal", "Buy 1 Get 1"

      description: {
        type: String,
        required: function () {
          return this.isSpecial;
        },
        maxlength: 400,
      },

      // Option A: List of included items (text only - most common)
      includedItems: [String], // e.g., ["2 Large Pizzas", "1 Garlic Bread", "4 Drinks"]

      // Option B: Link to real menu items (advanced)
      includedMenuItems: [
        {
          item: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu' },
          name: String, // fallback if deleted
          quantity: { type: Number, default: 1 },
        },
      ],

      originalPrice: { type: Number }, // Sum of individual prices
      comboPrice: {
        type: Number,
        required: function () {
          return this.isSpecial;
        },
        min: [1, 'Combo price required for special offers'],
      },

      savingsAmount: {
        type: Number,
        default: function () {
          if (this.originalPrice && this.comboPrice) {
            return this.originalPrice - this.comboPrice;
          }
          return 0;
        },
      },

      savingsText: { type: String }, // e.g., "Save 85 AED!"

      validFrom: { type: Date },
      validUntil: { type: Date },

      availableOnDays: [
        {
          type: String,
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
        },
      ],

      maxPerOrder: { type: Number, default: 10 },
      totalSold: { type: Number, default: 0 }, // optional tracking
    },
    // ==============================================================

    ingredients: [String],
    allergens: [String],

    available: { type: Boolean, default: true },
    inStock: { type: Boolean, default: true },

    ratingAverage: {
      type: Number,
      default: 4.5,
      min: 1,
      max: 5,
      set: v => Math.round(v * 10) / 10,
    },
    ratingQuantity: { type: Number, default: 0 },

    tags: [String], // e.g., ["trending", "ramadan", "brunch"]

    createdAt: { type: Date, default: Date.now, select: false },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
menuSchema.index({ merchant: 1, menuGroup: 1 });
menuSchema.index({ menuGroup: 1, available: 1 });
menuSchema.index({ isSpecial: 1, 'comboOffer.validUntil': 1 });
menuSchema.index({ slug: 1 });

// Auto generate slug + updatedAt
menuSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true }) + '-' + Date.now().toString(36);
  }
  this.updatedAt = Date.now();

  // Force rules for special offers
  if (this.isSpecial) {
    if (!this.comboOffer?.comboPrice || !this.comboOffer?.description) {
      return next(new Error('Special offer must have combo price and description'));
    }
    if (!this.comboOffer.includedItems || this.comboOffer.includedItems.length === 0) {
      return next(new Error('Please list what is included in the combo'));
    }
  } else {
    this.comboOffer = undefined;
  }

  next();
});

// Virtual: average price
menuSchema.virtual('averagePrice').get(function () {
  if (this.variants?.length > 0) {
    return Math.round(this.variants.reduce((a, v) => a + v.price, 0) / this.variants.length);
  }
  return this.price || this.comboOffer?.comboPrice;
});

module.exports = mongoose.model('Menu', menuSchema);
