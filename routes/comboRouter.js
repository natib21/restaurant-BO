// routes/comboRoutes.js
const express = require('express');
const comboController = require('../controllers/comboController');
const authController = require('../controllers/authController');

const router = express.Router({ mergeParams: true });

// Public (customer)
router.get('/active', comboController.getActiveCombos);

// Protected (merchant only)
router.use(authController.protect, authController.restrictTo('merchant', 'admin'));

router.post('/', comboController.createCombo);
router.get('/', comboController.getAllCombos);

router
  .route('/:id')
  .get(comboController.getCombo)
  .patch(comboController.updateCombo)
  .delete(comboController.deleteCombo);

module.exports = router;