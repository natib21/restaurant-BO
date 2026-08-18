// models/KitchenTicket.js
// ✅ PHASE 0: Kitchen Display System - Ticket model
const mongoose = require('mongoose');
const { Schema } = mongoose;

const kitchenTicketItemSchema = new Schema(
  {
    orderItemId: {
      type: Schema.Types.ObjectId,
      required: true,
      // References Order.items[i]._id (now enabled in Phase 0)
    },
    menuItem: {
      type: Schema.Types.ObjectId,
      ref: 'Menu',
      required: true,
    },
    menuItemName: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    notes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'ready'],
      default: 'pending',
    },
    startedAt: Date,
    completedAt: Date,
  },
  { _id: true }
);

const kitchenTicketSchema = new Schema(
  {
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    branch: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    station: {
      type: Schema.Types.ObjectId,
      ref: 'KitchenStation',
      required: true,
      index: true,
    },
    ticketNumber: {
      type: String,
      required: true,
      index: true,
      // Format: GRILL-42, SALAD-15
    },
    orderNumber: {
      type: String,
      required: true,
    },
    orderType: {
      type: String,
      enum: ['dine_in', 'takeaway', 'delivery'],
      required: true,
    },
    tableNumber: {
      type: String,
      trim: true,
    },
    items: {
      type: [kitchenTicketItemSchema],
      required: true,
      validate: {
        validator: (arr) => arr.length > 0,
        message: 'Ticket must have at least one item',
      },
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'in_progress', 'ready', 'completed', 'canceled'],
      default: 'pending',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    acceptedAt: Date,
    startedAt: Date,
    completedAt: Date,
    canceledAt: Date,
    canceledBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    canceledReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Fast queries for active tickets per station (createdAt from timestamps: true)
kitchenTicketSchema.index({ station: 1, status: 1, createdAt: 1 });

// For checking all tickets of an order
kitchenTicketSchema.index({ order: 1 });

// For station dashboard with priority sorting
kitchenTicketSchema.index({ station: 1, status: 1, priority: -1, createdAt: 1 });

module.exports = mongoose.model('KitchenTicket', kitchenTicketSchema);
