const mongoose = require('mongoose');
const slugify = require('slugify');
// Helper for time-to-minutes conversion (useful for filtering availability)
const timeToMinutes = timeStr => {
  const [hrs, mins] = timeStr.split(':').map(Number);
  return hrs * 60 + mins;
};

// 1. SHARED ITEM SCHEMA
const comboItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Menu',
    required: true,
  },
  nameFallback: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
});

// 2. BRANCH OVERRIDE SCHEMA
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
});

// 3. MAIN COMBO SCHEMA
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
    description: { type: String, trim: true, maxlength: 600 },

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

    // Visuals & Scheduling
    image: String,
     image: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'FileAsset',
          default: null,
        },
    isActive: { type: Boolean, default: true },
    branches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],

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
  },
  {
    timestamps: true, // Replaces manual createdAt/updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ========================= INDEXES =========================
comboSchema.index({ merchant: 1, branches: 1, isActive: 1 });
comboSchema.index({ 'branchOverrides.branch': 1 });
comboSchema.index({ validUntil: 1 }, { expireAfterSeconds: 0 });

// ========================= VIRTUALS =========================
// Using virtuals ensures "Savings" are always calculated based on the latest prices
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
  return this.imageUrl || null;
});

// ========================= METHODS =========================

/**
 * Professional Instance Method to check if combo is currently available
 * Logic: Checks specific branch override first, then falls back to global settings.
 */
comboSchema.methods.isAvailableNow = function (branchId) {
  const now = new Date();
  const currentDay = now.toLocaleString('en-us', { weekday: 'lowercase' });
  const currentTimeMin = timeToMinutes(`${now.getHours()}:${now.getMinutes()}`);

  // 1. Basic Status Checks
  if (!this.isActive) return false;

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

// ========================= MIDDLEWARE =========================

comboSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, {
      lower: true,
      strict: true,
    });
  }
  next();
});

module.exports = mongoose.model('Combo', comboSchema);
