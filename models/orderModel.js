const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Embedded schema for order items
const orderItemSchema = new Schema({
  menuItemId: {
    type: mongoose.Schema.ObjectId,
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
});

// Main order schema
const orderSchema = new Schema({
  customerName: {
    type: String,
  },
  customerPhone: {
    type: String,
    required: false, // optional for guest users
    unique: true,
  },
  status: {
    type: String,
    enum: ['pending', 'preparing', 'served', 'completed'],
    default: 'pending',
  },
  tableNumber: {
    type: String,
    required: false, // for dine-in orders
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  subtotal: {
    type: Number,
    required: true,
  },
  items: {
    type: [orderItemSchema],
  },

  createdAt: {
    type: Date,
    default: Date.now(),
  },
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
