const express = require('express');
const taskController = require('../controllers/taskController');
const authController = require('../controllers/authController');
const AppError = require('../utils/appError');
const router = express.Router();

// Restrict all routes to merchant admins
router.use(authController.protect);

router.get('/merchant-tasks', taskController.getMerchantTasks);

router.use((req, res, next) => {
  console.log(req.user);
  if (req.user.role.name !== 'SUPER-ADMIN') {
    return next(new AppError('Access denied. Super Admin only.', 403));
  }
  next();
});

router.route('/deleteAll').delete(authController.restrictTo(), taskController.deleteAllTasks);
router
  .route('/')
  .get(authController.restrictTo(), taskController.getAllTasks)
  .post(authController.restrictTo(), taskController.createTask);
router.route('/sync').post(authController.restrictTo(), taskController.syncTasks);
router
  .route('/:id')
  .patch(authController.restrictTo(), taskController.updateTask)
  .delete(authController.restrictTo(), taskController.deleteTask);

module.exports = router;
