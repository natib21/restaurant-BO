const Feedback = require('../../../../models/feedbackModal');

class FeedbackRepository {
  async create(data) {
    return await Feedback.create(data);
  }

  async find(filter = {}, options = {}) {
    let query = Feedback.find(filter).sort(options.sort || '-createdAt');
    if (options.limit) query = query.limit(options.limit);
    if (options.skip) query = query.skip(options.skip);
    return await query.exec();
  }

  async count(filter = {}) {
    return await Feedback.countDocuments(filter).exec();
  }

  async findById(id, merchantId) {
    return await Feedback.findOne({ _id: id, merchant: merchantId }).exec();
  }

  async updateById(id, merchantId, update) {
    return await Feedback.findOneAndUpdate({ _id: id, merchant: merchantId }, update, {
      new: true,
      runValidators: true,
    }).exec();
  }

  async getStats(filter = {}) {
    const [
      totalCount,
      ratingDistribution,
      statusDistribution,
      categoryDistribution,
      channelDistribution,
      averageRating,
    ] = await Promise.all([
      Feedback.countDocuments(filter),
      Feedback.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$rating',
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Feedback.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      Feedback.aggregate([
        { $match: filter },
        { $unwind: '$categories' },
        {
          $group: {
            _id: '$categories',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      Feedback.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$channel',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      Feedback.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            average: { $avg: '$rating' },
          },
        },
      ]),
    ]);

    const ratingMap = {};
    for (let i = 1; i <= 5; i++) ratingMap[i] = 0;
    ratingDistribution.forEach(r => {
      ratingMap[r._id] = r.count;
    });

    const statusMap = {
      pending: 0,
      reviewed: 0,
      responded: 0,
      resolved: 0,
      flagged: 0,
    };
    statusDistribution.forEach(s => {
      statusMap[s._id] = s.count;
    });

    const categoryMap = {};
    categoryDistribution.forEach(c => {
      categoryMap[c._id] = c.count;
    });

    const channelMap = {};
    channelDistribution.forEach(c => {
      channelMap[c._id] = c.count;
    });

    return {
      totalCount,
      averageRating: averageRating[0]?.average ? Math.round(averageRating[0].average * 10) / 10 : 0,
      ratingDistribution: ratingMap,
      statusDistribution: statusMap,
      categoryDistribution: categoryMap,
      channelDistribution: channelMap,
    };
  }
}

module.exports = new FeedbackRepository();
