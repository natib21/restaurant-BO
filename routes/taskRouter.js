const express = require('express');
const taskController = require('../controllers/taskController');
const authController = require('../controllers/authController');

const router = express.Router();

// Restrict all routes to merchant admins
// router.use(authController.protect, authController.restrictTo('admin'));

router
  .route('/deleteAll')
  .delete(authController.protect, authController.restrictTo(), taskController.deleteAllTasks);
router
  .route('/')
  .get(authController.protect, authController.restrictTo(), taskController.getAllTasks)
  .post(authController.protect, authController.restrictTo(), taskController.createTask);
router
  .route('/sync')
  .post(authController.protect, authController.restrictTo(), taskController.syncTasks);
router
  .route('/:id')
  .patch(authController.protect, authController.restrictTo(), taskController.updateTask)
  .delete(authController.protect, authController.restrictTo(), taskController.deleteTask);

module.exports = router;
