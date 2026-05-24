const express = require('express');
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/signup', authController.validateSignup, authController.signup);
router.post('/login', authController.validateLogin, authController.login);
router.post('/logout', authController.logout);
router.post('/forgotPassword', authController.validateForgotPassword, authController.forgotPassword);
router.patch('/resetPassword/:token', authController.validateResetPassword, authController.resetPassword);

router.patch(
  '/changePassword',
  authController.protect,
  authController.validateChangePassword,
  authController.changePassword
);
router.get('/getMe', authController.protect, userController.getMe);
router.patch('/updateMe', authController.protect, userController.updateMe);
router.delete('/deleteMe', authController.protect, userController.deleteMe);

router
  .route('/')
  .get(authController.protect, authController.restrictTo(), userController.getAllUser)
  .post(authController.protect, authController.restrictTo(), userController.createNewUser);

router
  .route('/:id')
  .get(authController.protect, authController.restrictTo(), userController.getUser)
  .patch(authController.protect, authController.restrictTo(), userController.updateUser)
  .delete(authController.protect, authController.restrictTo(), userController.deleteUser);

module.exports = router;
