/**
 * @file roleRoutes.js
 * @description SUPER-ADMIN ONLY Role Management
 *              - Only SUPER-ADMIN can access ANY route
 */

const express = require('express');
const roleController = require('../controllers/roleController');
const authController = require('../controllers/authController');
const AppError = require('../utils/appError');

const router = express.Router();

// 1. Protect all routes
router.use(authController.protect);

// 2. HARD RESTRICT: Only SUPER-ADMIN
router.use((req, res, next) => {
  if (req.user.role.name !== 'SUPER-ADMIN') {
    return next(new AppError('Access denied. Super Admin only.', 403));
  }
  next();
});

// 3. CRUD Routes
router.route('/').get(roleController.getAllRoles).post(roleController.createNewRole);

router
  .route('/:id')
  .get(roleController.getRole)
  .patch(roleController.updateRole)
  .delete(roleController.deleteRole);

module.exports = router;
