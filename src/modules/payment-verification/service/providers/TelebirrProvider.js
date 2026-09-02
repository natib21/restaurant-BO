const BaseProvider = require('./BaseProvider');
const { parseTelebirrHTML } = require('./parsers/telebirr-parser');
const AppError = require('../../../../../utils/appError');
const logger = require('../../../../../utils/logger');
const { loadEnv } = require('../../../../config/env');

class TelebirrProvider extends BaseProvider {
  constructor(options = {}) {
    super(options); // Pass options to BaseProvider for httpClient injection
  }
  
  getName() {
    return 'telebirr';
  }
  
  /**
   * Check if Telebirr auto-lookup is enabled
   */
  isAutoLookupEnabled() {
    const env = loadEnv();
    return env.TELEBIRR_AUTO_LOOKUP_ENABLED === 'true' || env.TELEBIRR_AUTO_LOOKUP_ENABLED === true;
  }
  
  /**
   * ✅ Input validation before URL construction
   * Telebirr receipt format: 10-12 uppercase alphanumeric (e.g., DB80L94QPK, CHQ0FJ403O)
   */
  validateReceiptNumber(receiptNumber) {
    const isValid = /^[A-Z0-9]{10,12}$/.test(receiptNumber);
    
    if (!isValid) {
      throw new AppError(
        'Invalid Telebirr receipt format. Expected 10-12 uppercase letters/numbers (e.g., DB80L94QPK)',
        400
      );
    }
  }
  
  async verify(receiptNumber, { orderAmount }) {
    // ✅ Validate format first
    this.validateReceiptNumber(receiptNumber);
    
    // ✅ Feature flag check - skip auto-lookup if disabled
    if (!this.isAutoLookupEnabled()) {
      logger.info('telebirr.auto_lookup_disabled', {
        reference: receiptNumber,
        message: 'Telebirr auto-lookup feature is disabled',
      });
      
      return {
        reference: receiptNumber,
        parsed: { 
          fullRawText: 'Telebirr auto-lookup not yet enabled — pending verification against live data'
        },
        amountMatch: false,
        parseQuality: 'failed',
        verificationType: 'manual_entry_lookup_failed',
        lookupError: 'Telebirr auto-lookup not yet enabled — pending verification against live data',
      };
    }
    
    try {
      // Build official Telebirr receipt URL
      const url = `https://transactioninfo.ethiotelecom.et/receipt/${receiptNumber}`;
      
      // ✅ SECURITY FIXED: Standard fetch with full TLS validation
      // If cert fails, this will throw and result in manual verification
      const html = await this.fetchReceipt(url);
      
      // Parse HTML using real fixture-based selectors
      const parsed = parseTelebirrHTML(html);
      
      // Assess parse quality
      const parseQuality = this.assessParseQuality(parsed);
      
      // Validate amount
      const amountMatch = this.validateAmount(parsed.amount, orderAmount);
      
      return {
        reference: receiptNumber,
        parsed,
        amountMatch,
        accountMatch: null, // Telebirr doesn't expose account numbers reliably
        parseQuality,
        verificationType: 'manual_entry_auto_lookup',
      };
      
    } catch (error) {
      // ✅ SECURITY: TLS errors result in manual verification, not bypass
      const isTLSError = error.message.includes('certificate validation failed');
      
      logger.warn('telebirr.verification_failed', {
        reference: receiptNumber,
        error: error.message,
        requiresManual: isTLSError,
      });
      
      return {
        reference: receiptNumber,
        parsed: { 
          fullRawText: isTLSError 
            ? 'TLS certificate validation failed - manual verification required'
            : error.message
        },
        amountMatch: false,
        parseQuality: 'failed',
        verificationType: 'manual_entry_lookup_failed',
        lookupError: isTLSError
          ? 'Provider certificate validation failed. Manual verification required for security.'
          : error.message,
      };
    }
  }
}

module.exports = TelebirrProvider;
