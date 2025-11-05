const express = require('express');
const roleController = require('../controllers/roleController');

const router = express.Router();

router
  .route('/')
  .get(roleController.getAllRoles)
  .post(roleController.createNewRole);

router
  .route('/:id')
  .get(roleController.getRole)
  .patch(roleController.updateRole)
  .delete(roleController.deleteRole);

module.exports = router;
