const express = require('express');
const router = express.Router();

const {
  getConfig,
  updateConfig,
} = require('./controller/order-flow-config.controller');

const { protect } = require('../../common/guards/auth.guard');
const validate = require('../../common/middleware/validate.middleware');
const { updateOrderFlowConfigSchema } = require('./dto/order-flow-config.dto');

// All routes require authentication
router.use(protect);

/**
 * GET /api/v1/order-flow-config
 * Get current merchant's order flow configuration
 */
router.get('/', getConfig);

/**
 * PUT /api/v1/order-flow-config
 * Update current merchant's order flow configuration
 */
router.put('/', validate(updateOrderFlowConfigSchema, 'body'), updateConfig);

module.exports = router;
