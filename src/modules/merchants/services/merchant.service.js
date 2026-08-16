const AppError = require('../../../../utils/appError');
const merchantRepository = require('../repositories/merchant.repository');
const mongoose = require('mongoose');

class MerchantService {
  async getAllMerchants(queryString, baseUrl) {
    const merchants = await merchantRepository.findAll(queryString);

    return merchants.map(m => ({
      ...m,
      logo: m.logo ? `${baseUrl}/${m.logo}` : null,
      coverImage: m.coverImage ? `${baseUrl}/${m.coverImage}` : null,
      documentCount: m.documents?.length || 0,
      userCount: m.users?.length || 0,
    }));
  }

  async getMerchantById(id, baseUrl) {
    const merchant = await merchantRepository.findById(id);
    if (!merchant) throw new AppError('Merchant not found', 404);

    const merchantObj = merchant.toObject();
    return {
      ...merchantObj,
      logo: merchantObj.logo ? `${baseUrl}/${merchantObj.logo}` : null,
      coverImage: merchantObj.coverImage ? `${baseUrl}/${merchantObj.coverImage}` : null,
    };
  }

  async createMerchant(data, approvedByUserId) {
    const exists = await merchantRepository.findByUniqueFields(
      data.phone,
      data.taxId,
      data.businessName
    );
    if (exists) {
      throw new AppError('Merchant already exists with this phone, tax ID, or name', 400);
    }

    data.status = 'pending';
    data.isActive = true;
    data.approvedBy = approvedByUserId;

    const merchant = await merchantRepository.create(data);
    return await merchantRepository.findById(merchant._id);
  }

  async updateMerchant(id, data, currentUser) {
    const blocked = ['phone', 'taxId', 'businessName'];
    for (const field of blocked) {
      if (data[field]) throw new AppError(`Cannot update ${field}`, 400);
    }

    if (data.status === 'approved') {
      data.approvedBy = currentUser._id;
    }

    const merchant = await merchantRepository.updateById(id, data);
    if (!merchant) throw new AppError('Merchant not found', 404);

    return merchant;
  }

  async updateMe(merchantId, data) {
    const restrictedFields = [
      'status',
      'isActive',
      'taxId',
      'approvedBy',
      'subscriptionPlan',
      'suspendedReason',
      'suspendedAt',
      'createdAt',
    ];

    restrictedFields.forEach(field => {
      if (data[field] !== undefined) delete data[field];
    });

    const updatedMerchant = await merchantRepository.updateById(merchantId, data);
    if (!updatedMerchant) throw new AppError('Merchant record not found.', 404);
    return updatedMerchant;
  }

  async deleteMerchant(id) {
    const merchant = await merchantRepository.updateById(id, {
      status: 'inactive',
      isActive: false,
    });
    if (!merchant) throw new AppError('Merchant not found', 404);

    await merchantRepository.deactivateUsersForMerchant(id);
    return merchant;
  }

  async approveMerchant(id, approvedByUserId) {
    const merchant = await merchantRepository.findById(id);
    if (!merchant) throw new AppError('Merchant not found', 404);
    if (merchant.status !== 'pending')
      throw new AppError('Only pending merchants can be approved', 400);

    return await merchantRepository.updateById(id, {
      status: 'approved',
      approvedBy: approvedByUserId,
      isActive: true,
    });
  }

  async suspendMerchant(id, reason) {
    const merchant = await merchantRepository.updateById(id, {
      status: 'suspended',
      isActive: false,
      suspendedReason: reason || 'No reason provided',
      suspendedAt: new Date(),
    });
    if (!merchant) throw new AppError('Merchant not found', 404);
    return merchant;
  }

  async activateMerchant(id) {
    const merchant = await merchantRepository.updateById(id, {
      status: 'approved',
      isActive: true,
      suspendedReason: null,
      suspendedAt: null,
    });
    if (!merchant) throw new AppError('Merchant not found', 404);
    return merchant;
  }

  async getMerchantStats(id) {
    const stats = await merchantRepository.getStats(mongoose.Types.ObjectId(id));
    if (!stats.length) throw new AppError('Merchant not found', 404);
    return stats[0];
  }

  async updateSubscription(id, plan) {
    const valid = ['free', 'basic', 'pro', 'enterprise', 'feature', 'trial'];
    if (!valid.includes(plan)) throw new AppError('Invalid plan', 400);

    const merchant = await merchantRepository.updateById(id, {
      subscriptionPlan: plan,
      updatedAt: new Date(),
    });
    if (!merchant) throw new AppError('Merchant not found', 404);
    return merchant;
  }
}

module.exports = new MerchantService();
