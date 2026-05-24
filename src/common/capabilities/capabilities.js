/**
 * Additive capability codes (optional on Role.capabilities[]).
 * Existing task-based RBAC continues to work when capabilities are empty.
 */
const CAPABILITIES = {
  ORDER_CREATE: 'ORDER_CREATE',
  ORDER_UPDATE: 'ORDER_UPDATE',
  MENU_MANAGE: 'MENU_MANAGE',
  TABLE_MANAGE: 'TABLE_MANAGE',
  INVENTORY_VIEW: 'INVENTORY_VIEW',
  BRANCH_MANAGE: 'BRANCH_MANAGE',
  FILE_MANAGE: 'FILE_MANAGE',
};

/** Fallback inference from legacy role names (backward compatible). */
const ROLE_NAME_CAPABILITY_MAP = [
  { pattern: /KITCHEN/i, capabilities: [CAPABILITIES.ORDER_UPDATE, CAPABILITIES.INVENTORY_VIEW] },
  { pattern: /WAITER/i, capabilities: [CAPABILITIES.ORDER_CREATE, CAPABILITIES.ORDER_UPDATE, CAPABILITIES.TABLE_MANAGE] },
  { pattern: /ADMIN/i, capabilities: Object.values(CAPABILITIES) },
];

function inferCapabilitiesFromRoleName(roleName) {
  if (!roleName) return [];
  if (roleName === 'SUPER-ADMIN') return Object.values(CAPABILITIES);
  const caps = new Set();
  for (const entry of ROLE_NAME_CAPABILITY_MAP) {
    if (entry.pattern.test(roleName)) {
      entry.capabilities.forEach(c => caps.add(c));
    }
  }
  return [...caps];
}

function resolveUserCapabilities(user) {
  const explicit = user?.role?.capabilities;
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit;
  }
  return inferCapabilitiesFromRoleName(user?.role?.name);
}

function userHasCapability(user, capability) {
  if (user?.role?.isSystemRole || user?.role?.name === 'SUPER-ADMIN') {
    return true;
  }
  return resolveUserCapabilities(user).includes(capability);
}

module.exports = {
  CAPABILITIES,
  inferCapabilitiesFromRoleName,
  resolveUserCapabilities,
  userHasCapability,
};
