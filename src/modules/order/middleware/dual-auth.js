/**
 * @file src/modules/order/middleware/dual-auth.js
 * @description Middleware that allows BOTH JWT (staff) and session (customer) authentication
 * 
 * Used for endpoints that should work for both staff and customers.
 * Tries to authenticate as staff first, if that fails, tries customer session.
 * 
 * Error message strategy:
 * - If JWT was attempted (Bearer or jwt cookie): return jwtErr
 * - If only session was attempted: return sessionErr
 * - If both were attempted and both failed: return sessionErr (more user-friendly for customers)
 */

const AppError = require('../../../../utils/appError');
const { protect } = require('../../../common/guards/auth.guard');
const { protectTableSession } = require('../../customers/customer-session.guard');

/**
 * Middleware that supports BOTH JWT auth (staff) AND session auth (customers)
 * 
 * Authentication precedence:
 * 1. If Authorization: Bearer header present → assume it's a session token, try session auth
 * 2. If jwt cookie present → try JWT (staff)
 * 3. Otherwise → try session auth (customer)
 * 
 * Note: We check for Bearer header FIRST to detect QR customers (their auth is session token in Bearer format)
 * If both Bearer and jwt cookie exist, Bearer takes precedence (more specific to customer flow)
 * 
 * Usage:
 * router.get('/:id', dualAuth, handler);
 */
const dualAuth = (req, res, next) => {
  // Check what auth method is being attempted
  const hasBearerToken = req.headers.authorization?.startsWith('Bearer');
  const hasJwtCookie = req.cookies?.jwt;

  // QR customers use Bearer token (session token), NOT jwt cookie
  // JWT staff use jwt cookie
  if (hasBearerToken) {
    // Bearer token present - this is likely a QR customer session token
    // Try session auth first (more common for customer QR flow)
    return protectTableSession(req, res, (sessionErr) => {
      if (sessionErr) {
        // Session auth failed - fall back to JWT staff auth
        // (in case Bearer token is actually a JWT from a third-party integration)
        return protect(req, res, next);
      }
      // Session auth succeeded
      next();
    });
  } else if (hasJwtCookie) {
    // JWT cookie present - this is staff authentication
    return protect(req, res, next);
  } else {
    // No auth headers at all - try session auth (anonymous QR customer)
    return protectTableSession(req, res, next);
  }
};

module.exports = { dualAuth };
