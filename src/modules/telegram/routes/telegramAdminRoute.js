// src/modules/telegram/routes/telegramAdminRoute.js
const express = require('express');
const router = express.Router();
const { connectBot,getStatus,disconnectBot ,sendToCustomer,getConversation,listConversations, markConversationRead} = require('../controller/telegram.controller');

// Adjust this import to match your actual auth middleware module/export name.
const { protect, restrictTo } = require('../../../common/guards/auth.guard');

// Authenticated — only the merchant's own admin/owner should be able to connect a bot.
router.post(
  '/:merchantId/telegram/connect',
  protect,
  restrictTo(),
  connectBot
);
router.get(
  '/:merchantId/telegram/status',
  protect,
  restrictTo(),
  getStatus
);
 
router.delete(
  '/:merchantId/telegram/disconnect',
  protect,
  restrictTo(),
  disconnectBot
);
router.post(
  '/:merchantId/telegram/send',
  protect,
  restrictTo(),
  sendToCustomer
);
router.get(
  '/:merchantId/telegram/conversations',
   protect, 
   restrictTo(),
   listConversations
  );
router.get(
  '/:merchantId/telegram/conversations/:customerId',
   protect, 
   restrictTo(),
   getConversation);
router.patch(
  '/:merchantId/telegram/conversations/:customerId/read',
   protect,
   restrictTo(),
   markConversationRead);
module.exports = router;