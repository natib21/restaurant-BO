// routes/inventoryRoutes.js
const express = require('express');
const inventoryController = require('../controllers/inventoryController');
const authController = require('../controllers/authController');

const router = express.Router();

// Protect all routes
router.use(authController.protect);
router.use(authController.restrictTo());

// Ingredient routes


// Stock adjustment
router.post('/adjust-stock', inventoryController.adjustStock);

// Stock movements
router.get('/stock-movements', inventoryController.getStockMovements);

// Inventory valuation
router.get('/valuation', inventoryController.getInventoryValuation);

// Low stock alerts
router.get('/low-stock-alerts', inventoryController.getLowStockAlerts);

module.exports = router;