const AppError = require('../../../../utils/appError');
const { merchantScopedQuery, getMerchantId } = require('../../../common/utils/tenant-scope');
const feedbackRepository = require('../repository/feedback.repository');

class FeedbackService {
  async submitFeedback(req, data) {
    const merchantId = getMerchantId(req);
    const branchId = req.branchId || req.tableSession?.branch;

    if (!merchantId || !branchId) {
      throw new AppError('Merchant and branch context are required to submit feedback', 400);
    }

    const feedbackData = {
      merchant: merchantId,
      branch: branchId,
      customer: req.customerId || null,
      order: data.order || null,
      rating: data.rating,
      comment: data.comment,
      categories: data.categories || [],
      channel: data.channel,
      images: data.images || [],
      isPublic: data.isPublic !== undefined ? data.isPublic : true,
      isAnonymous: req.isAnonymous === true,
      status: 'pending',
    };

    return await feedbackRepository.create(feedbackData);
  }

  async getFeedbackList(req, query) {
    const filter = merchantScopedQuery({}, req);
    if (query.status) filter.status = query.status;
    if (query.branchId) filter.branch = query.branchId;
    if (query.rating) filter.rating = query.rating;

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [results, total] = await Promise.all([
      feedbackRepository.find(filter, { sort: '-createdAt', limit, skip }),
      feedbackRepository.count(filter),
    ]);

    return { results, total, page, limit };
  }

  async getFeedbackById(req, feedbackId) {
    const merchantId = getMerchantId(req);
    const feedback = await feedbackRepository.findById(feedbackId, merchantId);

    if (!feedback) {
      throw new AppError('Feedback not found', 404);
    }

    return feedback;
  }

  async respondToFeedback(req, feedbackId, data) {
    const merchantId = getMerchantId(req);
    const update = {};

    if (data.status) update.status = data.status;
    if (data.responseText) {
      update.response = {
        text: data.responseText,
        respondedBy: req.user._id,
        respondedAt: new Date(),
      };
    }
    if (data.isPublic !== undefined) update.isPublic = data.isPublic;
    if (data.flaggedReason !== undefined) update.flaggedReason = data.flaggedReason;

    if (Object.keys(update).length === 0) {
      throw new AppError('No feedback update provided', 400);
    }

    const feedback = await feedbackRepository.updateById(feedbackId, merchantId, update);
    if (!feedback) {
      throw new AppError('Feedback not found', 404);
    }

    return feedback;
  }

  async getFeedbackStats(req, query = {}) {
    const filter = merchantScopedQuery({}, req);
    if (query.branchId) filter.branch = query.branchId;
    if (query.status) filter.status = query.status;
    if (query.channel) filter.channel = query.channel;
    if (query.rating) filter.rating = Number(query.rating);

    if (query.fromDate || query.toDate) {
      filter.createdAt = {};
      if (query.fromDate) filter.createdAt.$gte = new Date(query.fromDate);
      if (query.toDate) filter.createdAt.$lte = new Date(query.toDate);
    }

    return await feedbackRepository.getStats(filter);
  }
}

module.exports = new FeedbackService();
