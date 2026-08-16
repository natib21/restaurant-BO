// routes/campaignRoutes.js
const express = require('express');
const campaignController = require('./controller/campaignController');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const { requireFeature } = require('../../common/guards/feature.guard');

const router = express.Router();

router.use(protect);
router.use(restrictTo());
router.use(requireFeature('campaigns'));

router.route('/').get(campaignController.getAllCampaigns).post(campaignController.createCampaign);

router.route('/:id').get(campaignController.getCampaign);

router.post('/:id/preview-audience', campaignController.previewAudience);
router.post('/:id/send', campaignController.sendCampaign);

module.exports = router;
