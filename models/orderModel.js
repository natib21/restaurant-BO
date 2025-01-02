const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Embedded schema for order items
const orderItemSchema = new Schema({
  name: {
    type: String, // Menu item name (not a reference)
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
  totalPrice: {
    type: Number,
    required: true,
  },
});

// Main order schema
const orderSchema = new Schema({
  name: {
    type: String,
  },
  phone: {
    type: String,
    required: false, // optional for guest users
  },
  table: {
    type: String,
    required: false, // for dine-in orders
  },
  status: {
    type: String,
    enum: ['pending', 'preparing', 'served', 'completed'],
    default: 'pending',
  },
  cart: {
    type: [orderItemSchema],
    require: true,
  },
  totalPrice: {
    type: Number,
    require: [true, 'total amount must be set'],
  },
  createdAt: {
    type: Date,
    default: Date.now(),
  },
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
