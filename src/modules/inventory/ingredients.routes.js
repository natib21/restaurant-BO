/**
 * @file src/modules/inventory/ingredients.routes.js
 * @description Ingredient CRUD — the raw material catalog.
 *
 * All routes require JWT auth + task RBAC.
 *
 * Middleware pipeline:
 *   protect → restrictTo() → handler
 */

const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const ingredientController = require('./controller/ingredient.controller');
const { requireFeature } = require('../../common/guards/feature.guard');
const router = express.Router();

router.use(protect);
router.use(restrictTo());
router.use(requireFeature('inventory'));

router
  .route('/')
  .get(ingredientController.getAllIngredients)
  .post(ingredientController.createIngredient);

router
  .route('/:id')
  .get(ingredientController.getIngredient)
  .patch(ingredientController.updateIngredient)
  .delete(ingredientController.deleteIngredient);

module.exports = router;
