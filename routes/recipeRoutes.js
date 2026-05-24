// routes/recipeRoutes.js
const express = require('express');
const recipeController = require('../controllers/recipeController');
const authController = require('../controllers/authController');

const router = express.Router();

// Protect all routes
router.use(authController.protect);
router.use(authController.restrictTo());

router
  .route('/')
  .get(recipeController.getAllRecipes)
  .post(recipeController.createRecipe);

router
  .route('/:id')
  .get(recipeController.getRecipe)
  .patch(recipeController.updateRecipe)
  .delete(recipeController.deleteRecipe);

module.exports = router;