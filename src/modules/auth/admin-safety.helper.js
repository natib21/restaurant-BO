/**
 * @file src/modules/auth/admin-safety.helper.js
 * @description Shared safety checks for admin role operations.
 * 
 * Prevents accidental lockout by:
 * - Blocking removal of the last SUPER-MERCHANT-ADMIN from a merchant
 * - Blocking escalation to SUPER-MERCHANT-ADMIN via role change
 */

const User = require('../../../models/userModel');
const Role = require('../../../models/roleModel');
const AppError = require('../../../utils/appError');

/**
 * Check if a user is the last active SUPER-MERCHANT-ADMIN for their merchant.
 * 
 * Used by:
 * - changeUserRole: to prevent removing the last admin
 * - deleteMerchantUser: to prevent deactivating the last admin
 * 
 * @param {ObjectId} userId - The user ID to check
 * @param {ObjectId} merchantId - The merchant ID context
 * @param {ClientSession} session - MongoDB session (optional, for transactional queries)
 * @returns {Promise<boolean>} true if user is the last active SUPER-MERCHANT-ADMIN, false otherwise
 * @throws {AppError} If query fails
 */
async function isLastActiveSuperAdmin(userId, merchantId, session = null) {
  const user = await User.findById(userId).session(session);
  if (!user) return false;

  // Get the user's current role
  const userRole = await Role.findById(user.role).session(session);
  if (!userRole || userRole.name !== 'SUPER-MERCHANT-ADMIN') {
    return false; // User doesn't have SUPER-MERCHANT-ADMIN role
  }

  // Count other active users with SUPER-MERCHANT-ADMIN role in this merchant
  const otherAdminCount = await User.countDocuments({
    _id: { $ne: userId },
    merchant: merchantId,
    role: user.role, // Same SUPER-MERCHANT-ADMIN role
    isActive: true,
  }).session(session);

  return otherAdminCount === 0;
}

/**
 * Assert that a user is NOT the last active SUPER-MERCHANT-ADMIN.
 * Throws an error if they are.
 * 
 * @param {ObjectId} userId - The user ID to check
 * @param {ObjectId} merchantId - The merchant ID context
 * @param {ClientSession} session - MongoDB session (optional)
 * @param {string} actionDescription - Description of the action being attempted (e.g., "deactivate" or "change role for")
 * @throws {AppError} If user is the last active SUPER-MERCHANT-ADMIN
 */
async function guardAgainstRemovingLastAdmin(userId, merchantId, session = null, actionDescription = 'modify') {
  const isLast = await isLastActiveSuperAdmin(userId, merchantId, session);
  if (isLast) {
    throw new AppError(
      `Cannot ${actionDescription} the last SUPER-MERCHANT-ADMIN from this merchant. ` +
      'Assign the owner role to another user first.',
      400
    );
  }
}

module.exports = {
  isLastActiveSuperAdmin,
  guardAgainstRemovingLastAdmin,
};
