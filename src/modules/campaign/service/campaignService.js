// services/campaignService.js
const Customer = require('../../../../models/customerModule');
const Merchant = require('../../../../models/merchantModel');
const Campaign = require('../../../../models/CampaignModal');

const TELEGRAM_API = 'https://api.telegram.org/bot';

// Telegram allows roughly 30 messages/second overall — this delay keeps a
// broadcast well under that without needing a queue system yet. Fine for a
// few hundred/thousand customers; if your audience grows into the tens of
// thousands, move this to a background job (BullMQ) instead of an inline loop.
const SEND_DELAY_MS = 40;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/* -----------------------------------------------------
   Resolve which customers match a campaign's audience
   filter — only customers with a linked Telegram id can
   receive anything, so that's always required.
------------------------------------------------------ */
async function resolveAudience(merchantId, audience = {}) {
  const filter = {
    merchant: merchantId,
    'telegram.id': { $exists: true, $ne: null },
  };

  if (audience.tags?.length) {
    filter['tags.value'] = { $in: audience.tags };
  }
  if (audience.loyaltyTier?.length) {
    filter['loyalty.tier'] = { $in: audience.loyaltyTier };
  }
  if (audience.minTotalOrders) {
    filter['stats.totalOrders'] = { $gte: audience.minTotalOrders };
  }

  return Customer.find(filter).select('telegram.id fullName');
}

/* -----------------------------------------------------
   Send one message via the Telegram Bot API
------------------------------------------------------ */
async function sendTelegramMessage(botToken, chatId, text, imageUrl) {
  const endpoint = imageUrl ? 'sendPhoto' : 'sendMessage';
  const body = imageUrl
    ? { chat_id: chatId, photo: imageUrl, caption: text }
    : { chat_id: chatId, text };

  const res = await fetch(`${TELEGRAM_API}${botToken}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || 'Telegram API error');
  }
  return data.result;
}

/* -----------------------------------------------------
   Main entry point: send a campaign to its resolved audience
------------------------------------------------------ */
async function sendCampaign(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'sending' || campaign.status === 'sent') {
    throw new Error(`Campaign is already ${campaign.status}`);
  }

  // Need the bot token, which is select:false on Merchant
  const merchant = await Merchant.findById(campaign.merchant).select('+telegramBotToken');
  if (!merchant?.telegramBotToken) {
    throw new Error('This merchant has no Telegram bot connected yet');
  }

  const audience = await resolveAudience(campaign.merchant, campaign.audience);

  campaign.status = 'sending';
  campaign.stats.audienceSize = audience.length;
  await campaign.save();

  let sentCount = 0;
  let failedCount = 0;

  for (const customer of audience) {
    try {
      await sendTelegramMessage(
        merchant.telegramBotToken,
        customer.telegram.id,
        campaign.message,
        campaign.imageUrl
      );
      sentCount++;
    } catch (err) {
      // Common cause: customer blocked the bot — not worth failing the whole
      // campaign over, just log and move on.
      failedCount++;
      console.error(`Campaign ${campaignId} failed for customer ${customer._id}:`, err.message);
    }
    await sleep(SEND_DELAY_MS);
  }

  campaign.status = failedCount === audience.length && audience.length > 0 ? 'failed' : 'sent';
  campaign.stats.sentCount = sentCount;
  campaign.stats.failedCount = failedCount;
  campaign.sentAt = new Date();
  await campaign.save();

  return campaign;
}

module.exports = { resolveAudience, sendCampaign };