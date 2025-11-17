// routes/menuGroupRoutes.js
const express = require('express');
const menuGroupController = require('../controllers/menuGroupController');
const authController = require('../controllers/authController'); // Assuming you have this for protect & restrict

const router = express.Router();

// All routes protected for merchants only
router.use(authController.protect, authController.restrictTo()); // Or your roles: 'SUPER-ADMIN', etc.

router
  .route('/')
  .get(menuGroupController.getAllMenuGroups)
  .post(menuGroupController.createMenuGroup);

router
  .route('/:id')
  .patch(menuGroupController.updateMenuGroup)
  .delete(menuGroupController.deleteMenuGroup);

module.exports = router;
