// models/comboModel.js
const mongoose = require('mongoose');

const comboItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Menu',
    required: true,
  },
  // Fallback in case the menu item is deleted later
  nameFallback: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
  },
});

const comboSchema = new mongoose.Schema(
  {
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: [true, 'Combo must have a name'],
      trim: true,
      maxlength: 100,
    },

    slug: String,

    description: {
      type: String,
      trim: true,
      maxlength: 600,
    },

    // What is actually included in this combo
    items: {
      type: [comboItemSchema],
      validate: [v => v.length > 0, 'Combo must include at least one item'],
    },

    // Pricing
    originalPrice: {
      type: Number,
      min: 0,
    },
    comboPrice: {
      type: Number,
      required: [true, 'Combo price is required'],
      min: [0.01, 'Combo price must be greater than zero'],
    },

    savingsAmount: {
      type: Number,
      default: function () {
        return this.originalPrice ? this.originalPrice - this.comboPrice : 0;
      },
    },
    savingsText: {
      type: String,
      default: function () {
        if (this.savingsAmount > 0) {
          return `Save ${this.savingsAmount.toFixed(2)}!`;
        }
        return null;
      },
    },

    // Visuals
    image: { type: String },
    bannerImage: { type: String },

    // Scheduling & Availability
    isActive: {
      type: Boolean,
      default: true,
    },
    branches: {
  type: [mongoose.Schema.Types.ObjectId],
  ref: 'Branch',
  default: [], // allow global combos
},

    validFrom: { type: Date },
    validUntil: { type: Date },

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

    // Limits & Tracking
    maxPerOrder: {
      type: Number,
      default: 10,
      min: 1,
    },
    totalSold: {
      type: Number,
      default: 0,
    },

    // Display priority (higher = shown first in specials section)
    priority: {
      type: Number,
      default: 0,
    },

    tags: [String], // e.g., ["ramadan", "family-deal", "lunch-special", "bogo"]

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
comboSchema.index({ branches: 1, isActive: 1 });
comboSchema.index({ branches: 1, priority: -1 });
comboSchema.index({ merchant: 1, branches: 1 });
comboSchema.index({ validUntil: 1 }, { expireAfterSeconds: 0 }); // auto-delete expired combos!

// ========================= MIDDLEWARE =========================
comboSchema.pre('save', async function (next) {
  if (this.isModified('items') || !this.originalPrice) {
    await this.populate('items.menuItem');
    const total = this.items.reduce((sum, item) => {
      if (item.menuItem?.defaultVariant?.price) {
        return sum + (item.menuItem.defaultVariant.price * item.quantity);
      }
      return sum + (item.menuItem?.variants?.[0]?.price || 0) * item.quantity;
    }, 0);
    this.originalPrice = total;
  }
  next();
});

// Pre-populate menuItem details + fallback name
comboSchema.pre(/^find/, function (next) {
  this.populate('items.menuItem');
  next();
});

module.exports = mongoose.model('Combo', comboSchema);
