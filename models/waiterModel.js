const mongoose = require('mongoose');

const waiterSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  shifts: [
    {
      date: { type: Date, required: true },
      hoursWorked: { type: Number, required: true },
    },
  ],
  ordersHandled: [
    {
      orderId: { type: mongoose.Schema.ObjectId, ref: 'Order' },
      date: { type: Date, required: true },
      totalAmount: Number,
    },
  ],
});

const Waiter = mongoose.model('Waiter', waiterSchema);

module.exports = Waiter;
