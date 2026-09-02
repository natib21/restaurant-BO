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
const logger = require('../../../../utils/logger');

/**
 * Middleware that supports BOTH JWT auth (staff) AND session auth (customers)
 * 
 * Authentication precedence:
 * 1. If Authorization: Bearer header present → try JWT (staff)
 *    - If JWT verification fails → fall back to session auth
 * 2. If jwt cookie present → try JWT (staff)
 * 3. Otherwise → try session auth (customer)
 * 
 * Error handling:
 * - If JWT attempted and fails → try session auth (critical for QR customers!)
 * - If both fail → return session error (more appropriate for customers)
 * 
 * Usage:
 * router.get('/:id', dualAuth, handler);
 */
const dualAuth = (req, res, next) => {
  // 🔍 DEBUG LOGGING
  console.log('🔍 DUALAUTH HIT', {
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    hasBearer: !!req.headers.authorization?.startsWith('Bearer'),
    hasJwtCookie: !!req.cookies?.jwt,
    hasSessionToken: !!req.headers.authorization?.startsWith('Bearer'),
  });

  // Check if JWT auth is being attempted (Bearer header or jwt cookie)
  const hasJwtAuth = req.headers.authorization?.startsWith('Bearer') || req.cookies?.jwt;

  if (hasJwtAuth) {
    // JWT auth was attempted: try it first
    console.log('🔍 Attempting JWT auth...');
    return protect(req, res, (jwtErr) => {
      if (jwtErr) {
        // JWT auth failed - ALWAYS try session auth as fallback
        console.log('🔍 JWT auth failed:', jwtErr.message);
        console.log('🔍 Falling back to session auth...');
        return protectTableSession(req, res, (sessionErr) => {
          if (sessionErr) {
            // Both JWT and session auth failed
            console.log('🔍 Session auth also failed:', sessionErr.message);
            console.log('🔍 Returning session error');
            return next(sessionErr);
          }
          // Session auth succeeded - continue
          console.log('🔍 Session auth succeeded!');
          next();
        });
      }
      // JWT auth succeeded - continue
      console.log('🔍 JWT auth succeeded!');
      next();
    });
  } else {
    // No JWT auth attempted - only try session auth (customer)
    console.log('🔍 No JWT detected, attempting session auth directly...');
    return protectTableSession(req, res, next);
  }
};

module.exports = { dualAuth };
