const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Tenant-scoped file metadata (bytes live in storage adapter, not in business models).
 */
const fileAssetSchema = new Schema(
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
    storageProvider: {
      type: String,
      enum: ['local', 's3'],
      default: 'local',
    },
    storageKey: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    sizeBytes: { type: Number, min: 0 },
    entityType: {
      type: String,
      enum: ['menu', 'branch', 'table', 'user', 'merchant', 'combo', 'order_payment', 'other'],
      required: true,
      index: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['image', 'logo', 'qr', 'receipt', 'document', 'other'],
      default: 'image',
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

fileAssetSchema.index({ merchant: 1, entityType: 1, entityId: 1, isDeleted: 1 });
fileAssetSchema.index({ merchant: 1, branch: 1, isDeleted: 1 });

fileAssetSchema.methods.getPublicUrl = function getPublicUrl() {
  const base = process.env.PUBLIC_API_URL || '';
  return `${base}/api/v1/files/${this._id}/content`;
};

module.exports = mongoose.model('FileAsset', fileAssetSchema);
