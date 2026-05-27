/**
 * @file src/modules/roles/tasks.routes.js
 * @description Task (RBAC permission unit) management.
 *
 * GET /merchant-tasks — any authenticated user (used by frontend to build UI)
 * All other routes — SUPER-ADMIN only
 *
 * Middleware pipeline:
 *   protect → [superAdminOnly] → handler
 */

const express = require('express');
const { protect }    = require('../../common/guards/auth.guard');
const AppError       = require('../../../utils/appError');
const taskController = require('./task.controller');

const router = express.Router();

router.use(protect);

// Any authenticated user can fetch merchant tasks (used to build role assignment UI)
router.get('/merchant-tasks', taskController.getMerchantTasks);

// SUPER-ADMIN only below
router.use((req, res, next) => {
  if (req.user?.role?.name !== 'SUPER-ADMIN' && !req.user?.role?.isSystemRole) {
    return next(new AppError('Access denied. Super Admin only.', 403));
  }
  next();
});

router.route('/')
  .get(taskController.getAllTasks)
  .post(taskController.createTask);

router.post('/sync',        taskController.syncTasks);
router.delete('/delete-all', taskController.deleteAllTasks);

router.route('/:id')
  .patch(taskController.updateTask)
  .delete(taskController.deleteTask);

module.exports = router;
