import { v4 as uuidv4 } from 'uuid';
import type { Request, Response, NextFunction } from 'express';
import type { RequestContext, ActorType } from '../types/request-context';

function resolveActorType(req: Request): ActorType {
  if (req.user) return 'staff';
  if (req.customerId || req.ctx?.customerId) return 'customer';
  if (req.tableSession || req.merchantId) return 'anonymous';
  return 'system';
}

export function initRequestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = uuidv4().slice(0, 8);
  const requestTime = new Date().toISOString();

  const ctx: RequestContext = {
    requestId,
    requestTime,
    actorType: 'system',
  };

  req.ctx = ctx;
  req.requestId = requestId;
  req.requestTime = requestTime;
  res.locals.requestId = requestId;

  next();
}

/** Sync legacy fields and log metadata after auth middleware runs */
export function syncRequestContext(req: Request, res: Response, next: NextFunction): void {
  const actorType = resolveActorType(req);

  req.ctx.actorType = actorType;
  req.ctx.merchantId = req.ctx.merchantId ?? req.merchantId;
  req.ctx.branchId = req.ctx.branchId ?? req.branchId;
  req.ctx.customerId = req.ctx.customerId ?? req.customerId;
  req.ctx.tableId = req.ctx.tableId ?? req.tableId;

  if (req.user) {
    const user = req.user as {
      _id?: unknown;
      merchant?: { _id?: unknown };
      role?: { tasks?: Array<{ name?: string }> };
    };
    req.ctx.actorId = user._id as RequestContext['actorId'];
    req.ctx.merchantId = req.ctx.merchantId ?? (user.merchant?._id as RequestContext['merchantId']);
    res.locals.userId = String(user._id);
    res.locals.merchantId = user.merchant?._id ? String(user.merchant._id) : '-';
  } else if (req.ctx.merchantId) {
    res.locals.merchantId = String(req.ctx.merchantId);
  }

  if (req.ctx.branchId) {
    res.locals.branchId = String(req.ctx.branchId);
  }

  next();
}
