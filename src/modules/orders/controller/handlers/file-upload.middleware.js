/**
 * Order File Upload Middleware
 * 
 * Handles file uploads for order operations (e.g., payment photos).
 */

const catchAsync = require('../../../../utils/catchAsync');

/**
 * Middleware: Upload order payment photo
 * 
 * Note: Requires multer integration.
 * Should be applied before body validation middleware.
 * 
 * Usage:
 * router.post(
 *   '/:id/pay',
 *   uploadOrderPaymentPhoto,  // Processes multipart/form-data
 *   validate(markAsPaidSchema),
 *   markAsPaid
 * );
 */
exports.uploadOrderPaymentPhoto = catchAsync(async (req, res, next) => {
  // TODO: Integrate multer configuration
  // Expected behavior:
  // - Accept multipart/form-data
  // - Extract file from 'payment-photo' field
  // - Store file reference in req.file
  // - Pass to next middleware
  
  // For now, pass through if no file handling is needed
  next();
});

/**
 * Middleware: Resize order payment photo
 * 
 * Note: Requires image processing library (e.g., Sharp).
 * Should be applied after uploadOrderPaymentPhoto.
 * 
 * Usage:
 * router.post(
 *   '/:id/pay',
 *   uploadOrderPaymentPhoto,
 *   resizeOrderPaymentPhoto,  // Processes file if present
 *   validate(markAsPaidSchema),
 *   markAsPaid
 * );
 */
exports.resizeOrderPaymentPhoto = catchAsync(async (req, res, next) => {
  // TODO: Integrate sharp or similar image processing
  // Expected behavior:
  // - Check if req.file exists
  // - If present, resize to standardized dimensions
  // - Optimize file size
  // - Save to storage
  // - Store path in req.file.filename or req.body.paymentPhotoPath
  
  // For now, pass through
  next();
});
