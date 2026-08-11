// routes/campaignRoutes.js
const express = require('express');
const campaignController = require('./controller/campaignController');
const { protect, restrictTo } = require('../../common/guards/auth.guard');

const router = express.Router();

router.use(protect);
router.use(restrictTo('admin', 'manager'));

router
  .route('/')
  .get(campaignController.getAllCampaigns)
  .post(campaignController.createCampaign);

router.route('/:id').get(campaignController.getCampaign);

router.post('/:id/preview-audience', campaignController.previewAudience);
router.post('/:id/send', campaignController.sendCampaign);

module.exports = router;