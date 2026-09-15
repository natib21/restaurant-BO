/**
 * @file src/modules/branch/service/BranchUserAssignmentService.js
 * @description Service for manually assigning/unassigning branches to users
 * Handles branch-user relationships with validation and permission checks
 */

const User = require('../../../../models/userModel');
const Branch = require('../../../../models/branchModel');
const AppError = require('../../../common/errors');

class BranchUserAssignmentService {
  /**
   * Assign one or more branches to a user
   * @param {string} targetUserId - The user to assign branches to
   * @param {string|string[]} branchIds - Single branch ID or array of branch IDs
   * @param {Object} req - Express request object (for auth context)
   * @returns {Object} Updated user with assigned branches
   */
  static async assignBranchesToUser(targetUserId, branchIds, req) {
    const actingUserId = req.user._id.toString();
    const merchantId = req.user.merchant._id.toString();

    // Ensure branchIds is an array
    const normalizedBranchIds = Array.isArray(branchIds) ? branchIds : [branchIds];

    if (normalizedBranchIds.length === 0) {
      throw new AppError('No branches provided for assignment', 400);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 1. Validate target user exists and belongs to same merchant
    // ─────────────────────────────────────────────────────────────────────
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      throw new AppError('Target user not found', 404);
    }

    if (targetUser.merchant.toString() !== merchantId) {
      throw new AppError('Cannot assign branches: target user belongs to a different merchant', 403);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. Validate all branches exist and belong to the same merchant
    // ─────────────────────────────────────────────────────────────────────
    const branches = await Branch.find({
      _id: { $in: normalizedBranchIds },
      merchant: merchantId,
    });

    if (branches.length !== normalizedBranchIds.length) {
      throw new AppError(
        'One or more branches are invalid or do not belong to your merchant',
        400
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. Assign branches using $addToSet (atomic, prevents duplicates)
    // ─────────────────────────────────────────────────────────────────────
    const updated = await User.findByIdAndUpdate(
      targetUserId,
      {
        $addToSet: {
          branch: { $each: normalizedBranchIds },
        },
      },
      { new: true }
    )
      .populate({
        path: 'branch',
        select: 'name branchCode isMain isActive',
      })
      .select('firstName lastName phone email branch isActive');

    // ─────────────────────────────────────────────────────────────────────
    // 4. Include refresh hint if target user's branch changed
    // This signals to the frontend/admin that the user may need to re-login
    // ─────────────────────────────────────────────────────────────────────
    const result = updated.toObject ? updated.toObject() : updated;
    result.refreshHint = true;
    result.message = `Assigned ${normalizedBranchIds.length} branch(es) to user ${targetUser.firstName}`;

    return result;
  }

  /**
   * Remove one or more branches from a user
   * @param {string} targetUserId - The user to remove branches from
   * @param {string|string[]} branchIds - Single branch ID or array of branch IDs to remove
   * @param {Object} req - Express request object (for auth context)
   * @returns {Object} Updated user with remaining branches
   */
  static async unassignBranchesFromUser(targetUserId, branchIds, req) {
    const merchantId = req.user.merchant._id.toString();

    // Ensure branchIds is an array
    const normalizedBranchIds = Array.isArray(branchIds) ? branchIds : [branchIds];

    if (normalizedBranchIds.length === 0) {
      throw new AppError('No branches provided for removal', 400);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 1. Validate target user exists and belongs to same merchant
    // ─────────────────────────────────────────────────────────────────────
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      throw new AppError('Target user not found', 404);
    }

    if (targetUser.merchant.toString() !== merchantId) {
      throw new AppError('Cannot unassign branches: target user belongs to a different merchant', 403);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. Validate all branches exist and belong to the same merchant
    // ─────────────────────────────────────────────────────────────────────
    const branches = await Branch.find({
      _id: { $in: normalizedBranchIds },
      merchant: merchantId,
    });

    if (branches.length !== normalizedBranchIds.length) {
      throw new AppError(
        'One or more branches are invalid or do not belong to your merchant',
        400
      );
    }

    // Prevent removing all branches — keep at least one
    const remainingBranches = targetUser.branch.filter(
      b => !normalizedBranchIds.includes(b.toString())
    );

    if (remainingBranches.length === 0) {
      throw new AppError(
        'Cannot remove all branches from a user. A user must have access to at least one branch.',
        400
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. Remove branches using $pull (atomic)
    // ─────────────────────────────────────────────────────────────────────
    const updated = await User.findByIdAndUpdate(
      targetUserId,
      {
        $pull: {
          branch: { $in: normalizedBranchIds },
        },
      },
      { new: true }
    )
      .populate({
        path: 'branch',
        select: 'name branchCode isMain isActive',
      })
      .select('firstName lastName phone email branch isActive');

    const result = updated.toObject ? updated.toObject() : updated;
    result.refreshHint = true;
    result.message = `Removed ${normalizedBranchIds.length} branch(es) from user ${targetUser.firstName}`;

    return result;
  }

  /**
   * Get all branches for a user
   * @param {string} userId - The user ID
   * @param {Object} req - Express request object (for merchant context)
   * @returns {Object} User with populated branches
   */
  static async getUserBranches(userId, req) {
    const merchantId = req.user.merchant._id.toString();

    const user = await User.findById(userId).populate({
      path: 'branch',
      select: 'name branchCode isMain isActive',
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (user.merchant.toString() !== merchantId) {
      throw new AppError('Cannot access user: belongs to a different merchant', 403);
    }

    const result = user.toObject ? user.toObject() : user;
    return {
      firstName: result.firstName,
      lastName: result.lastName,
      phone: result.phone,
      email: result.email,
      branches: result.branch || [],
      totalBranches: (result.branch || []).length,
    };
  }
}

module.exports = { BranchUserAssignmentService };
