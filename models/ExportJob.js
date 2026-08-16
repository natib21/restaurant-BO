// models/ExportJob.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * ExportJob Model
 * 
 * Tracks asynchronous export job status for date ranges exceeding 366 days.
 * This is the only persistent data the Reports module owns.
 * 
 * Lifecycle:
 * 1. User requests export → ExportJob created with status 'pending'
 * 2. Background worker picks job → status 'processing'
 * 3. Report generated and saved via Files module → fileId populated, status 'ready'
 * 4. User downloads file via Files module endpoint
 * 5. After 7 days, MongoDB TTL index automatically deletes the document
 */
const exportJobSchema = new Schema(
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
      default: null,
      index: true,
    },
    reportType: {
      type: String,
      enum: ['sales', 'orders', 'products', 'customers', 'delivery', 'profitability', 'staff', 'inventory'],
      required: true,
    },
    dateFrom: {
      type: Date,
      required: true,
    },
    dateTo: {
      type: Date,
      required: true,
    },
    format: {
      type: String,
      enum: ['csv', 'xlsx', 'pdf'],
      default: 'csv',
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'ready', 'failed'],
      default: 'pending',
      index: true,
    },
    fileId: {
      type: Schema.Types.ObjectId,
      ref: 'FileAsset',
      default: null,
      comment: 'References Files module after successful generation',
    },
    errorMessage: {
      type: String,
      default: null,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for query performance
exportJobSchema.index({ merchant: 1, status: 1, createdAt: -1 });
exportJobSchema.index({ requestedBy: 1, createdAt: -1 });

// TTL index: Automatic cleanup after 7 days (604800 seconds)
exportJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

module.exports = mongoose.model('ExportJob', exportJobSchema);
