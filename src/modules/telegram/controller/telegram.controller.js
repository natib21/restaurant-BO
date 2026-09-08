// src/modules/telegram/controller/telegram.controller.js
const mongoose = require('mongoose');
const Merchant = require('../../../../models/merchantModel');
const Customer = require('../../../../models/customerModule');
const TelegramMessage = require('../../../../models/TelegramMessage');
const {
  resolveStart,
  sendMessage,
  sendBroadcast,
  registerWebhook,
  setMenuButton,
  getBotInfo,
  verifyInitData,
  resolveMiniAppSession,
  buildMiniAppUrl,
} = require('../service/telegramService');

// ─────────────────────────────────────────────────────────────
// PUBLIC: TELEGRAM WEBHOOK
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/telegram/webhook/:merchantId
 * Called by Telegram itself — no user auth, verified via per-merchant secret header.
 */
async function handleWebhook(req, res) {
  const { merchantId } = req.params;

  const merchant = await Merchant.findById(merchantId).select('+telegram.telegramWebhookSecret');
  if (!merchant) return res.sendStatus(404);

  const secretHeader = req.get('X-Telegram-Bot-Api-Secret-Token');
  if (
    !merchant.telegram?.telegramWebhookSecret ||
    secretHeader !== merchant.telegram.telegramWebhookSecret
  ) {
    return res.sendStatus(401);
  }

  // Ack immediately — Telegram retries aggressively on non-200/slow responses.
  res.sendStatus(200);

  try {
    const msg = req.body.message;
    if (!msg) return; // ignore non-message updates for now (edited_message, callback_query, etc.)

    const chatId = msg.chat.id;
    const text = msg.text || '';

    // Look up the customer by chatId so ANY inbound text gets logged, not just /start.
    const customer = await Customer.findOne({
      merchant: merchantId,
      'telegram.chatId': String(chatId),
    });

    if (customer) {
      await TelegramMessage.create({
        merchant: merchantId,
        customer: customer._id,
        direction: 'in',
        text,
        telegramMessageId: String(msg.message_id),
      });
      customer.telegram.lastInteractionAt = new Date();
      customer.lastSeen = new Date();
      await customer.save();
    }
    // If customer is null, this chat hasn't been linked yet (pre-/start) — nothing to log to.

    const miniAppUrl = buildMiniAppUrl(merchant.slug);

    if (text.startsWith('/start')) {
      const token = text.split(' ')[1];
      const linkedCustomer = token ? await resolveStart(merchant, msg.from, chatId, token) : null;

      await sendMessage(
        merchant,
        linkedCustomer?._id,
        chatId,
        linkedCustomer
          ? `Welcome${linkedCustomer.fullName ? ', ' + linkedCustomer.fullName : ''}! 🍽️ You'll get order updates and offers here.`
          : `Welcome! This link seems invalid or expired — please rescan the QR at your table, or tap the menu button below to order.`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🍽 Order Food', web_app: { url: miniAppUrl } }]],
          },
        }
      );
      return;
    }

    if (text === '/menu') {
      await sendMessage(
        merchant,
        customer?._id,
        chatId,
        `Tap below to browse the menu and order.`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🍽 Open Menu', web_app: { url: miniAppUrl } }]],
          },
        }
      );
      return;
    }

    if (text === '/orders') {
      await sendMessage(merchant, customer?._id, chatId, `Tap below to see your order history.`, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📋 My Orders',
                web_app: { url: buildMiniAppUrl(merchant.slug, { view: 'orders' }) },
              },
            ],
          ],
        },
      });
      return;
    }

    if (text === '/stop' || text.toLowerCase() === 'stop') {
      if (customer) {
        customer.telegram.optIn = false;
        await customer.save();
      }
      await sendMessage(
        merchant,
        customer?._id,
        chatId,
        `You've been unsubscribed from marketing messages. You'll still receive order updates for active orders.`
      );
      return;
    }

    // Fallback for any other message — still logged above regardless of this reply.
    await sendMessage(
      merchant,
      customer?._id,
      chatId,
      `Thanks for your message! Our team will reply here shortly. To order, tap the menu button below.`
    );
  } catch (err) {
    req.log?.error?.({ err, merchantId }, 'telegram webhook processing failed');
  }
}

// ─────────────────────────────────────────────────────────────
// PUBLIC: MINI APP SESSION VERIFICATION
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/telegram/miniapp/verify
 * Called by the Mini App frontend on load, with Telegram's signed initData.
 * Public route — this endpoint IS the authentication step. Never trust a
 * merchant/customer id passed alongside initData without this check.
 * Body: { merchantSlug, initData }
 */
async function verifyMiniAppSession(req, res, next) {
  try {
    const { merchantSlug, initData } = req.body;
    if (!merchantSlug || !initData) {
      return res.status(400).json({ message: 'merchantSlug and initData are required' });
    }

    const merchant = await Merchant.findOne({ slug: merchantSlug }).select(
      '+telegram.telegramBotToken'
    );
    if (!merchant?.telegram?.telegramBotToken) {
      return res.status(404).json({ message: 'Merchant not found or Telegram not configured' });
    }

    const telegramUser = verifyInitData(initData, merchant.telegram.telegramBotToken);
    if (!telegramUser) {
      return res.status(401).json({ message: 'Invalid or expired Telegram session' });
    }

    const { customer, sessionToken } = await resolveMiniAppSession(merchant, telegramUser);

    return res.status(200).json({
      token: sessionToken,
      customer: {
        id: customer._id,
        fullName: customer.fullName,
        loyalty: customer.loyalty,
      },
      merchant: {
        id: merchant._id,
        slug: merchant.slug,
        businessName: merchant.businessName,
        brandColor: merchant.brandColor,
        logo: merchant.logo,
        settings: merchant.settings,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// AUTHENTICATED: MERCHANT DASHBOARD — BOT CONFIG
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/merchant/:merchantId/telegram/connect
 * Admin-only. Merchant submits their BotFather token; we validate it,
 * register the webhook with Telegram, set the persistent menu button,
 * and store the credentials.
 */
async function connectBot(req, res, next) {
  try {
    const { merchantId } = req.params;
    const { botToken } = req.body;

    if (!botToken) {
      return res.status(400).json({ message: 'botToken is required' });
    }

    const merchant = await Merchant.findById(merchantId);
    if (!merchant) return res.status(404).json({ message: 'Merchant not found' });

    const botInfo = await getBotInfo(botToken); // throws if token invalid

    const publicBaseUrl = process.env.PUBLIC_API_BASE_URL;
    if (!publicBaseUrl) {
      return res
        .status(500)
        .json({ message: 'PUBLIC_API_BASE_URL is not configured on the server' });
    }

    const { webhookSecret } = await registerWebhook({ merchant, botToken, publicBaseUrl });

    // Menu button requires a live Mini App URL. Skip gracefully if not configured yet
    // instead of failing the whole connect flow — this can be set later once the
    // Mini App frontend exists.
    if (process.env.MINI_APP_BASE_URL) {
      try {
        const miniAppUrl = buildMiniAppUrl(merchant.slug);
        await setMenuButton(botToken, miniAppUrl);
      } catch (menuErr) {
        req.log?.warn?.(
          { err: menuErr, merchantId },
          'setMenuButton failed — continuing without it'
        );
      }
    }

    merchant.telegram.telegramBotToken = botToken;
    merchant.telegram.telegramBotUsername = botInfo.username;
    merchant.telegram.telegramWebhookSecret = webhookSecret;
    merchant.telegram.telegramBotConnectedAt = new Date();
    merchant.telegram.enabled = true;
    await merchant.save();
    await merchant.save();

    return res.status(200).json({
      message: 'Telegram bot connected successfully',
      botUsername: botInfo.username,
      deepLink: `https://t.me/${botInfo.username}`,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/v1/merchant/:merchantId/telegram/status
 * Authenticated. Returns connection state for the BO settings page.
 */
async function getStatus(req, res, next) {
  try {
    const { merchantId } = req.params;
    const merchant = await Merchant.findById(merchantId);
    if (!merchant) return res.status(404).json({ message: 'Merchant not found' });

    if (!merchant.telegram?.telegramBotUsername || !merchant.telegram?.telegramBotConnectedAt) {
      return res.status(200).json({ connected: false });
    }

    const [linkedCustomersCount, optInCount] = await Promise.all([
      Customer.countDocuments({ merchant: merchantId, 'telegram.linked': true }),
      Customer.countDocuments({ merchant: merchantId, 'telegram.optIn': true }),
    ]);

    return res.status(200).json({
      connected: true,
      botUsername: merchant.telegram.telegramBotUsername,
      connectedAt: merchant.telegram.telegramBotConnectedAt,
      linkedCustomersCount,
      optInCount,
      settings: merchant.telegram,
      deepLink: `https://t.me/${merchant.telegram.telegramBotUsername}`,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/v1/merchant/:merchantId/telegram/settings
 * Authenticated. Toggle delivery/notifications/marketing switches without
 * touching bot credentials.
 * Body: { deliveryEnabled?, notificationsEnabled?, marketingEnabled? }
 */
async function updateSettings(req, res, next) {
  try {
    const { merchantId } = req.params;
    const { deliveryEnabled, notificationsEnabled, marketingEnabled } = req.body;

    const merchant = await Merchant.findById(merchantId);
    if (!merchant) return res.status(404).json({ message: 'Merchant not found' });

    if (deliveryEnabled !== undefined) merchant.telegram.deliveryEnabled = deliveryEnabled;
    if (notificationsEnabled !== undefined)
      merchant.telegram.notificationsEnabled = notificationsEnabled;
    if (marketingEnabled !== undefined) merchant.telegram.marketingEnabled = marketingEnabled;

    await merchant.save();
    return res.status(200).json({ message: 'Settings updated', settings: merchant.telegram });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/v1/merchant/:merchantId/telegram/disconnect
 * Authenticated. Clears stored bot credentials. Does not delete customer
 * telegram links already captured — those remain valid CRM data, they just
 * won't receive new messages until reconnected.
 */
async function disconnectBot(req, res, next) {
  try {
    const { merchantId } = req.params;
    const merchant = await Merchant.findById(merchantId).select('+telegram.telegramBotToken');
    if (!merchant) return res.status(404).json({ message: 'Merchant not found' });

    merchant.telegram.telegramBotToken = undefined;
    merchant.telegram.telegramBotUsername = undefined;
    merchant.telegram.telegramWebhookSecret = undefined;
    merchant.telegram.telegramBotConnectedAt = undefined;
    merchant.telegram.enabled = false;
    await merchant.save();

    return res.status(200).json({ message: 'Telegram bot disconnected' });
  } catch (err) {
    return next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// AUTHENTICATED: MESSAGING / CRM INBOX
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/merchant/:merchantId/telegram/send
 * Authenticated. Send a one-off message to a specific linked customer.
 * Body: { customerId, text }
 */
async function sendToCustomer(req, res, next) {
  try {
    const { merchantId } = req.params;
    const { customerId, text } = req.body;

    if (!customerId || !text) {
      return res.status(400).json({ message: 'customerId and text are required' });
    }

    const merchant = await Merchant.findById(merchantId);
    if (!merchant) return res.status(404).json({ message: 'Merchant not found' });

    const customer = await Customer.findOne({ _id: customerId, merchant: merchantId });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    if (!customer.telegram?.linked || !customer.telegram?.chatId) {
      return res.status(400).json({ message: 'Customer has not linked Telegram yet' });
    }

    const result = await sendMessage(merchant, customer._id, customer.telegram.chatId, text);

    if (result?.status === 'failed') {
      return res
        .status(502)
        .json({ message: 'Telegram rejected the message', error: result.error });
    }

    return res.status(200).json({ message: 'Message sent' });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/merchant/:merchantId/telegram/broadcast
 * Authenticated, admin-only. Sends a promotional message to every
 * opted-in, linked customer. For large customer bases, wrap this call in a
 * background job (BullMQ/cron) instead of awaiting it inline — this handler
 * will block until every message is sent (rate-limited to ~25/sec).
 * Body: { text, promoCode? }
 */
async function broadcastPromotion(req, res, next) {
  try {
    const { merchantId } = req.params;
    const { text, promoCode } = req.body;

    if (!text) return res.status(400).json({ message: 'text is required' });

    const merchant = await Merchant.findById(merchantId);
    if (!merchant) return res.status(404).json({ message: 'Merchant not found' });

    if (!merchant.telegram?.marketingEnabled) {
      return res.status(403).json({ message: 'Marketing messages are disabled for this merchant' });
    }

    const result = await sendBroadcast(merchant, text, { promoCode });
    return res.status(200).json({ message: 'Broadcast complete', ...result });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/v1/merchant/:merchantId/telegram/conversations
 * Authenticated. Returns one row per customer with their most recent
 * message, for a WhatsApp-style inbox list in the dashboard.
 */
async function listConversations(req, res, next) {
  try {
    const { merchantId } = req.params;

    const conversations = await TelegramMessage.aggregate([
      { $match: { merchant: new mongoose.Types.ObjectId(merchantId) } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$customer',
          lastMessage: { $first: '$text' },
          lastMessageAt: { $first: '$createdAt' },
          lastDirection: { $first: '$direction' },
          unreadCount: {
            $sum: {
              $cond: [{ $and: [{ $eq: ['$direction', 'in'] }, { $eq: ['$readAt', null] }] }, 1, 0],
            },
          },
        },
      },
      { $sort: { lastMessageAt: -1 } },
    ]);

    const customerIds = conversations.map(c => c._id);
    const customers = await Customer.find({ _id: { $in: customerIds } })
      .select('fullName profileImage telegram.username')
      .lean();
    const byId = Object.fromEntries(customers.map(c => [String(c._id), c]));

    const result = conversations.map(c => ({
      customerId: c._id,
      customerName: byId[String(c._id)]?.fullName || 'Guest',
      telegramUsername: byId[String(c._id)]?.telegram?.username || null,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      lastDirection: c.lastDirection,
      unreadCount: c.unreadCount,
    }));

    return res.status(200).json({ conversations: result });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/v1/merchant/:merchantId/telegram/conversations/:customerId
 * Authenticated. Full message history with one customer.
 */
async function getConversation(req, res, next) {
  try {
    const { merchantId, customerId } = req.params;

    const messages = await TelegramMessage.find({ merchant: merchantId, customer: customerId })
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json({ messages });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /api/v1/merchant/:merchantId/telegram/conversations/:customerId/read
 * Authenticated. Marks all inbound messages from this customer as read.
 */
async function markConversationRead(req, res, next) {
  try {
    const { merchantId, customerId } = req.params;
    await TelegramMessage.updateMany(
      { merchant: merchantId, customer: customerId, direction: 'in', readAt: null },
      { $set: { readAt: new Date() } }
    );
    return res.status(200).json({ message: 'Marked as read' });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  handleWebhook,
  verifyMiniAppSession,
  connectBot,
  getStatus,
  updateSettings,
  disconnectBot,
  sendToCustomer,
  broadcastPromotion,
  listConversations,
  markConversationRead,
  getConversation,
};
