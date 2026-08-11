const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const { protectTableSession } = require('../customers/customer-session.guard');
const validate = require('../../common/middleware/validate.middleware');
const feedbackController = require('./controller/feedback.controller');
const {
  createFeedbackSchema,
  feedbackQuerySchema,
  updateFeedbackResponseSchema,
} = require('./dto/feedback.dto');

const router = express.Router();

router.post(
  '/',
  protectTableSession,
  validate(createFeedbackSchema, 'body'),
  feedbackController.submitFeedback
);

router.use(protect);
router.use(restrictTo('admin', 'manager'));

router.get('/stats', feedbackController.getFeedbackStats);
router.get('/', validate(feedbackQuerySchema, 'query'), feedbackController.getAllFeedback);
router.get('/:id', feedbackController.getFeedback);
router.patch('/:id/response', validate(updateFeedbackResponseSchema, 'body'), feedbackController.respondToFeedback);

module.exports = router;
