function getMerchantId(req) {
  return req.ctx?.merchantId ?? req.merchantId ?? req.user?.merchant?._id ?? req.user?.merchant;
}

function getBranchId(req) {
  return req.ctx?.branchId ?? req.branchId ?? req.user?.branch;
}

function getCustomerId(req) {
  return req.ctx?.customerId ?? req.customerId;
}

function merchantScopedQuery(query, req) {
  const merchantId = getMerchantId(req);
  if (!merchantId) {
    throw new Error('merchantId is required for tenant-scoped query');
  }
  return { ...query, merchant: merchantId };
}

function branchScopedQuery(query, req) {
  const base = merchantScopedQuery(query, req);
  const branchId = getBranchId(req);
  if (branchId) {
    const id = Array.isArray(branchId) ? branchId[0] : branchId;
    return { ...base, branch: id?._id ?? id };
  }
  return base;
}

/** Platform super-admin — cross-merchant operations only when explicitly allowed */
function isSuperAdmin(user) {
  return user?.role?.name === 'SUPER-ADMIN' || user?.role?.isSystemRole === true;
}

/**
 * Resolve a single branch id for staff (user.branch is an array).
 */
function resolveStaffBranchId(req) {
  const branch = getBranchId(req);
  if (!branch) return null;
  if (Array.isArray(branch)) {
    const first = branch[0];
    return first?._id ?? first ?? null;
  }
  return branch._id ?? branch;
}

module.exports = {
  getMerchantId,
  getBranchId,
  getCustomerId,
  merchantScopedQuery,
  branchScopedQuery,
  isSuperAdmin,
  resolveStaffBranchId,
};
