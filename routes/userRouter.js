const express = require('express');
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');
const router = express.Router();

router.post('/signup', authController.signup);
router.post('/login', authController.login);

router.post(
  '/adminResetPassword',
  authController.protect,
  authController.restrictTo('admin'),
  authController.adminResetPassword
);

router.patch(
  '/changePassword',
  authController.protect,
  authController.changePassword
);

router
  .route('/')
  .get(userController.getAllUser)
  .post(userController.createNewUser);

router
  .route('/:id')
  .get(userController.getUser)
  .patch(userController.updateUser)
  .delete(userController.deleteUser);

module.exports = router;
