// models/Recipe.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const auditPlugin = require('../utils/auditPlugin');

const recipeItemSchema = new Schema(
  {
    // ✅ CHANGED: Store ingredient name instead of ObjectId for branch-level isolation
    // This allows the same recipe to work across branches with their own ingredient stocks
    ingredientName: {
      type: String,
      required: true,
      comment: 'Name of the ingredient (e.g., "Chicken", "Tomato") — resolved by merchant+name+unit at runtime'
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      required: true,
      enum: ['kg', 'g', 'liter', 'ml', 'pieces', 'boxes', 'cans'],
      comment: 'Must match the ingredient stock unit'
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
    // ✅ CHANGED: Lookup ingredient by name+unit instead of ObjectId
    // This enables branch-level ingredient isolation
    const ingredient = await mongoose.model('Ingredient').findOne({
      merchant: this.merchant,
      name: item.ingredientName,
      unit: item.unit,
      isActive: true,
    });
    
    if (!ingredient) {
      return next(new Error(
        `Ingredient "${item.ingredientName}" (${item.unit}) not found for this merchant`
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
