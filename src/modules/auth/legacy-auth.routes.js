/**
 * @file src/modules/auth/legacy-auth.routes.js
 * @description Backward-compatible aliases for pre-refactor auth paths.
 *
 * Canonical routes live under /api/v1/auth and /api/v1/users.
 * These aliases keep older clients working during migration.
 */

const express = require('express');
const { protect } = require('../../common/guards/auth.guard');
const AppError = require('../../common/errors');
const authController = require('./auth.controller');
const userController = require('../users/user.controller');
const {
  validateSignup,
  validateForgotPassword,
  validateResetPassword,
} = require('./auth.validation');

const legacyUserRouter = express.Router();

// Legacy: POST /api/v1/user/signup, POST /api/v1/user/logout
legacyUserRouter.post('/signup', validateSignup, authController.signup);
legacyUserRouter.post('/logout', authController.logout);

// Legacy: GET /api/v1/user/getMe
legacyUserRouter.get('/getMe', protect, userController.getMe);

// Legacy: POST /api/v1/user/forgotPassword, PATCH /api/v1/user/resetPassword/:token
legacyUserRouter.post('/forgotPassword', validateForgotPassword, authController.forgotPassword);
legacyUserRouter.patch(
  '/resetPassword/:token',
  validateResetPassword,
  authController.resetPassword
);

/**
 * Legacy paths under /api/auth (when client baseURL is /api).
 * Mount at /api/auth in routes/index.js
 */
const legacyApiAuthRouter = express.Router();

legacyApiAuthRouter.post('/forgot-password', validateForgotPassword, authController.forgotPassword);

// Legacy: POST /api/auth/reset-password with token in body
legacyApiAuthRouter.post('/reset-password', validateResetPassword, (req, res, next) => {
  const token = req.body?.token;
  if (!token) {
    return next(new AppError('Reset token is required', 400));
  }
  req.params.token = token;
  return authController.resetPassword(req, res, next);
});

module.exports = legacyUserRouter;
module.exports.legacyApiAuthRouter = legacyApiAuthRouter;
