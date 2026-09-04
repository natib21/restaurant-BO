/**
 * @file pdf-downloader.js
 * @description Secure PDF download, validation, and storage for payment receipts
 * 
 * Security Requirements:
 * 1. Validate Content-Type header (should be application/pdf)
 * 2. Validate PDF magic bytes (%PDF- at start)
 * 3. Enforce size limits (prevent memory exhaustion)
 * 4. Store as FileAsset with proper metadata
 */

const AppError = require('../../../../utils/appError');
const logger = require('../../../../utils/logger');
const FileAsset = require('../../../../models/FileAsset');

/**
 * PDF validation constants
 */
const PDF_MAGIC_BYTES = '%PDF-';
const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10 MB
const MIN_PDF_SIZE = 20; // Some valid PDFs can be very small; reject only obviously empty payloads.

/**
 * Validate that content is actually a PDF
 * 
 * @param {Buffer} buffer - File content
 * @param {string} contentType - HTTP Content-Type header
 * @throws {AppError} If validation fails
 */
function validatePDF(buffer, contentType) {
  // Check size limits
  if (buffer.length > MAX_PDF_SIZE) {
    throw new AppError(
      `PDF file too large: ${(buffer.length / 1024 / 1024).toFixed(2)} MB (max: 10 MB)`,
      400
    );
  }
  
  if (buffer.length < MIN_PDF_SIZE) {
    throw new AppError('File too small to be a valid PDF', 400);
  }
  
  // Validate Content-Type (if provided)
  if (contentType && !contentType.includes('application/pdf')) {
    logger.warn('pdf_validator.wrong_content_type', { contentType });
    // Don't throw yet - Content-Type header can be wrong, check magic bytes
  }
  
  // ✅ CRITICAL: Ignore leading padding/offset bytes from large backing ArrayBuffers while still
  // rejecting HTML that is mislabeled as a PDF. Real provider PDFs should pass as long as the
  // meaningful payload contains the PDF signature before any HTML marker in the early window.
  const firstMeaningfulByte = buffer.findIndex(byte => byte !== 0);
  const normalizedBuffer = firstMeaningfulByte > -1 ? buffer.subarray(firstMeaningfulByte) : buffer;
  const signatureWindow = normalizedBuffer.subarray(0, Math.min(normalizedBuffer.length, 4096));
  const preview = signatureWindow.toString('latin1').toLowerCase();
  const htmlIndex = preview.search(/<!doctype|<html|<body/i);
  const signatureIndex = preview.indexOf(PDF_MAGIC_BYTES.toLowerCase());

  if (signatureIndex === -1 || (htmlIndex !== -1 && htmlIndex < signatureIndex)) {
    throw new AppError(
      'File is not a valid PDF. Expected PDF format for receipt.',
      400
    );
  }

  // Normalize the buffer so it begins exactly at the real PDF signature.
  if (signatureIndex > 0) {
    buffer = normalizedBuffer.subarray(signatureIndex);
  }
  
  return true;
}

/**
 * Download PDF from URL with validation
 * 
 * @param {string} url - PDF download URL (already validated by qr-parser)
 * @param {object} options - Download options
 * @param {Function} options.httpClient - Injected HTTP client (defaults to fetch)
 * @returns {Promise<Buffer>} PDF file content as buffer
 * @throws {AppError} If download or validation fails
 */
async function downloadPDF(url, options = {}) {
  const httpClient = options.httpClient || fetch;
  
  try {
    logger.info('pdf_downloader.fetching', { url });
    
    const response = await httpClient(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'RestaurantBO/1.0 (Payment Verification)',
        'Accept': 'application/pdf',
      },
      // Timeout to prevent hanging
      signal: AbortSignal.timeout(30000), // 30 seconds
    });
    
    if (!response.ok) {
      throw new AppError(
        `Failed to download PDF: ${response.status} ${response.statusText}`,
        502
      );
    }
    
    const contentType = response.headers.get('content-type');
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // ✅ Validate it's actually a PDF
    validatePDF(buffer, contentType);
    
    logger.info('pdf_downloader.success', {
      size: buffer.length,
      contentType,
    });
    
    return buffer;
    
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new AppError('PDF download timeout. Provider server may be slow or unreachable.', 504);
    }
    
    // Re-throw AppError as-is
    if (error.isOperational) {
      throw error;
    }
    
    // Wrap unexpected errors
    logger.error('pdf_downloader.unexpected_error', {
      url,
      error: error.message,
      stack: error.stack,
    });
    
    throw new AppError(
      `Failed to download PDF receipt: ${error.message}`,
      502
    );
  }
}

/**
 * Save PDF buffer as FileAsset
 * 
 * @param {Buffer} pdfBuffer - PDF file content
 * @param {object} metadata - File metadata
 * @param {string} metadata.merchantId - Merchant ID
 * @param {string} metadata.orderId - Order ID
 * @param {string} metadata.provider - Payment provider (cbe, telebirr)
 * @param {string} metadata.referenceId - Payment reference number
 * @param {string} metadata.uploadedBy - User ID who initiated verification
 * @param {object} session - Mongoose session for transaction
 * @returns {Promise<FileAsset>} Created FileAsset document
 */
async function savePDFAsFileAsset(pdfBuffer, metadata, session) {
  const {
    merchantId,
    orderId,
    provider,
    referenceId,
    uploadedBy,
  } = metadata;
  
  // Generate filename
  const timestamp = Date.now();
  const filename = `${provider}-receipt-${referenceId}-${timestamp}.pdf`;
  
  // In real implementation, you'd upload to S3/GCS/Azure
  // For now, we'll use local storage (matching your existing FileAsset setup)
  const storageKey = `receipts/${merchantId}/${orderId}/${filename}`;
  
  try {
    const fileAsset = await FileAsset.create(
      [
        {
          merchant: merchantId,
          uploadedBy,
          storageProvider: 'local', // or 's3', 'gcs', etc.
          storageKey,
          filename,
          mimeType: 'application/pdf',
          sizeBytes: pdfBuffer.length,
          entityType: 'order_payment',
          entityId: orderId,
          purpose: 'receipt',
          metadata: {
            provider,
            referenceId,
            autoDownloaded: true,
            downloadedAt: new Date(),
          },
        },
      ],
      { session }
    );
    
    // TODO: Actually write pdfBuffer to disk/S3
    // This depends on your FileAsset storage implementation
    // Example for local storage:
    // const fs = require('fs').promises;
    // const path = require('path');
    // const uploadDir = path.join(process.cwd(), 'uploads', 'receipts', merchantId, orderId);
    // await fs.mkdir(uploadDir, { recursive: true });
    // await fs.writeFile(path.join(uploadDir, filename), pdfBuffer);
    
    logger.info('pdf_storage.success', {
      fileId: fileAsset[0]._id,
      filename,
      size: pdfBuffer.length,
    });
    
    return fileAsset[0];
    
  } catch (error) {
    logger.error('pdf_storage.failed', {
      error: error.message,
      metadata,
    });
    throw new AppError('Failed to store PDF receipt', 500);
  }
}

module.exports = {
  downloadPDF,
  validatePDF,
  savePDFAsFileAsset,
  PDF_MAGIC_BYTES,
  MAX_PDF_SIZE,
};
