// routes/merchantAnalytics.js
const express = require('express');
const merchantAnalyticsController = require('../controllers/merchantAnalyticsController');
const authController = require('../controllers/authController');

const router = express.Router({ mergeParams: true });

router.use(authController.protect);
router.use(authController.restrictTo('admin', 'manager', 'staff'));

router.get('/dashboard', merchantAnalyticsController.getDashboard);
router.post('/dm', merchantAnalyticsController.sendDirectMessage);

module.exports = router;
