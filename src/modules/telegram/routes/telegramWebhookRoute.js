// src/modules/telegram/routes/telegramWebhookRoute.js
const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../controller/telegram.controller');

// No auth middleware — Telegram calls this directly.
// Verification happens via the per-merchant secret header inside the controller.
router.post('/webhook/:merchantId', handleWebhook);

module.exports = router;