import type { Types } from 'mongoose';

export type ActorType = 'staff' | 'customer' | 'anonymous' | 'system';

export interface RequestContext {
  requestId: string;
  requestTime: string;
  actorType: ActorType;
  actorId?: Types.ObjectId | string;
  merchantId?: Types.ObjectId | string;
  branchId?: Types.ObjectId | string;
  customerId?: Types.ObjectId | string;
  tableId?: Types.ObjectId | string;
  sessionToken?: string;
  permissions?: string[];
}

declare global {
  namespace Express {
    interface Request {
      ctx: RequestContext;
      user?: {
        _id?: unknown;
        id?: unknown;
        merchant?: { _id?: unknown } | unknown;
        role?: { tasks?: Array<{ name?: string }> } | unknown;
        isActive?: boolean;
        branch?: unknown;
        [key: string]: unknown;
      };
      /** @deprecated Use req.ctx.merchantId */
      merchantId?: Types.ObjectId | string;
      /** @deprecated Use req.ctx.branchId */
      branchId?: Types.ObjectId | string;
      /** @deprecated Use req.ctx.customerId */
      customerId?: Types.ObjectId | string;
      /** @deprecated Use req.ctx.tableId */
      tableId?: Types.ObjectId | string;
      tableSession?: unknown;
      requestId?: string;
      requestTime?: string;
    }
  }
}

export {};
