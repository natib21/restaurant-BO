const mongoose = require('mongoose');
const { Schema } = mongoose;
const auditPlugin = require('../utils/auditPlugin');

const PaymentVerificationSchema = new Schema(
  {
    merchant: { 
      type: Schema.Types.ObjectId, 
      ref: 'Merchant', 
      required: true, 
      index: true 
    },
    order: { 
      type: Schema.Types.ObjectId, 
      ref: 'Order', 
      required: true, 
      index: true 
    },
    
    // Provider info
    provider: { 
      type: String, 
      enum: ['telebirr', 'cbe', 'cbebirr'], 
      required: true,
      index: true 
    },
    providerReference: { 
      type: String, 
      required: true,
      index: true 
    },
    
    // Verification type - describes how this verification was performed
    verificationType: {
      type: String,
      enum: [
        'manual_entry_auto_lookup', 
        'manual_entry_lookup_failed', 
        'manual_entry_pdf_downloaded',  // CBEBirr PDF receipts
        'qr_scan',
        'qr_scan_pdf_downloaded',  // QR-based PDF receipts
      ],
      default: 'manual_entry_auto_lookup',
    },
    
    // Parsed transaction data from provider page
    parsed: {
      amount: { type: Number, min: 0 },
      payerName: { type: String, trim: true },
      payerAccountOrPhone: { type: String, trim: true },
      receiverName: { type: String, trim: true },
      receiverAccount: { type: String, trim: true },
      transactionDate: { type: Date },
      status: { type: String }, // Raw status from provider (e.g., "SUCCESS", "COMPLETED")
      fullRawText: { type: String },
    },
    
    // Validation results (computed at initiation time)
    amountMatch: { type: Boolean },
    accountMatch: { type: Boolean },
    
    // Parse quality flag for ambiguous cases
    parseQuality: {
      type: String,
      enum: [
        'high', 
        'medium', 
        'low', 
        'failed',
        'pdf_manual_review_required',  // PDF receipts that cannot be auto-parsed
      ],
      default: 'high',
    },
    
    // Status workflow
    status: {
      type: String,
      enum: ['pending_review', 'verified', 'rejected', 'lookup_failed'],
      default: 'pending_review',
      required: true,
      index: true
    },
    
    // Verification outcome
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
    // Receipt photo: REQUIRED for Telebirr manual verifications (no working auto-lookup),
    // optional for CBE auto-lookup verifications (working automated lookup)
    receiptFileRef: { type: Schema.Types.ObjectId, ref: 'FileAsset' },
    
    // Error tracking
    lookupError: { type: String },
    retryCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ✅ CRITICAL: Fraud prevention - one receipt = one order
// Prevents receipt reuse across multiple orders
PaymentVerificationSchema.index(
  { provider: 1, providerReference: 1 },
  { 
    unique: true, 
    name: 'unique_provider_reference'
  }
);

// Query optimization indexes
PaymentVerificationSchema.index({ merchant: 1, status: 1, createdAt: -1 });
PaymentVerificationSchema.index({ merchant: 1, order: 1 });

// Audit logging for security-sensitive operations
PaymentVerificationSchema.plugin(auditPlugin, {
  resource: 'PaymentVerification',
  auditedFields: ['status', 'verifiedBy', 'verifiedAt', 'rejectionReason', 'receiptFileRef'],
});

module.exports = mongoose.model('PaymentVerification', PaymentVerificationSchema);
