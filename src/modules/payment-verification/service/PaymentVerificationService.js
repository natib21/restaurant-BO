const mongoose = require('mongoose');
const { resolveProvider } = require('./providers');
const PaymentVerificationRepository = require('../repository/PaymentVerificationRepository');
const PaymentCompletionService = require('./PaymentCompletionService');
const Order = require('../../../../models/orderModel');
const FileAsset = require('../../../../models/FileAsset');
const AppError = require('../../../../utils/appError');
const logger = require('../../../../utils/logger');

class PaymentVerificationService {
  /**
   * Initiate manual verification with safe error handling
   * 
   * @param {Object} params
   * @param {ObjectId} params.merchantId
   * @param {ObjectId} params.orderId
   * @param {string} params.provider - 'telebirr' or 'cbe'
   * @param {string} params.receiptNumber - Receipt/reference number from provider
   * @param {ObjectId} params.userId - User initiating the verification
   */
  static async initiateManualVerification(params) {
    const { merchantId, orderId, provider, receiptNumber, userId } = params;
    
    // 1. Validate order
    const order = await Order.findOne({ 
      _id: orderId, 
      merchant: merchantId 
    });
    
    if (!order) {
      throw new AppError('Order not found', 404);
    }
    
    if (order.paymentStatus === 'paid') {
      throw new AppError('Order is already paid', 400);
    }
    
    if (order.status === 'canceled') {
      throw new AppError('Cannot verify payment for canceled order', 400);
    }
    
    // 2. Clean receipt number (uppercase for consistency)
    const cleanedReceiptNo = receiptNumber.toUpperCase().trim();
    
    // 3. Early duplicate check
    const existing = await PaymentVerificationRepository.findOne({
      provider,
      providerReference: cleanedReceiptNo,
    });
    
    if (existing) {
      throw new AppError(
        `This ${provider.toUpperCase()} receipt (${cleanedReceiptNo}) has already been used for order ${existing.order}`,
        409
      );
    }
    
    // 4. Resolve provider and verify
    const providerInstance = resolveProvider(provider);
    
    let result;
    try {
      result = await providerInstance.verify(cleanedReceiptNo, {
        orderAmount: order.totalAmount
      });
    } catch (error) {
      // If it's an AppError (validation error), re-throw it
      if (error.isOperational) {
        throw error;
      }
      
      // Otherwise log and convert to generic error
      logger.error('payment.verification.provider_error', {
        provider,
        reference: cleanedReceiptNo,
        error: error.message,
      });
      throw new AppError('Payment verification failed. Please try again.', 500);
    }
    
    // 5. ✅ CORRECTED: Route to appropriate status based on parse quality
    let status = 'pending_review';
    let rejectionReason = null;
    let lookupError = result.lookupError || null;
    
    if (result.parseQuality === 'failed') {
      status = 'lookup_failed';
    } else if (result.parseQuality === 'pdf_manual_review_required') {
      // CBEBirr returns PDF - keep as pending_review
      status = 'pending_review';
      lookupError = 'PDF receipt downloaded - requires manual review';
    } else if (result.parseQuality === 'low') {
      // Keep as pending_review but flag for manual attention
      lookupError = 'Parse quality low - manual review recommended';
    } else if (result.parsed.status === 'FAILED') {
      // ✅ FIXED: Set both status AND rejectionReason for consistency
      status = 'rejected';
      rejectionReason = 'Transaction failed according to provider';
      lookupError = 'Transaction status is FAILED per provider';
    }
    
    // 6. Start transaction for optional PDF storage + verification record creation
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const { savePDFAsFileAsset } = require('../utils/pdf-downloader');
      let pdfFileAsset = null;
      
      // Store PDF if downloaded successfully (e.g., CBEBirr)
      if (result.pdfDownloaded && result.pdfBuffer) {
        pdfFileAsset = await savePDFAsFileAsset(
          result.pdfBuffer,
          {
            merchantId,
            orderId,
            provider,
            referenceId: cleanedReceiptNo,
            uploadedBy: userId,
          },
          session
        );
      }
      
      // Create verification record (with duplicate check via unique index)
      const verification = await PaymentVerificationRepository.create(
        [
          {
            merchant: merchantId,
            order: orderId,
            provider,
            providerReference: cleanedReceiptNo,
            verificationType: result.verificationType,
            parsed: result.parsed,
            amountMatch: result.amountMatch,
            accountMatch: result.accountMatch,
            parseQuality: result.parseQuality,
            status,
            lookupError,
            rejectionReason, // ✅ FIXED: Set for auto-rejected items
            receiptFileRef: pdfFileAsset ? pdfFileAsset._id : null,
            ...(status === 'rejected' && { verifiedAt: new Date() }), // Auto-rejected, no manual review
          },
        ],
        { session }
      );
      
      await session.commitTransaction();
      
      logger.info('payment.verification.initiated', {
        verificationId: verification[0]._id.toString(),
        provider,
        reference: cleanedReceiptNo,
        status,
        parseQuality: result.parseQuality,
        amountMatch: result.amountMatch,
        pdfDownloaded: result.pdfDownloaded || false,
      });
      
      return verification[0];
      
    } catch (error) {
      await session.abortTransaction();
      
      // ✅ Catch race condition duplicate (MongoDB error code 11000)
      if (error.code === 11000) {
        const duplicate = await PaymentVerificationRepository.findOne({
          provider,
          providerReference: cleanedReceiptNo,
        });
        throw new AppError(
          `This ${provider.toUpperCase()} receipt has already been used for order ${duplicate?.order || 'another order'}`,
          409
        );
      }
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * ✅ FULLY CORRECTED: Confirm verification with all fixes applied
   * - Issue 3: ObjectId validation
   * - Issue 5a: FileAsset validation (with TOCTOU fix)
   * - Issue 6: Atomic status update (race condition)
   * - Issue 7: Stale amount recheck
   * 
   * @param {Object} params
   * @param {ObjectId} params.verificationId
   * @param {ObjectId} params.merchantId
   * @param {ObjectId} params.staffUserId
   * @param {ObjectId} [params.receiptFileId] - Optional FileAsset ID
   */
  static async confirmVerification(params) {
    const { verificationId, merchantId, staffUserId, receiptFileId } = params;
    
    // ✅ Issue 3: Validate ObjectId formats FIRST
    if (!mongoose.Types.ObjectId.isValid(verificationId)) {
      throw new AppError('Invalid verification ID format', 400);
    }
    
    if (receiptFileId && !mongoose.Types.ObjectId.isValid(receiptFileId)) {
      throw new AppError('Invalid receipt file ID format', 400);
    }
    
    const session = await mongoose.startSession();
    
    try {
      let verification;
      let order;
      let fileAssetUrl = null;
      
      await session.withTransaction(async () => {
        // ✅ Issue 6: Atomic status check + update (prevents race condition)
        verification = await PaymentVerificationRepository.findOneAndUpdate(
          { 
            _id: verificationId, 
            merchant: merchantId, 
            status: 'pending_review' // Only succeeds if still pending
          },
          {
            $set: {
              status: 'verified',
              verifiedBy: staffUserId,
              verifiedAt: new Date(),
              ...(receiptFileId && { receiptFileRef: receiptFileId }),
            },
          },
          { session, new: true }
        );
        
        if (!verification) {
          const exists = await PaymentVerificationRepository.findOne({
            _id: verificationId,
            merchant: merchantId,
          }).session(session);
          
          if (!exists) {
            throw new AppError('Verification record not found', 404);
          }
          throw new AppError(
            `Verification already processed (status: ${exists.status})`,
            409
          );
        }
        
        // ✅ REQUIRED PHOTO: Manual verifications (lookup_failed) need receipt photo evidence
        // since there's no working automated lookup for Telebirr
        if (verification.verificationType === 'manual_entry_lookup_failed' && !receiptFileId) {
          throw new AppError(
            'A receipt photo is required to confirm manual verifications',
            400
          );
        }
        
        // ✅ TOCTOU FIX: Check FileAsset inside transaction
        if (receiptFileId) {
          const fileAsset = await FileAsset.findOne({
            _id: receiptFileId,
            merchant: merchantId,
            isDeleted: false,
          }).session(session); // ✅ Use session to prevent TOCTOU
          
          if (!fileAsset) {
            throw new AppError(
              'Receipt file not found or has been deleted',
              404
            );
          }
          
          fileAssetUrl = fileAsset.getPublicUrl();
        }
        
        order = await Order.findById(verification.order).session(session);
        
        if (!order) {
          throw new AppError('Associated order not found', 404);
        }
        
        if (order.paymentStatus === 'paid') {
          throw new AppError('Order is already paid', 400);
        }
        
        // ✅ Issue 7: RE-CHECK amount against CURRENT order total
        // (Order may have been modified between scan and confirm)
        const currentAmountMatch =
          verification.parsed?.amount &&
          Math.abs(verification.parsed.amount - order.totalAmount) < 0.01;
        
        if (!currentAmountMatch) {
          logger.warn('payment.verification.amount_mismatch', {
            verificationId: verificationId.toString(),
            orderId: order._id.toString(),
            receiptAmount: verification.parsed?.amount,
            currentOrderTotal: order.totalAmount,
            originalAmountMatch: verification.amountMatch,
          });
          
          throw new AppError(
            `Receipt amount (${verification.parsed?.amount} ETB) does not match current order total (${order.totalAmount} ETB). Order may have been modified after scan.`,
            400
          );
        }
        
        // Complete payment using extracted service
        await PaymentCompletionService.completePayment(
          {
            orderId: order._id,
            merchantId,
            paymentMethod: 'mobile_banking',
            bankName: verification.provider === 'cbe' ? 'CBE' : 'Telebirr',
            receiptImage: fileAssetUrl,
            customerId: order.customer || null,
          },
          session
        );
        
        logger.info('payment.verification.confirmed', {
          verificationId: verificationId.toString(),
          orderId: order._id.toString(),
          amount: order.totalAmount,
        });
      });
      
      return verification;
      
    } finally {
      await session.endSession();
    }
  }
  
  /**
   * Reject verification
   * 
   * @param {Object} params
   * @param {ObjectId} params.verificationId
   * @param {ObjectId} params.merchantId
   * @param {ObjectId} params.staffUserId
   * @param {string} params.reason - Rejection reason
   */
  static async rejectVerification(params) {
    const { verificationId, merchantId, staffUserId, reason } = params;
    
    // ✅ ObjectId validation
    if (!mongoose.Types.ObjectId.isValid(verificationId)) {
      throw new AppError('Invalid verification ID format', 400);
    }
    
    const verification = await PaymentVerificationRepository.findOne({
      _id: verificationId,
      merchant: merchantId,
    });
    
    if (!verification) {
      throw new AppError('Verification record not found', 404);
    }
    
    if (verification.status !== 'pending_review') {
      throw new AppError(
        `Cannot reject verification with status '${verification.status}'`,
        409
      );
    }
    
    verification.status = 'rejected';
    verification.rejectionReason = reason;
    verification.verifiedBy = staffUserId;
    verification.verifiedAt = new Date();
    
    await verification.save();
    
    logger.info('payment.verification.rejected', {
      verificationId: verificationId.toString(),
      reason,
    });
    
    return verification;
  }
  
  /**
   * List verifications for a merchant
   * 
   * @param {Object} params
   * @param {ObjectId} params.merchantId
   * @param {string} [params.status] - Filter by status
   * @param {number} [params.page=1]
   * @param {number} [params.limit=20]
   */
  static async listVerifications(params) {
    const { merchantId, status, page = 1, limit = 20 } = params;
    
    const query = { merchant: merchantId };
    if (status) {
      query.status = status;
    }
    
    const skip = (page - 1) * limit;
    
    const [verifications, total] = await Promise.all([
      PaymentVerificationRepository.find(query, {
        sort: { createdAt: -1 },
        limit,
        skip,
        populate: [
          { path: 'order', select: 'orderNumber totalAmount status' },
          { path: 'verifiedBy', select: 'name email' },
        ],
      }),
      PaymentVerificationRepository.countDocuments(query),
    ]);
    
    return {
      verifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
  
  /**
   * Get verification details
   * 
   * @param {ObjectId} verificationId
   * @param {ObjectId} merchantId
   */
  static async getVerification(verificationId, merchantId) {
    if (!mongoose.Types.ObjectId.isValid(verificationId)) {
      throw new AppError('Invalid verification ID format', 400);
    }
    
    const verification = await PaymentVerificationRepository.findOne({
      _id: verificationId,
      merchant: merchantId,
    });
    
    if (!verification) {
      throw new AppError('Verification record not found', 404);
    }
    
    // Populate related data
    await verification.populate([
      { path: 'order', select: 'orderNumber totalAmount status paymentStatus' },
      { path: 'verifiedBy', select: 'name email' },
      { path: 'receiptFileRef' },
    ]);
    
    return verification;
  }
  
  /**
   * Initiate verification from QR code with automatic PDF download
   * 
   * Enhanced workflow for CBE QR codes:
   * 1. Parse and validate QR URL (SSRF protection)
   * 2. Early duplicate check
   * 3. Fetch and parse HTML receipt
   * 4. Download PDF receipt
   * 5. Store PDF as FileAsset
   * 6. Create verification record with PDF reference
   * 
   * @param {Object} params
   * @param {ObjectId} params.merchantId
   * @param {ObjectId} params.orderId
   * @param {string} params.qrPayload - Raw QR code content (URL)
   * @param {ObjectId} params.userId - User initiating the verification
   * @returns {Promise<PaymentVerification>}
   */
  static async initiateVerificationFromQR(params) {
    const { merchantId, orderId, qrPayload, userId } = params;
    
    // Import QR parser utilities
    const { parsePaymentQR } = require('../utils/qr-parser');
    const { savePDFAsFileAsset } = require('../utils/pdf-downloader');
    
    // 1. Parse and validate QR code (SSRF protection built-in)
    let parsedQR;
    try {
      parsedQR = parsePaymentQR(qrPayload);
    } catch (error) {
      if (error.isOperational) {
        throw error;
      }
      logger.error('qr.parse_failed', { qrPayload, error: error.message });
      throw new AppError('Failed to parse QR code', 400);
    }
    
    const { provider, referenceId, tid, phone } = parsedQR;
    
    // For CBE Birr, use TID as the main reference
    const mainReference = tid || referenceId;
    
    // 2. Validate order
    const order = await Order.findOne({ 
      _id: orderId, 
      merchant: merchantId 
    });
    
    if (!order) {
      throw new AppError('Order not found', 404);
    }
    
    if (order.paymentStatus === 'paid') {
      throw new AppError('Order is already paid', 400);
    }
    
    if (order.status === 'canceled') {
      throw new AppError('Cannot verify payment for canceled order', 400);
    }
    
    // 3. Early duplicate check
    const existing = await PaymentVerificationRepository.findOne({
      provider,
      providerReference: mainReference,
    });
    
    if (existing) {
      throw new AppError(
        `This ${provider.toUpperCase()} receipt (${mainReference}) has already been used for order ${existing.order}`,
        409
      );
    }
    
    // 4. Resolve provider and verify with PDF download
    const providerInstance = resolveProvider(provider);
    
    if (typeof providerInstance.verifyWithPDF !== 'function') {
      throw new AppError(
        `Provider ${provider} does not support QR-based verification with PDF download`,
        501
      );
    }
    
    let result;
    try {
      // For CBE Birr, pass tid and phone; for others, pass referenceId
      const verifyParams = tid ? { tid, phone } : mainReference;
      
      result = await providerInstance.verifyWithPDF(verifyParams, {
        orderAmount: order.totalAmount,
        downloadPDF: true,
      });
    } catch (error) {
      if (error.isOperational) {
        throw error;
      }
      logger.error('payment.verification.qr_verification_failed', {
        provider,
        reference: mainReference,
        error: error.message,
      });
      throw new AppError('Payment verification failed. Please try again.', 500);
    }
    
    // 5. Start transaction for PDF storage + verification record creation
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      let pdfFileAsset = null;
      
      // Store PDF if downloaded successfully
      if (result.pdfDownloaded && result.pdfBuffer) {
        pdfFileAsset = await savePDFAsFileAsset(
          result.pdfBuffer,
          {
            merchantId,
            orderId,
            provider,
            referenceId: mainReference,
            uploadedBy: userId,
          },
          session
        );
      }
      
      // Determine status based on parse quality
      let status = 'pending_review';
      let rejectionReason = null;
      let lookupError = result.lookupError || null;
      
      if (result.parseQuality === 'failed') {
        status = 'lookup_failed';
      } else if (result.parseQuality === 'pdf_manual_review_required') {
        status = 'pending_review';
        lookupError = 'PDF receipt downloaded - requires manual review';
      } else if (result.parseQuality === 'low') {
        lookupError = 'Parse quality low - manual review recommended';
      } else if (result.parsed.status === 'FAILED') {
        status = 'rejected';
        rejectionReason = 'Transaction failed according to provider';
        lookupError = 'Transaction status is FAILED per provider';
      }
      
      // If PDF download failed, note it but don't fail the verification
      if (!result.pdfDownloaded && result.pdfError) {
        lookupError = `${lookupError || ''} | PDF download failed: ${result.pdfError}`.trim();
      }
      
      // Determine verification type
      let verificationType = result.verificationType;
      if (!verificationType) {
        // Default based on whether PDF was downloaded
        verificationType = result.pdfDownloaded 
          ? 'qr_scan_pdf_downloaded' 
          : 'qr_scan';
      }
      
      // Create verification record
      const verification = await PaymentVerificationRepository.create({
        merchant: merchantId,
        order: orderId,
        provider,
        providerReference: mainReference,
        verificationType,
        parsed: result.parsed,
        amountMatch: result.amountMatch,
        accountMatch: result.accountMatch,
        parseQuality: result.parseQuality,
        status,
        lookupError,
        rejectionReason,
        receiptFileRef: pdfFileAsset ? pdfFileAsset._id : null,
        ...(status === 'rejected' && { verifiedAt: new Date() }),
      }, session);
      
      await session.commitTransaction();
      
      logger.info('payment.verification.qr_initiated', {
        verificationId: verification._id.toString(),
        provider,
        reference: mainReference,
        status,
        parseQuality: result.parseQuality,
        amountMatch: result.amountMatch,
        pdfDownloaded: result.pdfDownloaded,
      });
      
      return verification;
      
    } catch (error) {
      await session.abortTransaction();
      
      // Handle duplicate key error
      if (error.code === 11000) {
        const duplicate = await PaymentVerificationRepository.findOne({
          provider,
          providerReference: mainReference,
        });
        throw new AppError(
          `This ${provider.toUpperCase()} receipt has already been used for order ${duplicate?.order || 'another order'}`,
          409
        );
      }
      
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = PaymentVerificationService;
