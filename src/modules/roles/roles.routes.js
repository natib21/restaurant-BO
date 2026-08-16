/**
 * @file src/modules/roles/roles.routes.js
 * @description System-wide role management — SUPER-ADMIN only.
 *
 * All routes require JWT auth + hard SUPER-ADMIN check.
 *
 * Middleware pipeline:
 *   protect → superAdminOnly → handler
 */

const express = require('express');
const { protect } = require('../../common/guards/auth.guard');
const AppError = require('../../../utils/appError');
const roleController = require('./role.controller');

const router = express.Router();

router.use(protect);

// Hard SUPER-ADMIN guard (not task-based — system roles are platform-level)
router.use((req, res, next) => {
  if (req.user?.role?.name !== 'SUPER-ADMIN' && !req.user?.role?.isSystemRole) {
    return next(new AppError('Access denied. Super Admin only.', 403));
  }
  next();
});

router.route('/').get(roleController.getAllRoles).post(roleController.createRole);

router
  .route('/:id')
  .get(roleController.getRole)
  .patch(roleController.updateRole)
  .delete(roleController.deleteRole);

module.exports = router;
