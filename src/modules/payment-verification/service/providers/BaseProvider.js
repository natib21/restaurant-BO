const https = require('https');
const fetch = require('node-fetch');
const logger = require('../../../../../utils/logger');

class BaseProvider {
  constructor(options = {}) {
    if (new.target === BaseProvider) {
      throw new Error('Cannot instantiate abstract class BaseProvider');
    }
    // ✅ Injectable HTTP client for testing
    this.httpClient = options.httpClient || fetch;
  }
  
  // Must be implemented by subclasses
  getName() {
    throw new Error('getName() must be implemented by subclass');
  }
  
  async verify(receiptNumber, options) {
    throw new Error('verify() must be implemented by subclass');
  }
  
  /**
   * ✅ SECURITY: Fetch receipt with proper TLS validation - NO bypass
   * 
   * Strategy:
   * 1. Attempt standard fetch with full TLS validation
   * 2. If certificate error occurs, log and throw (don't bypass)
   * 3. Result: TLS errors → lookup_failed → manual verification required
   * 
   * NEVER set rejectUnauthorized: false - this would allow MITM attacks
   * where an attacker can serve fake receipt pages and bypass fraud prevention.
   * 
   * @returns {Promise<{content: string|Buffer, contentType: string, isPdf: boolean}>}
   */
  async fetchReceipt(url) {
    try {
      const response = await this.httpClient(url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (compatible; RestaurantPOS/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/pdf',
          'Accept-Language': 'en-US,en;q=0.9,am;q=0.8',
        },
        timeout: 15000, // 15 second timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type') || '';
      const isPdf = contentType.includes('application/pdf');
      
      // Handle PDF responses differently from HTML
      let content;
      if (isPdf) {
        const arrayBuffer = await response.arrayBuffer();
        content = Buffer.from(arrayBuffer);
        
        // Validate PDF magic bytes
        const header = content.slice(0, 5).toString('utf-8');
        if (header !== '%PDF-') {
          throw new Error('Response claims to be PDF but does not have PDF magic bytes');
        }
        
        logger.info('provider.pdf_response_detected', {
          size: content.length,
          url: url.replace(/[A-Z0-9]{8,15}/i, '***'),
        });
      } else {
        content = await response.text();
        
        if (!content || content.length < 100) {
          throw new Error('Empty or invalid response from provider');
        }
      }
      
      return { content, contentType, isPdf };
      
    } catch (error) {
      // ✅ Check if it's a TLS certificate error
      if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || 
          error.code === 'CERT_HAS_EXPIRED' ||
          error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
          error.code === 'CERT_UNTRUSTED') {
        
        logger.warn('provider.tls_validation_failed', {
          url: url.replace(/[A-Z0-9]{8,15}/i, '***'), // Hide reference in logs
          code: error.code,
          message: 'TLS certificate validation failed - manual verification required',
        });
        
        // ✅ SECURITY: Don't bypass validation, throw error instead
        // This will result in lookup_failed status → manual review
        throw new Error(
          `Provider certificate validation failed (${error.code}). ` +
          `This payment must be verified manually by staff.`
        );
      }
      
      // Other errors (network, timeout, DNS, etc.)
      logger.error('provider.fetch_failed', {
        url: url.replace(/[A-Z0-9]{8,15}/i, '***'),
        error: error.message,
        code: error.code,
      });
      throw error;
    }
  }
  
  /**
   * ✅ Shared amount validation logic
   */
  validateAmount(parsedAmount, expectedAmount) {
    if (typeof parsedAmount !== 'number' || typeof expectedAmount !== 'number') {
      return false;
    }
    return Math.abs(parsedAmount - expectedAmount) < 0.01;
  }
  
  /**
   * ✅ Assess parse quality for ambiguous results
   */
  assessParseQuality(parsed) {
    const hasAmount = typeof parsed.amount === 'number' && parsed.amount > 0;
    const hasStatus = parsed.status && parsed.status.length > 0;
    const hasReceiver = parsed.receiverName && parsed.receiverName.length > 3;
    const hasDate = parsed.transactionDate instanceof Date;
    
    if (!hasAmount) return 'failed';
    if (!hasStatus) return 'low';
    if (hasAmount && hasStatus && hasReceiver && hasDate) return 'high';
    if (hasAmount && hasStatus) return 'medium';
    return 'low';
  }
}

module.exports = BaseProvider;
