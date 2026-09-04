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

    // Enhanced evidence metadata for review, retries, and matching
    submittedByType: {
      type: String,
      enum: ['customer', 'waiter', 'staff', 'admin', 'system'],
      default: 'staff',
    },
    submittedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    submissionMethod: {
      type: String,
      enum: ['manual_reference', 'qr_scan', 'pdf_download', 'manual_review'],
      default: 'manual_reference',
    },

    originalReference: {
      type: String,
      trim: true,
      default: null,
    },
    normalizedReference: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    rawQrPayload: {
      type: String,
      trim: true,
      default: null,
    },
    sourceUrl: {
      type: String,
      trim: true,
      default: null,
    },
    officialDocumentAssetId: {
      type: Schema.Types.ObjectId,
      ref: 'FileAsset',
      default: null,
    },
    extractedRawText: {
      type: String,
      default: null,
    },
    extractionMethod: {
      type: String,
      enum: ['manual_reference', 'provider_html', 'provider_pdf_native_text', 'manual_review'],
      default: 'manual_reference',
    },
    normalizedTransaction: {
      amount: { type: Number, min: 0, default: null },
      currency: { type: String, trim: true, default: null },
      provider: { type: String, trim: true, default: null },
      reference: { type: String, trim: true, default: null },
      transactionDate: { type: Date, default: null },
      receiver: { type: String, trim: true, default: null },
    },
    matchResult: {
      amountMatch: { type: Boolean, default: false },
      currencyMatch: { type: Boolean, default: false },
      providerMatch: { type: Boolean, default: false },
      referenceValid: { type: Boolean, default: false },
      referenceUnique: { type: Boolean, default: false },
      receiverMatch: { type: Boolean, default: null },
      transactionTimeValid: { type: Boolean, default: null },
      warnings: [{ type: String, trim: true }],
    },
    failureCode: {
      type: String,
      trim: true,
      default: null,
    },
    reviewStatus: {
      type: String,
      enum: ['pending_review', 'verified', 'rejected', 'failed', 'needs_review'],
      default: 'pending_review',
      index: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
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
    pdfDownloaded: { type: Boolean, default: false },
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
PaymentVerificationSchema.index({ merchant: 1, normalizedReference: 1, provider: 1 });
PaymentVerificationSchema.index({ provider: 1, normalizedReference: 1, merchant: 1 }, { unique: false });

// Audit logging for security-sensitive operations
PaymentVerificationSchema.plugin(auditPlugin, {
  resource: 'PaymentVerification',
  auditedFields: ['status', 'verifiedBy', 'verifiedAt', 'rejectionReason', 'receiptFileRef'],
});

module.exports = mongoose.model('PaymentVerification', PaymentVerificationSchema);
