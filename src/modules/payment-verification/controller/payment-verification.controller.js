const PaymentVerificationService = require('../service/PaymentVerificationService');
const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');

/**
 * Helper to extract merchantId from request
 * Supports both req.merchant._id and req.user.merchant patterns
 */
function getMerchantId(req) {
  if (req.merchant && req.merchant._id) {
    return req.merchant._id;
  }
  if (req.user && req.user.merchant) {
    return req.user.merchant;
  }
  throw new AppError('Merchant context not found', 400);
}

/**
 * ✅ ADDED: Validate payment provider against whitelist
 * Prevents injection and ensures only supported providers are used
 */
const SUPPORTED_PROVIDERS = ['telebirr', 'cbe', 'cbebirr'];

function validateProvider(provider) {
  if (!provider || typeof provider !== 'string') {
    throw new AppError('Provider must be a non-empty string', 400);
  }
  
  const normalizedProvider = provider.toLowerCase().trim();
  
  if (!SUPPORTED_PROVIDERS.includes(normalizedProvider)) {
    throw new AppError(
      `Invalid payment provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`,
      400
    );
  }
  
  return normalizedProvider;
}

/**
 * Initiate payment verification
 * POST /payment-verification/initiate
 * 
 * Body: { orderId, provider, receiptNumber }
 */
exports.initiateVerification = catchAsync(async (req, res) => {
  const { orderId, provider, receiptNumber } = req.body;
  
  if (!orderId || !provider || !receiptNumber) {
    throw new AppError('orderId, provider, and receiptNumber are required', 400);
  }
  
  // ✅ ADDED: Validate provider against whitelist
  const validatedProvider = validateProvider(provider);
  
  const merchantId = getMerchantId(req);
  const userId = req.user._id;
  
  const verification = await PaymentVerificationService.initiateManualVerification({
    merchantId,
    orderId,
    provider: validatedProvider,
    receiptNumber,
    userId,
  });
  
  res.status(201).json({
    status: 'success',
    data: { verification },
  });
});

/**
 * Confirm payment verification (approve)
 * POST /payment-verification/:id/confirm
 * 
 * Body: { receiptFileId? }
 */
exports.confirmVerification = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { receiptFileId } = req.body;
  
  const merchantId = getMerchantId(req);
  const staffUserId = req.user._id;
  
  const verification = await PaymentVerificationService.confirmVerification({
    verificationId: id,
    merchantId,
    staffUserId,
    receiptFileId,
  });
  
  res.status(200).json({
    status: 'success',
    data: { verification },
  });
});

/**
 * Reject payment verification
 * POST /payment-verification/:id/reject
 * 
 * Body: { reason }
 */
exports.rejectVerification = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  if (!reason) {
    throw new AppError('Rejection reason is required', 400);
  }
  
  const merchantId = getMerchantId(req);
  const staffUserId = req.user._id;
  
  const verification = await PaymentVerificationService.rejectVerification({
    verificationId: id,
    merchantId,
    staffUserId,
    reason,
  });
  
  res.status(200).json({
    status: 'success',
    data: { verification },
  });
});

/**
 * List payment verifications
 * GET /payment-verification
 * 
 * Query: { status?, page?, limit? }
 */
exports.listVerifications = catchAsync(async (req, res) => {
  const { status, page, limit } = req.query;
  
  const merchantId = getMerchantId(req);
  
  const result = await PaymentVerificationService.listVerifications({
    merchantId,
    status,
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 20,
  });
  
  res.status(200).json({
    status: 'success',
    data: result,
  });
});

/**
 * Get single verification details
 * GET /payment-verification/:id
 */
exports.getVerification = catchAsync(async (req, res) => {
  const { id } = req.params;
  
  const merchantId = getMerchantId(req);
  
  const verification = await PaymentVerificationService.getVerification(id, merchantId);
  
  res.status(200).json({
    status: 'success',
    data: { verification },
  });
});

/**
 * Initiate payment verification from QR code
 * POST /payment-verification/initiate-from-qr
 * 
 * Enhanced CBE workflow:
 * 1. Staff scans CBE QR code in frontend
 * 2. Frontend sends raw QR payload (URL) to this endpoint
 * 3. Backend validates QR (SSRF protection)
 * 4. Backend fetches HTML and scrapes payment data
 * 5. Backend downloads PDF receipt automatically
 * 6. Backend stores PDF as FileAsset
 * 7. Creates verification record with PDF attached
 * 
 * Body: { orderId, qrPayload }
 * 
 * Example qrPayload: "https://apps.cbe.com.et:100/?id=FT26240JY4DT"
 */
exports.initiateVerificationFromQR = catchAsync(async (req, res) => {
  const { orderId, qrPayload } = req.body;
  
  if (!orderId || !qrPayload) {
    throw new AppError('orderId and qrPayload are required', 400);
  }
  
  const merchantId = getMerchantId(req);
  const userId = req.user._id;
  
  const verification = await PaymentVerificationService.initiateVerificationFromQR({
    merchantId,
    orderId,
    qrPayload,
    userId,
  });
  
  res.status(201).json({
    status: 'success',
    data: { 
      verification,
      message: verification.receiptFileRef 
        ? 'Verification initiated and PDF receipt downloaded successfully'
        : 'Verification initiated (PDF download failed - see lookupError)',
    },
  });
});
