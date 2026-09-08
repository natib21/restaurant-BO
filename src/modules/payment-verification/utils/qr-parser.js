/**
 * @file qr-parser.js
 * @description Secure QR code URL parser with SSRF protection
 * 
 * Security Rules:
 * 1. Only accept whitelisted hostnames (apps.cbe.com.et)
 * 2. Extract and validate reference ID only
 * 3. Never blindly fetch URLs provided by frontend
 * 4. Backend constructs its own URLs from validated references
 */

const AppError = require('../../../../utils/appError');
const logger = require('../../../../utils/logger');

/**
 * Whitelist of allowed payment provider hostnames
 * CRITICAL: Never fetch from hosts not in this list (SSRF protection)
 * 
 * CBE has TWO payment services:
 * 1. CBE Birr (mobile wallet) - cbepay1.cbe.com.et ✅ Confirmed by QR scan
 * 2. CBE Bank (traditional) - TBD (pending real QR scan)
 */
const ALLOWED_HOSTS = {
  cbebirr: ['cbepay1.cbe.com.et'], // Mobile wallet (confirmed)
  cbe: ['apps.cbe.com.et'], // Traditional bank (placeholder - update when tested)
  // telebirr: ['transactioninfo.ethiotelecom.et'], // If they add public verification
};

/**
 * Extract and validate CBE Birr reference from QR URL
 * 
 * @param {string} rawQrPayload - Raw QR code content (expected to be URL)
 * @returns {{ provider: 'cbebirr', tid: string, phone: string }}
 * @throws {AppError} If URL is invalid or not from allowed host
 * 
 * @example
 * Input:  "https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI7&PH=251923479921"
 * Output: { provider: 'cbebirr', tid: 'DHT71MPGDI7', phone: '251923479921' }
 * 
 * URL Structure (confirmed by live QR scan - January 2025):
 * - Host: cbepay1.cbe.com.et
 * - Path: /aureceipt
 * - Query params:
 *   - TID: Transaction ID (8-15 alphanumeric characters)
 *   - PH: Phone number (251 + 9 digits, Ethiopian format)
 * 
 * Security note: Both TID and PH are required by CBE's endpoint, which means
 * it's not brute-forceable by TID alone — good security property to preserve.
 */
function extractCBEBirrReference(rawQrPayload) {
  let url;
  
  try {
    // Parse as URL - throws if malformed
    url = new URL(rawQrPayload);
  } catch (error) {
    logger.warn('qr_parser.invalid_url', { payload: rawQrPayload });
    throw new AppError('Invalid QR code format. Expected a valid URL.', 400);
  }
  
  // ✅ SSRF Protection: Only allow whitelisted hostname
  if (!ALLOWED_HOSTS.cbebirr.includes(url.hostname)) {
    logger.warn('qr_parser.untrusted_host', {
      hostname: url.hostname,
      allowed: ALLOWED_HOSTS.cbebirr,
    });
    throw new AppError(
      `Unrecognized payment provider. Expected ${ALLOWED_HOSTS.cbebirr.join(' or ')}, got ${url.hostname}`,
      400
    );
  }
  
  // Extract transaction ID (TID parameter)
  const tid = url.searchParams.get('TID');
  
  if (!tid) {
    throw new AppError('QR code is missing transaction ID (TID parameter)', 400);
  }
  
  // Validate CBE transaction ID format (8-15 alphanumeric characters)
  if (!/^[A-Za-z0-9]{8,15}$/.test(tid)) {
    throw new AppError(
      'Invalid CBE Birr transaction ID format. Expected 8-15 alphanumeric characters.',
      400
    );
  }
  
  // Extract phone number (PH parameter)
  const phone = url.searchParams.get('PH');
  
  if (!phone) {
    throw new AppError('QR code is missing phone number (PH parameter)', 400);
  }
  
  // Validate Ethiopian phone format (251 + 9 digits)
  if (!/^251\d{9}$/.test(phone)) {
    logger.warn('qr_parser.invalid_phone_format', { phone });
    throw new AppError(
      'Invalid phone number format in QR code. Expected 251XXXXXXXXX (Ethiopian format).',
      400
    );
  }
  
  logger.info('qr_parser.cbebirr_reference_extracted', { tid, phone });
  
  return {
    provider: 'cbebirr',
    tid,
    phone,
  };
}

/**
 * Extract and validate CBE Bank reference ID from QR URL
 * 
 * @param {string} rawQrPayload - Raw QR code content (expected to be URL)
 * @returns {{ provider: 'cbe', referenceId: string }}
 * @throws {AppError} If URL is invalid or not from allowed host
 * 
 * @example
 * Input:  "https://apps.cbe.com.et:100/?id=FT26240JY4DT"
 * Output: { provider: 'cbe', referenceId: 'FT26240JY4DT' }
 * 
 * NOTE: This is a placeholder pattern - needs to be confirmed with real CBE Bank QR code
 */
function extractCBEReference(rawQrPayload) {
  let url;
  
  try {
    // Parse as URL - throws if malformed
    url = new URL(rawQrPayload);
  } catch (error) {
    logger.warn('qr_parser.invalid_url', { payload: rawQrPayload });
    throw new AppError('Invalid QR code format. Expected a valid URL.', 400);
  }
  
  // ✅ SSRF Protection: Only allow whitelisted hostname
  if (!ALLOWED_HOSTS.cbe.includes(url.hostname)) {
    logger.warn('qr_parser.untrusted_host', {
      hostname: url.hostname,
      allowed: ALLOWED_HOSTS.cbe,
    });
    throw new AppError(
      `Unrecognized payment provider. Expected ${ALLOWED_HOSTS.cbe.join(' or ')}, got ${url.hostname}`,
      400
    );
  }
  
  // Extract reference ID from query parameter
  const referenceId = url.searchParams.get('id');
  
  if (!referenceId) {
    throw new AppError('QR code is missing receipt reference ID', 400);
  }
  
  // Validate CBE reference format (8-15 alphanumeric characters)
  if (!/^[A-Za-z0-9]{8,15}$/.test(referenceId)) {
    throw new AppError(
      'Invalid CBE receipt format in QR code. Expected 8-15 alphanumeric characters.',
      400
    );
  }
  
  logger.info('qr_parser.cbe_reference_extracted', { referenceId });
  
  return {
    provider: 'cbe',
    referenceId,
  };
}

/**
 * Parse QR code payload and extract payment reference
 * Auto-detects provider based on hostname
 * 
 * Supports:
 * - CBE Birr (mobile wallet) - cbepay1.cbe.com.et
 * - CBE Bank (traditional) - apps.cbe.com.et (placeholder)
 * - Telebirr - not yet supported via QR
 * 
 * @param {string} rawQrPayload - Raw QR code content
 * @returns {{ provider: string, tid?: string, phone?: string, referenceId?: string }}
 * @throws {AppError} If QR cannot be parsed or is from untrusted source
 */
function parsePaymentQR(rawQrPayload) {
  if (!rawQrPayload || typeof rawQrPayload !== 'string') {
    throw new AppError('QR code payload is required', 400);
  }
  
  // Try to parse as URL
  let url;
  try {
    url = new URL(rawQrPayload);
  } catch (error) {
    // Not a URL - might be other format (e.g., Telebirr encrypted)
    throw new AppError(
      'QR code format not supported. Only CBE Birr and CBE Bank receipt QR codes are currently supported.',
      400
    );
  }
  
  // Detect provider by hostname
  if (ALLOWED_HOSTS.cbebirr.includes(url.hostname)) {
    return extractCBEBirrReference(rawQrPayload);
  }
  
  if (ALLOWED_HOSTS.cbe.includes(url.hostname)) {
    return extractCBEReference(rawQrPayload);
  }
  
  // Unknown provider
  throw new AppError(
    `Payment provider not recognized: ${url.hostname}. Only CBE Birr (cbepay1.cbe.com.et) and CBE Bank are currently supported via QR scan.`,
    400
  );
}

/**
 * Construct safe fetch URL from validated reference
 * Backend ALWAYS constructs its own URLs - never trusts client URLs
 * 
 * @param {string} provider - 'cbe', 'cbebirr', or 'telebirr'
 * @param {string} referenceId - Validated reference ID (for cbe)
 * @param {object} options - Additional params (tid, phone for cbebirr)
 * @returns {string} Safe URL to fetch
 */
function constructProviderURL(provider, referenceId, options = {}) {
  switch (provider) {
    case 'cbebirr':
      // CBE Birr mobile wallet (CONFIRMED by QR scan)
      // NOTE: This endpoint returns PDF directly, not HTML
      if (!options.tid || !options.phone) {
        throw new AppError('CBE Birr requires both TID and phone parameters', 500);
      }
      return `https://cbepay1.cbe.com.et/aureceipt?TID=${encodeURIComponent(options.tid)}&PH=${encodeURIComponent(options.phone)}`;
    
    case 'cbe':
      // CBE Bank traditional (PLACEHOLDER - update after testing)
      return `https://apps.cbe.com.et:100/?id=${encodeURIComponent(referenceId)}`;
    
    // Future providers would go here
    default:
      throw new AppError(`URL construction not implemented for provider: ${provider}`, 500);
  }
}

/**
 * Construct PDF download URL for CBE receipt
 * 
 * @param {string} referenceId - Validated CBE reference ID
 * @returns {string} PDF download URL
 * 
 * NOTE: This is a placeholder - actual PDF URL structure needs to be confirmed
 * by testing with real CBE receipts. It might be:
 * - Same URL with ?format=pdf parameter
 * - Different path like /pdf?id=...
 * - JavaScript-triggered download (would need different approach)
 */
function constructCBEPdfURL(referenceId) {
  // PLACEHOLDER: Update after testing real CBE receipt page
  // Possible formats:
  // Option 1: Query param
  return `https://apps.cbe.com.et:100/pdf?id=${encodeURIComponent(referenceId)}`;
  
  // Option 2: Path segment
  // return `https://apps.cbe.com.et:100/${encodeURIComponent(referenceId)}/pdf`;
  
  // Option 3: Same URL with format hint
  // return `https://apps.cbe.com.et:100/?id=${encodeURIComponent(referenceId)}&format=pdf`;
}

module.exports = {
  parsePaymentQR,
  extractCBEReference,
  extractCBEBirrReference,
  constructProviderURL,
  constructCBEPdfURL,
  ALLOWED_HOSTS,
};
