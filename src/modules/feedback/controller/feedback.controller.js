const catchAsync = require('../../../../utils/catchAsync');
const feedbackService = require('../service/feedback.service');

exports.submitFeedback = catchAsync(async (req, res) => {
  const body = req.validatedBody || req.body;
  const feedback = await feedbackService.submitFeedback(req, body);

  res.status(201).json({
    status: 'success',
    data: { feedback },
  });
});

exports.getAllFeedback = catchAsync(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const { results, total, page, limit } = await feedbackService.getFeedbackList(req, query);

  res.status(200).json({
    status: 'success',
    results: results.length,
    total,
    page,
    limit,
    data: { feedback: results },
  });
});

exports.getFeedback = catchAsync(async (req, res) => {
  const feedback = await feedbackService.getFeedbackById(req, req.params.id);

  res.status(200).json({
    status: 'success',
    data: { feedback },
  });
});

exports.respondToFeedback = catchAsync(async (req, res) => {
  const body = req.validatedBody || req.body;
  const feedback = await feedbackService.respondToFeedback(req, req.params.id, body);

  res.status(200).json({
    status: 'success',
    data: { feedback },
  });
});

exports.getFeedbackStats = catchAsync(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const stats = await feedbackService.getFeedbackStats(req, query);

  res.status(200).json({
    status: 'success',
    data: { stats },
  });
});
