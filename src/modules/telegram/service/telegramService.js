// src/modules/telegram/services/telegramService.js
const crypto = require('crypto');
const axios = require('axios');
const TelegramLinkToken = require('../../../../models/telegramLinkTokenModel');
const Customer = require('../../../../models/customerModule');
const Merchant = require('../../../../models/merchantModel');

const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * Generate a short-lived token used to link a Telegram account to a Customer.
 * Call this right after checkout (or from the table QR flow), when you
 * already have merchantId (+ optionally customerId / branchId / table).
 */
async function createLinkToken({ merchantId, customerId = null, branchId = null, table = null, ttlHours = 24 }) {
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

/**
 * Called from the webhook controller when a /start <token> command comes in.
 * Resolves the token, links the Telegram identity onto the Customer record,
 * and logs the event in the customer's history.
 */
async function resolveStart(merchant, telegramUser, chatId, token) {
  const linkToken = await TelegramLinkToken.findOne({ token, merchant: merchant._id, used: false });
  if (!linkToken || linkToken.expiresAt < new Date()) return null;

  linkToken.used = true;
  linkToken.usedAt = new Date();
  await linkToken.save();

  if (!linkToken.customer) {
    // Table-only token (pre-order linking) — no customer to attach to yet.
    // Extend here if you support linking Telegram before the first order exists.
    return null;
  }

  const update = {
    'telegram.id': String(telegramUser.id),
    'telegram.chatId': String(chatId),
    'telegram.username': telegramUser.username || null,
    'telegram.firstName': telegramUser.first_name || null,
    'telegram.linked': true,
    'telegram.linkedAt': new Date(),
    'telegram.optIn': true,
    'telegram.optInAt': new Date(),
    'telegram.lastInteractionAt': new Date(),
    ...(linkToken.branch ? { branch: linkToken.branch } : {}),
    $push: {
      history: {
        action: 'telegram_link',
        details: `Linked Telegram @${telegramUser.username || telegramUser.id}`,
        addedAt: new Date(),
      },
    },
  };

  // $push must be top-level in findByIdAndUpdate, not mixed with dot-path sets in the same object literal issue —
  // separate the $set and $push explicitly to avoid Mongoose flattening surprises.
  const { $push, ...setFields } = update;

  const customer = await Customer.findByIdAndUpdate(
    linkToken.customer,
    { $set: setFields, $push },
    { new: true }
  );

  return customer;
}

/**
 * Send a message to a linked customer's Telegram chat.
 */
async function sendMessage(merchant, chatId, text, extra = {}) {
  const merchantWithToken = await Merchant.findById(merchant._id).select('+telegramBotToken');
  if (!merchantWithToken?.telegramBotToken) {
    throw new Error(`Merchant ${merchant._id} has no telegramBotToken configured`);
  }
  const url = `${TELEGRAM_API}${merchantWithToken.telegramBotToken}/sendMessage`;
  return axios.post(url, { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

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
  resolveStart,
  sendMessage,
  registerWebhook,
  getBotInfo,
};