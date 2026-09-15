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
const BranchUserAssignmentController = require('../branch/controller/BranchUserAssignmentController');

const router = express.Router();

router.use(protect);

// ── Self-service (any authenticated user) ─────────────────────────────────────
router.get('/me', userController.getMe);
router.patch('/me', userController.updateMe);
router.delete('/me', userController.deleteMe);

// ── Admin user management (task RBAC) ─────────────────────────────────────────
router.use(restrictTo());

// GET/POST to root path (must come before :id routes)
router.route('/').get(userController.getAllUsers).post(userController.createUser);

// ── Branch assignment for users (task-based: users.assign-branch) ──────────────
// GET /api/v1/users/:id/branches — Get user's assigned branches
router.get('/:id/branches', BranchUserAssignmentController.getUserBranches);

// POST /api/v1/users/:id/branches — Assign branch(es) to user
router.post('/:id/branches', BranchUserAssignmentController.assignBranchesToUser);

// DELETE /api/v1/users/:id/branches/:branchId — Remove branch from user
router.delete('/:id/branches/:branchId', BranchUserAssignmentController.unassignBranchFromUser);

// Single user CRUD (/:id routes come last)
router
  .route('/:id')
  .get(userController.getUser)
  .patch(userController.updateUser)
  .delete(userController.deleteUser);

module.exports = router;
