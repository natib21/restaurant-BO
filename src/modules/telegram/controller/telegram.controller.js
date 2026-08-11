// src/modules/telegram/controllers/telegram.controller.js
const Merchant = require('../../../../models/merchantModel'); // adjust if your controller folder is singular ("controller" not "controllers")
const { resolveStart, sendMessage, registerWebhook, getBotInfo } = require('../service/telegramService');

/**
 * POST /api/v1/telegram/webhook/:merchantId
 * Called by Telegram itself — no user auth, verified via per-merchant secret header.
 */
async function handleWebhook(req, res) {
  const { merchantId } = req.params;

  const merchant = await Merchant.findById(merchantId).select('+telegramWebhookSecret');
  if (!merchant) return res.sendStatus(404);

  const secretHeader = req.get('X-Telegram-Bot-Api-Secret-Token');
  if (!merchant.telegramWebhookSecret || secretHeader !== merchant.telegramWebhookSecret) {
    return res.sendStatus(401);
  }

  // Ack immediately — Telegram retries aggressively on non-200/slow responses.
  res.sendStatus(200);

  try {
    const msg = req.body.message;
    if (!msg) return; // ignore non-message updates for now (edited_message, callback_query, etc.)

    const chatId = msg.chat.id;
    const text = msg.text || '';

    if (text.startsWith('/start')) {
      const token = text.split(' ')[1];
      const customer = token ? await resolveStart(merchant, msg.from, chatId, token) : null;

      await sendMessage(
        merchant,
        chatId,
        customer
          ? `Welcome${customer.fullName ? ', ' + customer.fullName : ''}! You'll get order updates and offers here.`
          : `Welcome! This link seems invalid or expired — please rescan the QR at your table.`
      );
      return;
    }

    if (text === '/stop' || text.toLowerCase() === 'stop') {
      // Basic opt-out handling — extend resolveStart's counterpart to flip optIn: false
      // on the matching customer by chatId if you want this to update the CRM record too.
      await sendMessage(merchant, chatId, `You've been unsubscribed from marketing messages.`);
      return;
    }

    // Fallback for any other message
    await sendMessage(merchant, chatId, `Thanks for your message! For menu and orders, please use the link shared at your table.`);
  } catch (err) {
    req.log?.error?.({ err, merchantId }, 'telegram webhook processing failed');
  }
}

/**
 * POST /api/v1/merchant/:merchantId/telegram/connect
 * Admin-only. Merchant submits their BotFather token; we validate it,
 * register the webhook with Telegram, and store the credentials.
 * (Mount this under your authenticated merchant routes, not here.)
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

    const publicBaseUrl = process.env.PUBLIC_API_BASE_URL; // e.g. https://api.menuroom.et
    if (!publicBaseUrl) {
      return res.status(500).json({ message: 'PUBLIC_API_BASE_URL is not configured on the server' });
    }

    const { webhookSecret } = await registerWebhook({ merchant, botToken, publicBaseUrl });

    merchant.telegramBotToken = botToken;
    merchant.telegramBotUsername = botInfo.username;
    merchant.telegramWebhookSecret = webhookSecret;
    merchant.telegramBotConnectedAt = new Date();
    await merchant.save();

    return res.status(200).json({
      message: 'Telegram bot connected successfully',
      botUsername: botInfo.username,
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

    if (!merchant.telegramBotUsername || !merchant.telegramBotConnectedAt) {
      return res.status(200).json({ connected: false });
    }

    const Customer = require('../../../../models/Customer');
    const [linkedCustomersCount, optInCount] = await Promise.all([
      Customer.countDocuments({ merchant: merchantId, 'telegram.linked': true }),
      Customer.countDocuments({ merchant: merchantId, 'telegram.optIn': true }),
    ]);

    return res.status(200).json({
      connected: true,
      botUsername: merchant.telegramBotUsername,
      connectedAt: merchant.telegramBotConnectedAt,
      linkedCustomersCount,
      optInCount,
    });
  } catch (err) {
    return next(err);
  }
}
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

    await sendMessage(merchant, customer.telegram.chatId, text);

    return res.status(200).json({ message: 'Message sent' });
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
    const merchant = await Merchant.findById(merchantId).select('+telegramBotToken');
    if (!merchant) return res.status(404).json({ message: 'Merchant not found' });

    merchant.telegramBotToken = undefined;
    merchant.telegramBotUsername = undefined;
    merchant.telegramWebhookSecret = undefined;
    merchant.telegramBotConnectedAt = undefined;
    await merchant.save();

    return res.status(200).json({ message: 'Telegram bot disconnected' });
  } catch (err) {
    return next(err);
  }
}
// telegram.controller.js
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
            $sum: { $cond: [{ $and: [{ $eq: ['$direction', 'in'] }, { $eq: ['$readAt', null] }] }, 1, 0] },
          },
        },
      },
      { $sort: { lastMessageAt: -1 } },
    ]);

    // attach customer name/avatar for display
    const customerIds = conversations.map(c => c._id);
    const customers = await Customer.find({ _id: { $in: customerIds } })
      .select('fullName profileImage telegram.username')
      .lean();
    const byId = Object.fromEntries(customers.map(c => [String(c._id), c]));

    const result = conversations.map(c => ({
      customerId: c._id,
      customerName: byId[String(c._id)]?.fullName || 'Guest',
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
// telegram.controller.js
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

module.exports = {
     handleWebhook, 
     connectBot,
     getStatus,
     sendToCustomer,
     disconnectBot,
     listConversations,
     markConversationRead ,
     getConversation
   };