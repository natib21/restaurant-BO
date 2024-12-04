const express = require('express');
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');
const router = express.Router();

router.post(
  '/signup',
  authController.protect,
  authController.restrictTo('admin', 'waiter'),
  authController.signup
);
router.post('/login', authController.login);

router.patch(
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

router.patch('/updateMe', authController.protect, userController.updateMe);
router.delete('/deleteMe', authController.protect, userController.deleteMe);
router
  .route('/')
  .get(userController.getAllUser)
  .post(userController.createNewUser);

router
  .route('/:id')
  .get(userController.getUser)
  .patch(
    authController.protect,
    authController.restrictTo('admin', 'waiter'),
    userController.updateUser
  )
  .delete(authController.protect, userController.deleteUser);

module.exports = router;
