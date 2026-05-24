import type { Request } from 'express';
import { getMerchantId, merchantScopedQuery } from '../../common/utils/tenant-scope';

const AppError = require('../../../utils/appError');
const MenuItem = require('../../../models/menuModel');

export interface OrderLineInput {
  menuItemId: string;
  quantity?: number;
  notes?: string;
}

export class OrderService {
  static merchantScopedQuery<T extends Record<string, unknown>>(query: T, req: Request) {
    return merchantScopedQuery(query, req);
  }

  static getMerchantId(req: Request) {
    const id = getMerchantId(req);
    if (!id) throw new AppError('Merchant context is required', 401);
    return id;
  }

  static async buildOrderItems(items: OrderLineInput[], merchantId: unknown) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('Order must contain at least one item', 400);
    }

    let subtotal = 0;
    const orderItems: Array<{
      menuItem: unknown;
      name: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      notes: string;
    }> = [];

    for (const item of items) {
      if (!item.menuItemId) {
        throw new AppError('Each item must have "menuItemId" field (ObjectId)', 400);
      }

      const menuItem = await MenuItem.findOne({
        _id: item.menuItemId,
        merchant: merchantId,
        available: true,
      });

      if (!menuItem) {
        throw new AppError('Menu item not found or unavailable', 400);
      }

      const quantity = Number(item.quantity) || 1;
      if (quantity < 1) throw new AppError('Quantity must be at least 1', 400);

      const unitPrice = menuItem.price;
      const totalPrice = quantity * unitPrice;

      orderItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        quantity,
        unitPrice,
        totalPrice,
        notes: item.notes || '',
      });

      subtotal += totalPrice;
    }

    return { orderItems, subtotal };
  }
}

module.exports = { OrderService };
