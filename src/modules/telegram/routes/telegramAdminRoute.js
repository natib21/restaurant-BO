// src/modules/telegram/routes/telegramAdminRoute.js
const express = require('express');
const router = express.Router();
const {
  connectBot,
  getStatus,
  updateSettings,
  disconnectBot,
  sendToCustomer,
  broadcastPromotion,
  listConversations,
  getConversation,
  markConversationRead,
} = require('../controller/telegram.controller');

// Adjust this import to match your actual auth middleware module/export name.
const { protect, restrictTo } = require('../../../common/guards/auth.guard');
const { requireFeature } = require('../../../common/guards/feature.guard');

router.use(protect);
router.use(restrictTo());
router.use(requireFeature('telegram'));
// ── Bot connection / config ──
router.post('/:merchantId/telegram/connect', connectBot);
router.get('/:merchantId/telegram/status', getStatus);
router.patch('/:merchantId/telegram/settings', updateSettings);
router.delete('/:merchantId/telegram/disconnect', disconnectBot);

// ── Messaging ──
router.post('/:merchantId/telegram/send', sendToCustomer);
router.post('/:merchantId/telegram/broadcast', broadcastPromotion);

// ── CRM inbox ──
router.get('/:merchantId/telegram/conversations', listConversations);
router.get('/:merchantId/telegram/conversations/:customerId', getConversation);
router.patch('/:merchantId/telegram/conversations/:customerId/read', markConversationRead);

module.exports = router;
