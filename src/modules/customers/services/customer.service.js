const AppError = require('../../../../utils/appError');
const customerRepository = require('../repositories/customer.repository');

const POINTS_PER_BIRR = 1;
const TIERS = { bronze: 0, silver: 5000, gold: 20000, platinum: 50000 };

const ensureHistoryArray = customer => {
  if (!Array.isArray(customer.history)) customer.history = [];
};

class CustomerService {
  async updateMe(customer, data) {
    const { fullName, phone } = data;

    if (fullName) customer.fullName = fullName.trim();
    if (phone) {
      const cleanPhone = phone.replace(/\s/g, '');
      if (!/^\+?251[79]\d{8}$/.test(cleanPhone)) {
        throw new AppError('Invalid phone number', 400);
      }
      customer.phone = cleanPhone;
    }

    ensureHistoryArray(customer);
    customer.history.push({
      action: 'update_profile',
      details: 'Customer updated profile info',
      addedAt: new Date(),
    });

    return await customer.save();
  }

  async claimGift(customer, giftId) {
    const gift = customer.loyalty.gifts.id(giftId);
    if (!gift || gift.claimed || (gift.expiresAt && gift.expiresAt < new Date())) {
      throw new AppError('Invalid or expired gift', 400);
    }
    gift.claimed = true;
    gift.claimedAt = new Date();
    await customer.save();
  }

  async giveGift(merchantId, customerId, giftData, staffId) {
    const customer = await customerRepository.findByIdAndMerchant(customerId, merchantId);
    if (!customer) throw new AppError('Customer not found', 404);

    const { name, type = 'free_item', value, menuItemId, expiresInDays = 30, reason } = giftData;

    customer.loyalty.gifts.push({
      name,
      type,
      value,
      menuItem: menuItemId,
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      givenBy: staffId,
      reason,
    });

    ensureHistoryArray(customer);
    customer.history.push({
      action: 'gift_given',
      details: `Gift "${name}" given`,
      addedAt: new Date(),
      addedBy: staffId,
    });

    await customer.save();
    return customer;
  }

  async addTagOrNote(merchantId, customerId, tagData, staffId) {
    const { tag, note } = tagData;
    const update = { $push: {} };
    if (tag) update.$push.tags = { value: tag, addedBy: staffId };
    if (note) update.$push.notes = { text: note, addedBy: staffId };

    const customer = await customerRepository.updateByIdAndMerchant(customerId, merchantId, update);
    if (!customer) throw new AppError('Customer not found', 404);
    return customer;
  }

  async updateCustomerByStaff(merchantId, customerId, data, staffId) {
    const allowed = [
      'fullName', 'phone', 'tags', 'notes', 'loyalty.points',
      'loyalty.tier', 'stats.totalOrders', 'stats.totalSpent',
    ];
    const updates = {};
    allowed.forEach(field => {
      if (data[field] !== undefined) updates[field] = data[field];
    });

    const customer = await customerRepository.updateByIdAndMerchant(customerId, merchantId, updates);
    if (!customer) throw new AppError('Customer not found', 404);

    ensureHistoryArray(customer);
    customer.history.push({
      action: 'staff_update',
      details: `Staff ${staffId} updated fields: ${Object.keys(updates).join(', ')}`,
      addedAt: new Date(),
      addedBy: staffId,
    });
    
    return await customer.save();
  }

  async deleteCustomer(merchantId, customerId) {
    const customer = await customerRepository.softDelete(customerId, merchantId);
    if (!customer) throw new AppError('Customer not found', 404);
  }

  async getCustomerStats(customerId, merchantId) {
    const customer = await customerRepository.findCustomerWithGifts(customerId, merchantId);
    if (!customer) throw new AppError('Customer not found', 404);

    const stats = await customerRepository.getCustomerStatsFromOrders(customerId);
    return { customer, stats };
  }

  async awardPoints(customerId, amount) {
    const points = Math.floor(amount * POINTS_PER_BIRR);
    const customer = await customerRepository.findById(customerId);
    if (!customer) return;

    customer.loyalty.points += points;
    customer.loyalty.totalPointsEarned += points;

    const newTier = Object.keys(TIERS).reverse().find(t => customer.loyalty.totalPointsEarned >= TIERS[t]);
    if (newTier && newTier !== customer.loyalty.tier) customer.loyalty.tier = newTier;

    ensureHistoryArray(customer);
    customer.history.push({
      action: 'award_points',
      details: `Awarded ${points} points`,
      addedAt: new Date(),
    });

    await customer.save();
  }
}

module.exports = new CustomerService();
