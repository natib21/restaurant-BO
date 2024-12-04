const mongoose = require('mongoose');

const waiterSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },

  ordersHandled: [
    {
      orderId: {
        type: mongoose.Schema.ObjectId,
        ref: 'Order',
      },
      date: {
        type: Date,
        required: true,
      },
      totalAmount: Number,
      status: {
        type: String,
        enum: ['completed', 'pending', 'cancelled'], // Add order status
        required: true,
      },
    },
  ],
});

const Waiter = mongoose.model('Waiter', waiterSchema);

module.exports = Waiter;
