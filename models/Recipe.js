// models/Recipe.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const auditPlugin = require('../utils/auditPlugin');

const recipeItemSchema = new Schema(
  {
    ingredient: {
      type: Schema.Types.ObjectId,
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
      required: true,
    },
  },
  { _id: false }
);

const recipeSchema = new Schema(
  {
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    menuItem: {
      type: Schema.Types.ObjectId,
      ref: 'Menu',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    items: [recipeItemSchema],
    totalCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    yield: {
      type: Number,
      default: 1,
      min: 1,
    }, // How many servings this recipe makes
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
recipeSchema.index({ merchant: 1, menuItem: 1 }, { unique: true });
recipeSchema.index({ merchant: 1, isActive: 1 });

// Pre-save: Validate units and calculate total cost
recipeSchema.pre('save', async function (next) {
  let totalCost = 0;

  for (const item of this.items) {
    const ingredient = await mongoose.model('Ingredient').findById(item.ingredient);
    
    if (!ingredient) {
      return next(new Error(`Ingredient ${item.ingredient} not found`));
    }

    // STAGE 7: Unit conversion validation
    // Ensure recipe item unit matches ingredient unit (no conversion yet)
    if (item.unit !== ingredient.unit) {
      return next(new Error(
        `Unit mismatch: Recipe uses ${item.unit} but ingredient "${ingredient.name}" is stocked in ${ingredient.unit}. ` +
        `Please use matching units or convert manually.`
      ));
    }

    if (ingredient.costPerUnit) {
      totalCost += item.quantity * ingredient.costPerUnit;
    }
  }

  this.totalCost = totalCost / this.yield; // Cost per serving
  next();
});

// Apply audit plugin BEFORE model creation
recipeSchema.plugin(auditPlugin, {
  resource: 'Recipe',
  auditedFields: [
    'name',
    'items',
    'totalCost',
    'yield',
    'isActive',
    'menuItem',
  ],
});

module.exports = mongoose.model('Recipe', recipeSchema);
