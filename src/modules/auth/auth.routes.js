/**
 * @file src/modules/auth/auth.routes.js
 * @description Authentication routes — signup, login, logout, password management.
 *
 * Public routes  : POST /signup, POST /login, POST /logout,
 *                  POST /forgot-password, PATCH /reset-password/:token
 * Protected routes: PATCH /change-password, GET /me, PATCH /me, DELETE /me
 *
 * Middleware pipeline (protected):
 *   protect → handler
 */

const express = require('express');
const { protect } = require('../../common/guards/auth.guard');
const authController = require('./auth.controller');
const {
  validateSignup,
  validateLogin,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword,
} = require('./auth.validation');

const router = express.Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/signup',validateSignup, authController.signup);
router.post('/login',  validateLogin, authController.login);
router.post('/logout',    authController.logout);
router.post('/forgot-password', validateForgotPassword, authController.forgotPassword);
router.patch('/reset-password/:token', validateResetPassword, authController.resetPassword);

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(protect);

router.patch('/change-password', validateChangePassword, authController.changePassword);

module.exports = router;
