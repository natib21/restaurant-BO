const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Merchant", // or "Restaurant"
    required: true,
  },
  name: {
    type: String,
    required: true, // e.g. "Cook Order", "Serve Drinks"
    trim: true,
    unique:true
  },
  description: {
    type: String,
    trim: true,
  },
  createdAt: { type: Date, default: Date.now },
});

const Task = mongoose.model("Task", taskSchema);
module.exports = Task;
