// models/Recipe.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

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

// Pre-save: Calculate total cost
recipeSchema.pre('save', async function (next) {
  let totalCost = 0;

  for (const item of this.items) {
    const ingredient = await mongoose.model('Ingredient').findById(item.ingredient);
    if (ingredient && ingredient.costPerUnit) {
      totalCost += item.quantity * ingredient.costPerUnit;
    }
  }

  this.totalCost = totalCost / this.yield; // Cost per serving
  next();
});

module.exports = mongoose.model('Recipe', recipeSchema);
