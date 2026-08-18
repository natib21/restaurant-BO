/**
 * @file src/common/constants/roles.js
 * @description System role name constants to prevent typos and ensure consistency
 * 
 * IMPORTANT: Always import and use these constants instead of hardcoding role names.
 * This prevents bugs like the MERCHANT_ADMIN vs SUPER-MERCHANT-ADMIN typo that broke signup.
 * 
 * Usage:
 *   const { ROLE_NAMES } = require('./src/common/constants/roles');
 *   const role = await Role.findOne({ name: ROLE_NAMES.SUPER_MERCHANT_ADMIN });
 *   if (user.role.name === ROLE_NAMES.SUPER_ADMIN) { ... }
 */

/**
 * Official system role names as defined in the database
 */
const ROLE_NAMES = {
  /**
   * Platform super-admin role with universal access
   * - isSystemRole: true
   * - Bypasses all task/permission checks
   * - Cross-merchant operations
   */
  SUPER_ADMIN: 'SUPER-ADMIN',

  /**
   * Merchant administrator role with full merchant-scoped access
   * - isSystemRole: false
   * - Has all merchant-scoped tasks (174 tasks)
   * - Cannot access other merchants' data
   * - Assigned during signup
   */
  SUPER_MERCHANT_ADMIN: 'SUPER-MERCHANT-ADMIN',
};

/**
 * Role category strings used in permission checks
 * These are inferred from role names, not stored in DB
 */
const ROLE_CATEGORIES = {
  SUPER_ADMIN: 'superAdmin',
  ADMIN: 'admin',
  KITCHEN: 'kitchen',
  WAITER: 'waiter',
  CUSTOMER: 'customer',
  SYSTEM: 'system',
};

/**
 * Check if a role is a system-level role (bypasses permission checks)
 */
function isSystemRole(role) {
  if (!role) return false;
  return role.isSystemRole === true || role.name === ROLE_NAMES.SUPER_ADMIN;
}

/**
 * Check if a role is a merchant administrator
 */
function isMerchantAdmin(role) {
  if (!role) return false;
  if (isSystemRole(role)) return true; // Super admin can do anything
  return role.name === ROLE_NAMES.SUPER_MERCHANT_ADMIN || 
         (role.name && role.name.toUpperCase().includes('ADMIN'));
}

module.exports = {
  ROLE_NAMES,
  ROLE_CATEGORIES,
  isSystemRole,
  isMerchantAdmin,
};
