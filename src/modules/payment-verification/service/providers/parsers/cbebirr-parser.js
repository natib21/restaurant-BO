/**
 * @file cbebirr-parser.js
 * @description HTML parser for CBE Birr (mobile wallet) receipt pages
 * 
 * URL: https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI7&PH=251923479921
 * 
 * IMPORTANT: This parser uses PLACEHOLDER selectors. You MUST:
 * 1. Visit the real CBE Birr receipt URL in a browser
 * 2. Inspect the HTML structure
 * 3. Update the selectors below with real ones
 * 4. Test with multiple receipts to ensure reliability
 */

const cheerio = require('cheerio');
const logger = require('../../../../../../utils/logger');

/**
 * Parse CBE Birr HTML receipt page
 * 
 * @param {string} html - Raw HTML from CBE Birr receipt page
 * @returns {object} Parsed payment data
 * 
 * Expected fields:
 * - amount: Payment amount (number)
 * - currency: Currency code (usually 'ETB')
 * - status: Transaction status ('COMPLETED', 'FAILED', 'PENDING')
 * - timestamp: Transaction date/time (ISO string)
 * - payerName: Customer name
 * - payerPhone: Customer phone number
 * - receiverName: Merchant/receiver name
 * - receiverPhone: Merchant/receiver phone
 * - transactionId: Transaction ID (TID)
 * - fullRawText: Complete text content (fallback)
 */
function parseCBEBirrHTML(html) {
  const $ = cheerio.load(html);
  
  try {
    // ⚠️ PLACEHOLDER SELECTORS - UPDATE THESE AFTER INSPECTING REAL HTML
    
    // Amount extraction
    const amountText = $('.receipt-amount').text().trim()
      || $('.transaction-amount').text().trim()
      || $('[class*="amount"]').first().text().trim();
    
    const amount = parseFloat(amountText.replace(/[^\d.]/g, ''));
    
    // Currency (usually ETB for Ethiopian Birr)
    const currency = $('.currency').text().trim() 
      || amountText.match(/[A-Z]{3}/)?.[0] 
      || 'ETB';
    
    // Transaction status
    const statusText = $('.transaction-status').text().trim()
      || $('.status').text().trim()
      || $('[class*="status"]').text().trim();
    
    const status = normalizeStatus(statusText);
    
    // Timestamp
    const timestampText = $('.transaction-date').text().trim()
      || $('.date-time').text().trim()
      || $('[class*="date"]').first().text().trim();
    
    const timestamp = parseTimestamp(timestampText);
    
    // Payer information
    const payerName = $('.payer-name').text().trim()
      || $('.sender-name').text().trim()
      || $('[class*="payer"]').first().text().trim();
    
    const payerPhone = $('.payer-phone').text().trim()
      || $('.sender-phone').text().trim();
    
    // Receiver information (merchant)
    const receiverName = $('.receiver-name').text().trim()
      || $('.merchant-name').text().trim();
    
    const receiverPhone = $('.receiver-phone').text().trim()
      || $('.merchant-phone').text().trim();
    
    // Transaction ID
    const transactionId = $('.transaction-id').text().trim()
      || $('.tid').text().trim()
      || $('[class*="transaction"]').first().text().trim();
    
    // Full text content as fallback
    const fullRawText = $('body').text().replace(/\s+/g, ' ').trim();
    
    logger.info('cbebirr_parser.parsed', {
      amount,
      status,
      hasPayerName: !!payerName,
      hasTimestamp: !!timestamp,
    });
    
    return {
      amount: isNaN(amount) ? null : amount,
      currency,
      status,
      timestamp,
      payerName: payerName || null,
      payerPhone: payerPhone || null,
      receiverName: receiverName || null,
      receiverPhone: receiverPhone || null,
      transactionId: transactionId || null,
      fullRawText,
    };
    
  } catch (error) {
    logger.error('cbebirr_parser.parse_error', {
      error: error.message,
      stack: error.stack,
    });
    
    // Return minimal data on parse failure
    return {
      amount: null,
      currency: 'ETB',
      status: 'UNKNOWN',
      timestamp: null,
      payerName: null,
      fullRawText: $('body').text().replace(/\s+/g, ' ').trim(),
    };
  }
}

/**
 * Normalize status text to standard values
 * 
 * @param {string} statusText - Raw status text from HTML
 * @returns {string} Normalized status ('COMPLETED', 'FAILED', 'PENDING', 'UNKNOWN')
 */
function normalizeStatus(statusText) {
  const text = statusText.toLowerCase();
  
  // Success indicators
  if (text.includes('success') || text.includes('completed') || text.includes('paid')) {
    return 'COMPLETED';
  }
  
  // Failure indicators
  if (text.includes('failed') || text.includes('declined') || text.includes('rejected')) {
    return 'FAILED';
  }
  
  // Pending indicators
  if (text.includes('pending') || text.includes('processing')) {
    return 'PENDING';
  }
  
  return 'UNKNOWN';
}

/**
 * Parse timestamp from various date formats
 * 
 * @param {string} timestampText - Raw timestamp text
 * @returns {string|null} ISO 8601 timestamp or null
 */
function parseTimestamp(timestampText) {
  if (!timestampText) return null;
  
  try {
    // Try to parse as Date
    const date = new Date(timestampText);
    
    if (isNaN(date.getTime())) {
      // Invalid date
      return null;
    }
    
    return date.toISOString();
  } catch (error) {
    logger.warn('cbebirr_parser.timestamp_parse_failed', { timestampText });
    return null;
  }
}

module.exports = {
  parseCBEBirrHTML,
  normalizeStatus,
  parseTimestamp,
};
