// services/campaignService.js
const Customer = require('../../../../models/customerModule');
const Merchant = require('../../../../models/merchantModel');
const Campaign = require('../../../../models/CampaignModal');
const {
  sendMessage,
  sendPhotoMessage,
  buildMiniAppUrl,
} = require('../../telegram/service/telegramService');

const TELEGRAM_API = 'https://api.telegram.org/bot';

function buildAudienceQuery(merchantId, audience = {}) {
  const query = {
    merchant: merchantId,
    'telegram.linked': true,
    'telegram.optIn': true,
    'telegram.chatId': { $exists: true, $ne: null },
  };

  if (audience.tags?.length) {
    query['tags.value'] = { $in: audience.tags };
  }
  if (audience.loyaltyTier?.length) {
    query['loyalty.tier'] = { $in: audience.loyaltyTier };
  }
  if (audience.minTotalOrders) {
    query['stats.totalOrders'] = { $gte: audience.minTotalOrders };
  }

  return query;
}
async function resolveAudience(merchantId, audience = {}) {
  return Customer.find(buildAudienceQuery(merchantId, audience)).select('telegram.chatId fullName');
}
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
// async function resolveAudience(merchantId, audience = {}) {
//   const filter = {
//     merchant: merchantId,
//     'telegram.id': { $exists: true, $ne: null },
//   };

//   if (audience.tags?.length) {
//     filter['tags.value'] = { $in: audience.tags };
//   }
//   if (audience.loyaltyTier?.length) {
//     filter['loyalty.tier'] = { $in: audience.loyaltyTier };
//   }
//   if (audience.minTotalOrders) {
//     filter['stats.totalOrders'] = { $gte: audience.minTotalOrders };
//   }

//   return Customer.find(filter).select('telegram.id fullName');
// }

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
  // Atomically claim the send — prevents a double-click or retry from
  // triggering two concurrent sends of the same campaign.
  const campaign = await Campaign.findOneAndUpdate(
    { _id: campaignId, status: { $in: ['draft', 'failed'] } },
    { $set: { status: 'sending' } },
    { new: true }
  );
  if (!campaign) {
    const existing = await Campaign.findById(campaignId);
    throw new Error(existing ? `Campaign is already ${existing.status}` : 'Campaign not found');
  }

  const merchant = await Merchant.findById(campaign.merchant).select('+telegramBotToken');
  if (!merchant?.telegramBotToken) {
    campaign.status = 'failed';
    await campaign.save();
    throw new Error('This merchant has no Telegram bot connected yet');
  }
  if (!merchant.telegram?.marketingEnabled) {
    campaign.status = 'failed';
    await campaign.save();
    throw new Error('Marketing messages are disabled for this merchant');
  }

  const audience = await resolveAudience(campaign.merchant, campaign.audience);
  campaign.stats.audienceSize = audience.length;
  await campaign.save();

  const miniAppUrl = buildMiniAppUrl(merchant.slug);
  const replyMarkup = {
    reply_markup: { inline_keyboard: [[{ text: '🎉 Order Now', web_app: { url: miniAppUrl } }]] },
  };

  let sentCount = 0;
  let failedCount = 0;

  for (const customer of audience) {
    const result = campaign.imageUrl
      ? await sendPhotoMessage(
          merchant,
          customer._id,
          customer.telegram.chatId,
          campaign.imageUrl,
          campaign.message,
          miniAppUrl
        )
      : await sendMessage(
          merchant,
          customer._id,
          customer.telegram.chatId,
          campaign.message,
          replyMarkup
        );

    result?.status === 'sent' ? sentCount++ : failedCount++;
    await new Promise(r => setTimeout(r, SEND_DELAY_MS));
  }

  campaign.status = failedCount === audience.length && audience.length > 0 ? 'failed' : 'sent';
  campaign.stats.sentCount = sentCount;
  campaign.stats.failedCount = failedCount;
  campaign.sentAt = new Date();
  await campaign.save();

  return campaign;
}

module.exports = { resolveAudience, buildAudienceQuery, sendCampaign };
