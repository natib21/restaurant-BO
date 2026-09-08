/**
 * @file src/modules/categories/categories.routes.js
 * @description Category management routes
 * 
 * All routes require authentication and RBAC
 * Endpoints: POST, GET, GET/:id, PATCH/:id, DELETE/:id, PATCH/:id/restore
 * 
 * Middleware pipeline:
 *   protect → restrictTo() → [validators] → controller
 */

const express = require('express');
const { protect, restrictTo } = require('../../../common/guards/auth.guard');
const categoryController = require('../../categories/controller/category.controller');
const categoryValidators = require('../validator/category.validators');

const router = express.Router();

// ══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION REQUIRED FOR ALL ROUTES
// ══════════════════════════════════════════════════════════════════════════

router.use(protect);
router.use(restrictTo());

// ══════════════════════════════════════════════════════════════════════════
// CATEGORY ROUTES
// ══════════════════════════════════════════════════════════════════════════

// Get active categories only (lightweight endpoint)
router.get('/active', categoryController.getActiveCategories);

// CRUD operations
router
  .route('/')
  .get(categoryController.getAllCategories)
  .post(
    categoryValidators.validateCreateCategory,
    categoryController.createCategory
  );

router
  .route('/:id')
  .get(
    categoryValidators.validateObjectId,
    categoryController.getCategoryById
  )
  .patch(
    categoryValidators.validateObjectId,
    categoryValidators.validateUpdateCategory,
    categoryController.updateCategory
  )
  .delete(
    categoryValidators.validateObjectId,
    categoryController.deleteCategory
  );

// Restore soft-deleted category
router.patch(
  '/:id/restore',
  categoryValidators.validateObjectId,
  categoryController.restoreCategory
);

module.exports = router;
