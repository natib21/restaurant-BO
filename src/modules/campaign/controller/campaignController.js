// controllers/campaignController.js
const Campaign = require('../../../../models/CampaignModal');
const campaignService = require('../service/campaignService');
const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');

/* -----------------------------------------------------
   POST /v1/campaigns
   Create a draft campaign
------------------------------------------------------ */
exports.createCampaign = catchAsync(async (req, res, next) => {
  const { name, message, imageUrl, audience, branch } = req.body;

  if (!name || !message) {
    return next(new AppError('name and message are required', 400));
  }

  const campaign = await Campaign.create({
    merchant: req.user.merchant,
    branch,
    name,
    message,
    imageUrl,
    audience,
    createdBy: req.user._id,
  });

  res.status(201).json({ status: 'success', data: { campaign } });
});

/* -----------------------------------------------------
   GET /v1/campaigns
------------------------------------------------------ */
exports.getAllCampaigns = catchAsync(async (req, res, next) => {
  const campaigns = await Campaign.find({ merchant: req.user.merchant }).sort('-createdAt');
  res.status(200).json({ status: 'success', results: campaigns.length, data: { campaigns } });
});

/* -----------------------------------------------------
   GET /v1/campaigns/:id
------------------------------------------------------ */
exports.getCampaign = catchAsync(async (req, res, next) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, merchant: req.user.merchant });
  if (!campaign) return next(new AppError('No campaign found with that ID', 404));
  res.status(200).json({ status: 'success', data: { campaign } });
});

/* -----------------------------------------------------
   POST /v1/campaigns/:id/preview-audience
   Count matching customers before actually sending
------------------------------------------------------ */
exports.previewAudience = catchAsync(async (req, res, next) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, merchant: req.user.merchant });
  if (!campaign) return next(new AppError('No campaign found with that ID', 404));

  const audience = await campaignService.resolveAudience(campaign.merchant, campaign.audience);

  res.status(200).json({ status: 'success', data: { audienceSize: audience.length } });
});

/* -----------------------------------------------------
   POST /v1/campaigns/:id/send
------------------------------------------------------ */
exports.sendCampaign = catchAsync(async (req, res, next) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, merchant: req.user.merchant });
  if (!campaign) return next(new AppError('No campaign found with that ID', 404));

  // Note: for a real production flow, kick this off as a background job and
  // return 202 immediately instead of awaiting — a large audience will take
  // longer than a typical HTTP timeout. Fine to await for now while testing.
  const sentCampaign = await campaignService.sendCampaign(campaign._id);

  res.status(200).json({ status: 'success', data: { campaign: sentCampaign } });
});
