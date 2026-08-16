// models/OrderItem.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orderItemSchema = new Schema({
  menuItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Menu',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
  },
  total: {
    type: Number,
    required: true,
  },
  /**
   * Snapshotted Cost of Goods Sold (COGS) per unit at order placement time.
   * Computed from the menu item's recipe ingredients and their costPerUnit values.
   * This value is immutable after order creation to preserve historical profitability accuracy.
   * Set to null if the menu item has no recipe defined.
   */
  unitCost: {
    type: Number,
    default: null,
    min: 0,
  },
});

const OrderItem = mongoose.model('OrderItem', orderItemSchema);

module.exports = OrderItem;
