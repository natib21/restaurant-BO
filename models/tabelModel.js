const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const tableSchema = new Schema(
  {
    tableNumber: {
      type: String,
      required: true,
      trim: true,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["available", "occupied", "reserved", "needs-cleaning"],
      default: "available",
    },
    location: {
      type: String,
      enum: ["indoor", "outdoor", "rooftop", "vip"],
      default: "indoor",
    },
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
    },
    currentOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
  },
  { timestamps: true }
);

const Table = mongoose.model("Table", tableSchema);

module.exports = Table;