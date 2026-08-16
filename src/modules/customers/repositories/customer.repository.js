const Customer = require('../../../../models/customerModule');
const CustomerSession = require('../../../../models/customerSessionModule');
const Order = require('../../../../models/orderModel');

class CustomerRepository {
  async findOne(filter) {
    return await Customer.findOne(filter);
  }

  async findById(id) {
    return await Customer.findById(id);
  }

  async findByIdAndMerchant(id, merchantId) {
    return await Customer.findOne({ _id: id, merchant: merchantId });
  }

  async findAllByMerchant(merchantId) {
    return await Customer.find({ merchant: merchantId }).sort('-lastSeen');
  }

  async findCustomerWithGifts(id, merchantId) {
    return await Customer.findOne({ _id: id, merchant: merchantId }).populate(
      'loyalty.gifts.menuItem',
      'name price image'
    );
  }

  async create(data) {
    return await Customer.create(data);
  }

  async updateById(id, data) {
    return await Customer.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
  }

  async updateByIdAndMerchant(id, merchantId, data) {
    return await Customer.findOneAndUpdate({ _id: id, merchant: merchantId }, data, {
      new: true,
      runValidators: true,
    });
  }

  async softDelete(id, merchantId) {
    return await Customer.findOneAndUpdate(
      { _id: id, merchant: merchantId },
      { isActive: false },
      { new: true }
    );
  }

  async findSessionAndRefresh(sessionToken, merchantId, branchId, tableId) {
    return await CustomerSession.findOneAndUpdate(
      {
        token: sessionToken,
        merchant: merchantId,
        branch: branchId,
        table: tableId,
        customer: null,
        isActive: true,
        expiresAt: { $gt: new Date() },
      },
      { lastAccessedAt: new Date() },
      { new: true }
    );
  }

  async getCustomerStatsFromOrders(customerId) {
    const stats = await Order.aggregate([
      { $match: { customer: customerId, status: 'completed' } },
      { $group: { _id: null, totalSpent: { $sum: '$totalAmount' }, visits: { $sum: 1 } } },
    ]);
    return stats[0] || { totalSpent: 0, visits: 0 };
  }

  async getCustomerOrders(customerId) {
    return await Order.find({ customer: customerId })
      .select('orderNumber items totalAmount status createdAt table')
      .sort('-createdAt');
  }
}

module.exports = new CustomerRepository();
