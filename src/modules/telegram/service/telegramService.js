// src/modules/telegram/services/telegramService.js
const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const TelegramLinkToken = require('../../../../models/telegramLinkTokenModel');
const Customer = require('../../../../models/customerModule');
const Merchant = require('../../../../models/merchantModel');
const TelegramMessage = require('../../../../models/TelegramMessage');

const TELEGRAM_API = 'https://api.telegram.org/bot';
const MINI_APP_BASE_URL = process.env.MINI_APP_BASE_URL; // e.g. https://app.menuroom.et
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

// ─────────────────────────────────────────────────────────────
// LINK TOKEN FLOW (QR / checkout → Telegram identity)
// ─────────────────────────────────────────────────────────────

/**
 * Generate a short-lived token used to link a Telegram account to a Customer.
 * Call this right after checkout (or from the table QR flow), when you
 * already have merchantId (+ optionally customerId / branchId / table).
 */
async function createLinkToken({
  merchantId,
  customerId = null,
  branchId = null,
  table = null,
  ttlHours = 24,
}) {
  const token = crypto.randomBytes(16).toString('hex');
  await TelegramLinkToken.create({
    token,
    merchant: merchantId,
    customer: customerId,
    branch: branchId,
    table,
    expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000),
  });
  return token;
}

function buildDeepLink(botUsername, token) {
  return `https://t.me/${botUsername}?start=${token}`;
}

function buildMiniAppUrl(merchantSlug, extraParams = {}) {
  const params = new URLSearchParams({ merchant: merchantSlug, ...extraParams });
  return `${MINI_APP_BASE_URL}/telegram-app?${params.toString()}`;
}

/**
 * Called from the webhook controller when a /start <token> command comes in.
 * Resolves the token, links the Telegram identity onto the Customer record,
 * and logs the event in the customer's history.
 *
 * FIX: now sets `source: 'telegram'` and `lastSeen` so the Customer TTL
 * guest-cleanup index doesn't delete active Telegram-linked customers.
 * FIX: only assigns `branch` if the customer doesn't already have one,
 * so a later /start token can't silently overwrite a manually-set branch.
 */
async function resolveStart(merchant, telegramUser, chatId, token) {
  const linkToken = await TelegramLinkToken.findOne({ token, merchant: merchant._id, used: false });
  if (!linkToken || linkToken.expiresAt < new Date()) return null;

  linkToken.used = true;
  linkToken.usedAt = new Date();
  await linkToken.save();

  if (!linkToken.customer) {
    // Table-only token (pre-order linking) — no customer to attach to yet.
    return null;
  }

  const existingCustomer = await Customer.findById(linkToken.customer).select('branch');

  const setFields = {
    source: 'telegram',
    lastSeen: new Date(),
    'telegram.id': String(telegramUser.id),
    'telegram.chatId': String(chatId),
    'telegram.username': telegramUser.username || null,
    'telegram.firstName': telegramUser.first_name || null,
    'telegram.linked': true,
    'telegram.linkedAt': new Date(),
    'telegram.optIn': true,
    'telegram.optInAt': new Date(),
    'telegram.lastInteractionAt': new Date(),
    ...(linkToken.branch && !existingCustomer?.branch ? { branch: linkToken.branch } : {}),
  };

  const customer = await Customer.findByIdAndUpdate(
    linkToken.customer,
    {
      $set: setFields,
      $push: {
        history: {
          action: 'telegram_link',
          details: `Linked Telegram @${telegramUser.username || telegramUser.id}`,
          addedAt: new Date(),
        },
      },
    },
    { new: true }
  );

  return customer;
}

// ─────────────────────────────────────────────────────────────
// MINI APP AUTH (initData verification)
// ─────────────────────────────────────────────────────────────

/**
 * Verifies Telegram's signed `initData` string against a specific
 * merchant's bot token. Returns the parsed Telegram user object if valid,
 * or null if the signature is invalid / the session is stale (>24h old).
 *
 * NEVER trust `initData` fields, or any merchant/customer id passed
 * alongside it, without running this check first.
 */
function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const authDateSec = Number(params.get('auth_date'));
  if (!authDateSec || Date.now() - authDateSec * 1000 > 24 * 3600 * 1000) return null; // reject stale sessions

  const userRaw = params.get('user');
  if (!userRaw) return null;

  try {
    return JSON.parse(userRaw); // { id, first_name, last_name, username, ... }
  } catch {
    return null;
  }
}

/**
 * Finds or creates a Customer for a verified Telegram Mini App user, and
 * issues an app session token. This is the entry point the Mini App calls
 * on load, after Telegram gives it `initData`.
 */
async function resolveMiniAppSession(merchant, telegramUser) {
  let customer = await Customer.findOne({
    merchant: merchant._id,
    'telegram.id': String(telegramUser.id),
  });

  if (!customer) {
    customer = await Customer.create({
      merchant: merchant._id,
      fullName:
        [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') ||
        'Telegram User',
      source: 'telegram',
      lastSeen: new Date(),
      telegram: {
        id: String(telegramUser.id),
        username: telegramUser.username || null,
        firstName: telegramUser.first_name || null,
        linked: true,
        linkedAt: new Date(),
        optIn: true,
        optInAt: new Date(),
        lastInteractionAt: new Date(),
      },
    });
  } else {
    customer.lastSeen = new Date();
    customer.telegram.lastInteractionAt = new Date();
    await customer.save();
  }

  const sessionToken = jwt.sign(
    { customerId: customer._id, merchantId: merchant._id, source: 'telegram-miniapp' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return { customer, sessionToken };
}

// ─────────────────────────────────────────────────────────────
// SENDING MESSAGES
// ─────────────────────────────────────────────────────────────

/**
 * Send a message to a linked customer's Telegram chat.
 * Never throws on Telegram-side failures (e.g. bot blocked) — logs the
 * failure to TelegramMessage instead, so one bad send can't break an
 * order-status pipeline or a broadcast loop.
 */
async function sendMessage(merchant, customerId, chatId, text, extra = {}) {
  const merchantWithToken = await Merchant.findById(merchant._id).select(
    '+telegram.telegramBotToken'
  );
  if (!merchantWithToken?.telegram?.telegramBotToken) {
    throw new Error(`Merchant ${merchant._id} has no telegramBotToken configured`);
  }
  const url = `${TELEGRAM_API}${merchantWithToken.telegram.telegramBotToken}/sendMessage`;

  try {
    const res = await axios.post(url, { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
    return await TelegramMessage.create({
      merchant: merchant._id,
      customer: customerId,
      direction: 'out',
      text,
      status: 'sent',
      telegramMessageId: res.data?.result?.message_id
        ? String(res.data.result.message_id)
        : undefined,
    });
  } catch (err) {
    const errorCode = err.response?.data?.error_code;
    const blocked = errorCode === 403;

    if (blocked && customerId) {
      await Customer.findByIdAndUpdate(customerId, {
        'telegram.optIn': false,
        'telegram.linked': false,
      });
    }

    return await TelegramMessage.create({
      merchant: merchant._id,
      customer: customerId,
      direction: 'out',
      text,
      status: 'failed',
      error: err.response?.data?.description || err.message,
    });
  }
}

/**
 * Broadcast a promotional message to every opted-in, linked customer for a
 * merchant. Rate-limited to stay under Telegram's ~30 msg/sec cap.
 * For merchants with large customer lists, call this from a queued job
 * (BullMQ/cron) rather than inline in an HTTP request handler.
 */
async function sendBroadcast(merchant, text, { promoCode } = {}) {
  const customers = await Customer.find({
    merchant: merchant._id,
    'telegram.optIn': true,
    'telegram.chatId': { $exists: true, $ne: null },
  }).select('telegram.chatId _id');

  const miniAppUrl = buildMiniAppUrl(merchant.slug, promoCode ? { promo: promoCode } : {});

  let sent = 0;
  let failed = 0;

  for (const c of customers) {
    const result = await sendMessage(merchant, c._id, c.telegram.chatId, text, {
      reply_markup: {
        inline_keyboard: [[{ text: '🎉 Order Now', web_app: { url: miniAppUrl } }]],
      },
    });
    if (result?.status === 'sent') sent++;
    else failed++;

    await new Promise(r => setTimeout(r, 40)); // ~25/sec
  }

  return { total: customers.length, sent, failed };
}

/**
 * Sends an order-status update to a customer, with a "View Order" Mini App
 * button. Call this from your existing order state-machine hook, alongside
 * your Socket.io emit, whenever an order tied to source: 'telegram' (or any
 * order for a customer with a linked Telegram account) changes status.
 */
async function sendOrderStatusUpdate(merchant, customer, order) {
  if (!customer?.telegram?.linked || !customer?.telegram?.chatId) return null;

  const statusText = {
  pending: '🧾 Your order has been received.',
  accepted: '✅ Your order has been confirmed.',
  preparing: '👨‍🍳 Your order is being prepared.',
  ready: '📦 Your order is ready.',
  served: '🍽️ Your order has been served.',
  out_for_delivery: '🛵 Your order is on the way.',
  delivered: '🎉 Your order has been delivered. Enjoy!',
  completed: '✅ Order complete.',
  canceled: '❌ Your order was canceled.',
}[order.status] || `Order status: ${order.status}`;

  const miniAppUrl = buildMiniAppUrl(merchant.slug, { view: 'orders', order: String(order._id) });

  return sendMessage(merchant, customer._id, customer.telegram.chatId, statusText, {
    reply_markup: {
      inline_keyboard: [[{ text: '📋 View Order', web_app: { url: miniAppUrl } }]],
    },
  });
}

// ─────────────────────────────────────────────────────────────
// BOT SETUP (connect / webhook / menu button)
// ─────────────────────────────────────────────────────────────

/**
 * Register (or re-register) the webhook for a merchant's bot with Telegram,
 * including the secret token Telegram will echo back on every call so the
 * controller can verify requests are genuinely from Telegram.
 */
async function registerWebhook({ merchant, botToken, publicBaseUrl }) {
  const webhookSecret = crypto.randomBytes(24).toString('hex');
  const webhookUrl = `${publicBaseUrl}/api/v1/telegram/webhook/${merchant._id}`;

  const res = await axios.post(`${TELEGRAM_API}${botToken}/setWebhook`, {
    url: webhookUrl,
    secret_token: webhookSecret,
    allowed_updates: ['message'],
  });

  if (!res.data?.ok) {
    throw new Error(`Telegram setWebhook failed: ${res.data?.description || 'unknown error'}`);
  }

  return { webhookSecret, webhookUrl };
}

/**
 * Sets the persistent "menu button" next to the chat's text input, so
 * returning customers can launch the Mini App without needing /start again.
 * Call once per bot, right after registerWebhook during onboarding.
 */
async function setMenuButton(botToken, miniAppUrl) {
  const res = await axios.post(`${TELEGRAM_API}${botToken}/setChatMenuButton`, {
    menu_button: {
      type: 'web_app',
      text: 'Order Food',
      web_app: { url: miniAppUrl },
    },
  });
  if (!res.data?.ok) {
    throw new Error(
      `Telegram setChatMenuButton failed: ${res.data?.description || 'unknown error'}`
    );
  }
  return res.data.result;
}

/**
 * Fetch the bot's own identity (used to confirm the token is valid and to
 * store the public @username needed for building deep links).
 */
async function getBotInfo(botToken) {
  const res = await axios.get(`${TELEGRAM_API}${botToken}/getMe`);
  if (!res.data?.ok) {
    throw new Error(`Telegram getMe failed: ${res.data?.description || 'invalid bot token'}`);
  }
  return res.data.result; // { id, is_bot, first_name, username, ... }
}

module.exports = {
  createLinkToken,
  buildDeepLink,
  buildMiniAppUrl,
  resolveStart,
  verifyInitData,
  resolveMiniAppSession,
  sendMessage,
  sendBroadcast,
  sendOrderStatusUpdate,
  registerWebhook,
  setMenuButton,
  getBotInfo,
};
