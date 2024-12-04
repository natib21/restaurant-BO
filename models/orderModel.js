// models/Order.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orderSchema = new Schema(
  {
    customerName: {
      type: String,
    },
    customerPhone: {
      type: Number,
      required: false, // optional for guest users
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
    items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OrderItem',
        required: true,
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now(),
    },
  },
  { timestamps: true }
);

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
