const path = require('path');
const FileAsset = require('../../../models/FileAsset');
const AppError = require('../../../utils/appError');
const logger = require('../../../utils/logger');
const { storeLocal, readLocal, deleteLocal } = require('../../infrastructure/storage/local-storage.adapter');

class FileManagementService {
  /**
   * Register uploaded bytes as a tenant-scoped FileAsset (metadata only in Mongo).
   */
  static async registerUpload({
    merchantId,
    branchId,
    buffer,
    originalName,
    mimeType,
    entityType,
    entityId,
    purpose,
    uploadedBy,
  }) {
    const extension = path.extname(originalName || '') || '.bin';
    const stored = await storeLocal({
      merchantId: String(merchantId),
      branchId: branchId ? String(branchId) : null,
      buffer,
      extension: extension.replace('.', ''),
    });

    const file = await FileAsset.create({
      merchant: merchantId,
      branch: branchId || null,
      storageProvider: stored.provider,
      storageKey: stored.storageKey,
      originalName,
      mimeType,
      sizeBytes: buffer.length,
      entityType,
      entityId: entityId || null,
      purpose: purpose || 'image',
      uploadedBy: uploadedBy || null,
    });

    logger.info('file.registered', {
      fileId: file._id.toString(),
      merchantId: String(merchantId),
      entityType,
    });

    return file;
  }

  static async getById(fileId, merchantId) {
    const file = await FileAsset.findOne({
      _id: fileId,
      merchant: merchantId,
      isDeleted: false,
    });
    if (!file) throw new AppError('File not found', 404);
    return file;
  }

  static async getContent(fileId, merchantId) {
    const file = await FileManagementService.getById(fileId, merchantId);
    if (file.storageProvider !== 'local') {
      throw new AppError('Storage provider not supported for read', 501);
    }
    const buffer = await readLocal(file.storageKey);
    return { file, buffer };
  }

  static async listForEntity({ merchantId, entityType, entityId, branchId }) {
    const query = {
      merchant: merchantId,
      entityType,
      entityId,
      isDeleted: false,
    };
    if (branchId) query.branch = branchId;
    return FileAsset.find(query).sort('-createdAt').lean();
  }

  /** Soft delete — bytes removed asynchronously-safe (storage delete best-effort). */
  static async softDelete(fileId, merchantId) {
    const file = await FileManagementService.getById(fileId, merchantId);
    file.isDeleted = true;
    file.deletedAt = new Date();
    await file.save();

    try {
      if (file.storageProvider === 'local') {
        await deleteLocal(file.storageKey);
      }
    } catch (error) {
      logger.warn('file.storage.delete_failed', {
        fileId: file._id.toString(),
        error: error.message,
      });
    }

    return file;
  }

  /**
   * Resolve public URL for entity (prefer latest non-deleted file).
   */
  static async resolveEntityFileUrl({ merchantId, entityType, entityId }) {
    const file = await FileAsset.findOne({
      merchant: merchantId,
      entityType,
      entityId,
      isDeleted: false,
    }).sort('-createdAt');

    return file ? file.getPublicUrl() : null;
  }
}

module.exports = { FileManagementService };
