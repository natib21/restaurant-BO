// models/StockHistory.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const stockHistorySchema = new Schema({
  ingredient: { 
    type: Schema.Types.ObjectId, 
    ref: 'Ingredient', 
    required: true,
    index: true
  },
  merchant: { 
    type: Schema.Types.ObjectId, 
    ref: 'Merchant', 
    required: true,
    index: true
  },
  branch: { 
    type: Schema.Types.ObjectId, 
    ref: 'Branch', 
    required: true  // REQUIRED - all orders have branch
  },
  
  action: { 
    type: String, 
    enum: [
      'ADDED',      // Stock added (purchase/restock)
      'USED',       // Stock deducted (order fulfilled)
      'RESERVED',   // Stock reserved (order pending)
      'RELEASED',   // Reservation released (order canceled)
      'ADJUSTED',   // Manual adjustment
      'WASTE',      // Spoilage/damage
      'CORRECTED'   // Rollback/error correction
    ], 
    required: true 
  },
  
  quantity: { 
    type: Number, 
    required: true 
  },
  
  stockBefore: Number,
  stockAfter: Number,
  reservedBefore: Number,
  reservedAfter: Number,
  unit: String,
  
  // Context
  supplier: String,
  orderId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Order' 
  },
  batchNumber: String,
  expiryDate: Date,
  reason: String,
  costPrice: Number,
  
  recordedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  },
  recordedAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  
  previousStatus: String,
  newStatus: String,
}, {
  timestamps: true
});

// Indexes for reporting
stockHistorySchema.index({ ingredient: 1, recordedAt: -1 });
stockHistorySchema.index({ merchant: 1, branch: 1, action: 1 });
stockHistorySchema.index({ merchant: 1, branch: 1, recordedAt: -1 });
stockHistorySchema.index({ orderId: 1 });

module.exports = mongoose.model('StockHistory', stockHistorySchema);
