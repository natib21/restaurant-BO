import type { Request } from 'express';
import type { Types } from 'mongoose';

type ObjectIdLike = Types.ObjectId | string;

/**
 * Unified tenant resolution for staff JWT, table session, and legacy req fields.
 */
export function getMerchantId(req: Request): ObjectIdLike | undefined {
  return (
    req.ctx?.merchantId ??
    req.merchantId ??
    (req.user as { merchant?: { _id?: ObjectIdLike } })?.merchant?._id ??
    (req.user as { merchant?: ObjectIdLike })?.merchant
  );
}

export function getBranchId(req: Request): ObjectIdLike | undefined {
  return (
    req.ctx?.branchId ??
    req.branchId ??
    (req.user as { branch?: { _id?: ObjectIdLike } | ObjectIdLike[] })?.branch
  );
}

export function getCustomerId(req: Request): ObjectIdLike | undefined {
  return req.ctx?.customerId ?? req.customerId;
}

export function merchantScopedQuery<T extends Record<string, unknown>>(
  query: T,
  req: Request
): T & { merchant: ObjectIdLike } {
  const merchantId = getMerchantId(req);
  if (!merchantId) {
    throw new Error('merchantId is required for tenant-scoped query');
  }
  return { ...query, merchant: merchantId };
}

export function branchScopedQuery<T extends Record<string, unknown>>(
  query: T,
  req: Request
): T & { merchant: ObjectIdLike; branch?: ObjectIdLike } {
  const base = merchantScopedQuery(query, req);
  const branchId = getBranchId(req);
  if (branchId) {
    const id = Array.isArray(branchId) ? branchId[0] : branchId;
    return { ...base, branch: (id as { _id?: ObjectIdLike })?._id ?? id };
  }
  return base;
}
