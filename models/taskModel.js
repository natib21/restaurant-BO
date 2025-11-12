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
  isMerchant: { type: Boolean, default: false },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
