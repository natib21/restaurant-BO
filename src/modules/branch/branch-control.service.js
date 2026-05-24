const Branch = require('../../../models/branchModel');
const User = require('../../../models/userModel');
const MenuGroup = require('../../../models/menuGroupModel');
const AppError = require('../../../utils/appError');
const logger = require('../../../utils/logger');

const DEFAULT_FEATURES = {
  dineIn: true,
  takeaway: true,
  delivery: false,
  inventory: true,
  qrOrdering: true,
};

class BranchControlService {
  static async getBranch(merchantId, branchId) {
    const branch = await Branch.findOne({ _id: branchId, merchant: merchantId });
    if (!branch) throw new AppError('Branch not found', 404);
    return branch;
  }

  static async suspendBranch(merchantId, branchId) {
    const branch = await BranchControlService.getBranch(merchantId, branchId);
    branch.isActive = false;
    await branch.save();
    logger.info('branch.suspended', { branchId: String(branchId), merchantId: String(merchantId) });
    return branch;
  }

  static async activateBranch(merchantId, branchId) {
    const branch = await BranchControlService.getBranch(merchantId, branchId);
    branch.isActive = true;
    await branch.save();
    logger.info('branch.activated', { branchId: String(branchId), merchantId: String(merchantId) });
    return branch;
  }

  static getFeatureFlags(branch) {
    return {
      ...DEFAULT_FEATURES,
      ...(branch.settings?.features || {}),
    };
  }

  static async setFeatureFlags(merchantId, branchId, features) {
    const branch = await BranchControlService.getBranch(merchantId, branchId);
    branch.settings = branch.settings || {};
    branch.settings.features = {
      ...BranchControlService.getFeatureFlags(branch),
      ...features,
    };
    await branch.save();
    return branch;
  }

  static async assignMenuGroupToBranch(merchantId, menuGroupId, branchId) {
    const branch = await BranchControlService.getBranch(merchantId, branchId);
    const group = await MenuGroup.findOne({ _id: menuGroupId, merchant: merchantId });
    if (!group) throw new AppError('Menu group not found', 404);

    const branchIds = (group.branches || []).map(b => b.toString());
    if (!branchIds.includes(branch._id.toString())) {
      group.branches.push(branch._id);
      await group.save();
    }

    return { branch, menuGroup: group };
  }

  static async listStaffForBranch(merchantId, branchId) {
    await BranchControlService.getBranch(merchantId, branchId);
    return User.find({
      merchant: merchantId,
      branch: branchId,
      isActive: true,
    })
      .populate('role', 'name capabilities')
      .select('fullName email role branch')
      .lean();
  }

  /**
   * Enforce staff user may only operate on assigned branch(es).
   */
  static assertBranchAccess(user, branchId) {
    if (!user || !branchId) return;
    if (user.role?.name === 'SUPER-ADMIN' || user.role?.isSystemRole) return;

    const branches = user.branch;
    if (!branches) {
      throw new AppError('Branch context is required', 403);
    }

    const allowed = Array.isArray(branches)
      ? branches.map(b => (b._id || b).toString())
      : [branches.toString()];

    if (!allowed.includes(branchId.toString())) {
      throw new AppError('You do not have access to this branch', 403);
    }
  }

  static assertBranchActive(branch) {
    if (!branch.isActive) {
      throw new AppError('Branch is suspended', 403);
    }
  }
}

module.exports = { BranchControlService };
