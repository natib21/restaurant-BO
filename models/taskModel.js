const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const taskSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Task must have a name'],
    trim: true,
    unique: true, // Ensures unique task names
  },
  endpoint: {
    type: String,
    required: [true, 'Task must have an endpoint'],
    trim: true,
  },
  method: {
    type: String,
    required: [true, 'Task must have an HTTP method'],
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  },
  description: {
    type: String,
    trim: true,
  },
 /*  category: {
    type: String,
    required: true,
    enum: [
      'Merchant Management',
      'Merchant Profile',
      'Staff Management',
      'Roles & Permissions',
      'Menu Management',
      'Order Management',
      'System Permissions',
    ]
  }, */
  // Optional: hide from merchant UI
  isMerchant: { type: Boolean, default: false },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  hidden: { type: Boolean, default: false },
});

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
