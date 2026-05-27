const Merchant = require('../../../../models/merchantModel');
const User = require('../../../../models/userModel');
const Role = require('../../../../models/roleModel');
const ApiFeatures = require('../../../../utils/apiFeatures');

class MerchantRepository {
  async findAll(queryString) {
    const features = new ApiFeatures(Merchant.find(), queryString)
      .filter()
      .sort()
      .limitFields()
      .paginate();
    return await features.query.populate('approvedBy', 'firstName lastName email').lean();
  }

  async findById(id) {
    return await Merchant.findById(id)
      .populate('approvedBy', 'firstName lastName email')
      .populate({
        path: 'users',
        select: 'firstName lastName phone email role isActive',
        populate: { path: 'role', select: 'name context description' },
      });
  }

  async findByUniqueFields(phone, taxId, businessName) {
    return await Merchant.findOne({
      $or: [
        { phone },
        { taxId },
        { businessName },
      ].filter(Boolean),
    });
  }

  async create(data) {
    return await Merchant.create(data);
  }

  async updateById(id, data) {
    return await Merchant.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).populate('approvedBy', 'firstName lastName email');
  }

  async getStats(id) {
    return await Merchant.aggregate([
      { $match: { _id: id } }, // Caller must cast to ObjectId
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'merchant',
          as: 'users',
          pipeline: [{ $match: { role: { $ne: null } } }],
        },
      },
      {
        $project: {
          businessName: 1,
          status: 1,
          subscriptionPlan: 1,
          userCount: { $size: '$users' },
          cuisineType: 1,
          createdAt: 1,
        },
      },
    ]);
  }

  async deactivateUsersForMerchant(merchantId) {
    return await User.updateMany(
      { restaurant: merchantId }, // using 'restaurant' based on legacy code
      { isActive: false, role: null, restaurant: null }
    );
  }
}

module.exports = new MerchantRepository();
