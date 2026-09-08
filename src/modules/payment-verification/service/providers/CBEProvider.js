const BaseProvider = require('./BaseProvider');
const { parseCBEHTML } = require('./parsers/cbe-parser');
const AppError = require('../../../../../utils/appError');
const logger = require('../../../../../utils/logger');
const { constructCBEPdfURL } = require('../../utils/qr-parser');
const { downloadPDF } = require('../../utils/pdf-downloader');

class CBEProvider extends BaseProvider {
  constructor(options = {}) {
    super(options); // Pass options to BaseProvider for httpClient injection
  }
  
  getName() {
    return 'cbe';
  }
  
  /**
   * ✅ Input validation before URL construction
   * CBE receipt format: Mix of letters/numbers, typically 12-15 chars (e.g., FT26240JY4DT, DHS81MM04XG)
   */
  validateReceiptNumber(receiptNumber) {
    const isValid = /^[A-Za-z0-9]{8,15}$/.test(receiptNumber);
    
    if (!isValid) {
      throw new AppError(
        'Invalid CBE receipt format. Expected 8-15 alphanumeric characters (e.g., FT26240JY4DT)',
        400
      );
    }
  }
  
  async verify(receiptNumber, { orderAmount }) {
    // ✅ Validate format first
    this.validateReceiptNumber(receiptNumber);
    
    try {
      // ✅ CORRECTED: Real CBE URL from actual QR code redirect observation
      // Format confirmed: apps.cbe.com.et:100/?id={reference}
      const url = `https://apps.cbe.com.et:100/?id=${encodeURIComponent(receiptNumber)}`;
      
      // CBE should NOT need insecure TLS workaround
      const html = await this.fetchReceipt(url);
      
      // Parse HTML using real fixture-based selectors
      const parsed = parseCBEHTML(html);
      
      // Assess parse quality
      const parseQuality = this.assessParseQuality(parsed);
      
      // Validate amount
      const amountMatch = this.validateAmount(parsed.amount, orderAmount);
      
      return {
        reference: receiptNumber,
        parsed,
        amountMatch,
        accountMatch: null, // Could be validated if merchant account is configured
        parseQuality,
        verificationType: 'manual_entry_auto_lookup',
      };
      
    } catch (error) {
      // ✅ Return structured error, don't throw
      logger.warn('cbe.verification_failed', {
        reference: receiptNumber,
        error: error.message,
      });
      
      return {
        reference: receiptNumber,
        parsed: { fullRawText: error.message },
        amountMatch: false,
        parseQuality: 'failed',
        verificationType: 'manual_entry_lookup_failed',
        lookupError: error.message,
      };
    }
  }
  
  /**
   * Enhanced verification with PDF download (for QR-based flow)
   * 
   * @param {string} receiptNumber - Validated CBE reference ID
   * @param {object} options
   * @param {number} options.orderAmount - Expected order amount
   * @param {boolean} options.downloadPDF - Whether to download PDF receipt
   * @returns {Promise<object>} Verification result with optional PDF buffer
   */
  async verifyWithPDF(receiptNumber, { orderAmount, downloadPDF: shouldDownloadPDF = false }) {
    // Get standard verification result first
    const verificationResult = await this.verify(receiptNumber, { orderAmount });
    
    // If verification failed or PDF not requested, return as-is
    if (!shouldDownloadPDF || verificationResult.parseQuality === 'failed') {
      return verificationResult;
    }
    
    // Download PDF receipt
    try {
      const pdfURL = constructCBEPdfURL(receiptNumber);
      const pdfBuffer = await downloadPDF(pdfURL, { httpClient: this.httpClient });
      
      logger.info('cbe.pdf_downloaded', {
        reference: receiptNumber,
        size: pdfBuffer.length,
      });
      
      return {
        ...verificationResult,
        pdfBuffer,
        pdfDownloaded: true,
      };
      
    } catch (pdfError) {
      // PDF download failed - don't fail the entire verification
      // HTML parsing succeeded, PDF is nice-to-have
      logger.warn('cbe.pdf_download_failed', {
        reference: receiptNumber,
        error: pdfError.message,
      });
      
      return {
        ...verificationResult,
        pdfDownloaded: false,
        pdfError: pdfError.message,
      };
    }
  }
}

module.exports = CBEProvider;
