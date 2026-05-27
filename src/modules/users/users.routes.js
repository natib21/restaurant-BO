/**
 * @file src/modules/users/users.routes.js
 * @description User self-service and admin user management.
 *
 * All routes require JWT auth (protect).
 * List / create / update / delete require task-based RBAC (restrictTo).
 *
 * Middleware pipeline:
 *   protect → [restrictTo] → handler
 */

const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const userController = require('./user.controller');

const router = express.Router();

router.use(protect);

// ── Self-service (any authenticated user) ─────────────────────────────────────
router.get('/me',     userController.getMe);
router.patch('/me',   userController.updateMe);
router.delete('/me',  userController.deleteMe);

// ── Admin user management (task RBAC) ─────────────────────────────────────────
router.use(restrictTo());

router.route('/')
  .get(userController.getAllUsers)
  .post(userController.createUser);

router.route('/:id')
  .get(userController.getUser)
  .patch(userController.updateUser)
  .delete(userController.deleteUser);

module.exports = router;
