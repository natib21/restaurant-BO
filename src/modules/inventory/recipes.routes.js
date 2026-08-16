/**
 * @file src/modules/inventory/recipes.routes.js
 * @description Recipe CRUD — maps menu items to ingredient quantities.
 *
 * All routes require JWT auth + task RBAC.
 *
 * Middleware pipeline:
 *   protect → restrictTo() → handler
 */
const { requireFeature } = require('../../common/guards/feature.guard');
const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const recipeController = require('./controller/recipe.controller');

const router = express.Router();

router.use(protect);
router.use(restrictTo());
router.use(requireFeature('inventory'));

router.route('/').get(recipeController.getAllRecipes).post(recipeController.createRecipe);

router
  .route('/:id')
  .get(recipeController.getRecipe)
  .patch(recipeController.updateRecipe)
  .delete(recipeController.deleteRecipe);

module.exports = router;
