/**
 * Dining Session Controller
 * 
 * Handles HTTP requests for dining session management.
 * Used by staff dashboard to view and manage active sessions.
 */

const { SessionService } = require('./service/SessionService');
const catchAsync = require('../../../utils/catchAsync');
const AppError = require('../../../utils/appError');

/**
 * Get all active sessions for a branch
 * 
 * GET /api/v1/branches/:branchId/active-sessions
 * 
 * @access Staff (ORDER_VIEW or ORDER_MANAGE)
 */
exports.getActiveSessions = catchAsync(async (req, res, next) => {
  const { branchId } = req.params;

  // Verify user has access to this branch
  if (req.user.branch?.toString() !== branchId) {
    return next(new AppError('You do not have access to this branch', 403));
  }

  const sessions = await SessionService.getActiveSessions(branchId);

  res.status(200).json({
    success: true,
    count: sessions.length,
    sessions
  });
});

/**
 * Get session summary with orders
 * 
 * GET /api/v1/sessions/:sessionId/summary
 * 
 * @access Staff (ORDER_VIEW or ORDER_MANAGE)
 */
exports.getSessionSummary = catchAsync(async (req, res, next) => {
  const { sessionId } = req.params;

  const summary = await SessionService.getSessionSummary(sessionId);

  // Verify user has access to this branch
  if (req.user.branch?.toString() !== summary.branchId) {
    return next(new AppError('You do not have access to this session', 403));
  }

  res.status(200).json({
    success: true,
    summary
  });
});

/**
 * Get all orders for a session
 * 
 * GET /api/v1/sessions/:sessionId/orders
 * 
 * @access Staff (ORDER_VIEW or ORDER_MANAGE)
 */
exports.getSessionOrders = catchAsync(async (req, res, next) => {
  const { sessionId } = req.params;
  const { status } = req.query;

  const filters = status ? { status } : {};
  const orders = await SessionService.getSessionOrders(
    sessionId, 
    filters,
    { populate: true }
  );

  res.status(200).json({
    success: true,
    count: orders.length,
    orders
  });
});
