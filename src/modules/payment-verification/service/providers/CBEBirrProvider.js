const BaseProvider = require('./BaseProvider');
const AppError = require('../../../../../utils/appError');
const logger = require('../../../../../utils/logger');
const { constructProviderURL } = require('../../utils/qr-parser');
const { validatePDF } = require('../../utils/pdf-downloader');

/**
 * CBE Birr Provider - Commercial Bank of Ethiopia Mobile Wallet
 * 
 * URL Structure (confirmed by QR scan - January 2025):
 * https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI7&PH=251923479921
 * 
 * Parameters:
 * - TID: Transaction ID
 * - PH: Phone number (251XXXXXXXXX format)
 * 
 * Note: This provider requires BOTH TID and phone number to fetch receipt.
 * This is a security feature that prevents brute-force attacks on TID alone.
 */
class CBEBirrProvider extends BaseProvider {
  constructor(options = {}) {
    super(options); // Pass options to BaseProvider for httpClient injection
  }
  
  getName() {
    return 'cbebirr';
  }
  
  /**
   * Validate CBE Birr transaction ID format
   * 
   * @param {string} tid - Transaction ID
   * @throws {AppError} If format is invalid
   */
  validateTransactionId(tid) {
    const isValid = /^[A-Za-z0-9]{8,15}$/.test(tid);
    
    if (!isValid) {
      throw new AppError(
        'Invalid CBE Birr transaction ID format. Expected 8-15 alphanumeric characters (e.g., DHT71MPGDI7)',
        400
      );
    }
  }
  
  /**
   * Validate Ethiopian phone number format
   * 
   * @param {string} phone - Phone number
   * @throws {AppError} If format is invalid
   */
  validatePhoneNumber(phone) {
    const isValid = /^251\d{9}$/.test(phone);
    
    if (!isValid) {
      throw new AppError(
        'Invalid phone number format. Expected 251XXXXXXXXX (Ethiopian format)',
        400
      );
    }
  }
  
  /**
   * Verify CBE Birr payment
   * 
   * NOTE: CBE Birr receipt endpoint returns a PDF file, NOT HTML.
   * The response content-type is application/pdf and starts with %PDF-1.6
   * 
   * @param {object} params - Verification parameters
   * @param {string} params.tid - Transaction ID
   * @param {string} params.phone - Phone number
   * @param {object} options
   * @param {number} options.orderAmount - Expected order amount
   * @returns {Promise<object>} Verification result with PDF buffer
   */
  async verify({ tid, phone }, { orderAmount }) {
    // ✅ Validate format first
    this.validateTransactionId(tid);
    this.validatePhoneNumber(phone);
    
    try {
      // ✅ Construct URL from validated parameters (SSRF protection)
      const url = constructProviderURL('cbebirr', null, { tid, phone });
      
      // Fetch receipt - CBEBirr returns PDF, not HTML
      const { content: pdfBuffer, contentType, isPdf } = await this.fetchReceipt(url);
      
      if (!isPdf) {
        logger.error('cbebirr.unexpected_content_type', {
          tid,
          contentType,
          responseStart: pdfBuffer.toString('utf-8', 0, 50),
        });
        throw new Error(`Expected PDF response but got ${contentType}`);
      }
      
      // Validate PDF
      validatePDF(pdfBuffer, contentType);
      
      logger.info('cbebirr.pdf_downloaded', {
        tid,
        size: pdfBuffer.length,
        contentType,
      });
      
      // Since we have PDF but cannot parse it automatically,
      // return it for manual review with metadata
      return {
        reference: tid,
        parsed: {
          // Cannot auto-extract from PDF - requires manual review
          amount: null,
          currency: 'ETB',
          status: 'UNKNOWN',
          timestamp: null,
          payerName: null,
          payerPhone: phone,
          fullRawText: `[PDF Receipt: ${pdfBuffer.length} bytes]`,
        },
        amountMatch: false, // Cannot verify automatically
        accountMatch: null,
        parseQuality: 'pdf_manual_review_required',
        verificationType: 'manual_entry_pdf_downloaded',
        pdfBuffer,
        pdfDownloaded: true,
        metadata: {
          phone,
          pdfSize: pdfBuffer.length,
          contentType,
        },
      };
      
    } catch (error) {
      // ✅ Return structured error, don't throw
      logger.warn('cbebirr.verification_failed', {
        tid,
        phone: phone.substring(0, 6) + '****',
        error: error.message,
      });
      
      return {
        reference: tid,
        parsed: { 
          fullRawText: error.message,
          currency: 'ETB',
        },
        amountMatch: false,
        parseQuality: 'failed',
        verificationType: 'manual_entry_lookup_failed',
        lookupError: error.message,
        pdfDownloaded: false,
      };
    }
  }
  
  /**
   * @deprecated CBEBirr only returns PDF, use verify() instead
   */
  async verifyWithPDF({ tid, phone }, { orderAmount }) {
    // Just call the standard verify method since it already returns PDF
    return this.verify({ tid, phone }, { orderAmount });
  }
}

module.exports = CBEBirrProvider;
