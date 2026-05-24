const express = require("express");
const authController = require("../controllers/authController");
// const inventoryController = require("../controllers/inventoryController");
const ingredientController = require("../controllers/ingredientController");

const router = express.Router();
router.use(authController.protect);
router.use(authController.restrictTo());

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