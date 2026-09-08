// src/modules/telegram/routes/telegramMiniAppRoute.js
const express = require('express');
const router = express.Router();
const { verifyMiniAppSession } = require('../controller/telegram.controller');

// Public — this endpoint IS the authentication step for the Mini App.
// It verifies Telegram's signed initData server-side; nothing here should
// be gated behind your normal `protect` middleware, since the Mini App has
// no session token yet when it calls this.
router.post('/miniapp/verify', verifyMiniAppSession);

module.exports = router;

// Mount alongside your other Telegram routes, e.g. in app.js:
//   app.use('/api/v1/telegram', require('./telegramWebhookRoute'));
//   app.use('/api/v1/telegram', require('./telegramMiniAppRoute'));
//   app.use('/api/v1/merchant', require('./telegramAdminRoute'));
