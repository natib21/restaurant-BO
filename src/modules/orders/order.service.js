const AppError = require('../../../utils/appError');
const Order = require('../../../models/orderModel');
const MenuItem = require('../../../models/menuModel');
const { merchantScopedQuery, getMerchantId } = require('../../common/utils/tenant-scope');
const { MenuManagementService } = require('../menu/menu-management.service');

const { OrderStateMachineService } = require('./order-state-machine.service');

class OrderService {
  static VALID_TRANSITIONS = OrderStateMachineService.TRANSITIONS;

  static formatElapsed(date) {
    const mins = Math.floor((Date.now() - new Date(date)) / 60000);
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60}m`;
  }

  static getUrgency(date) {
    const mins = Math.floor((Date.now() - new Date(date)) / 60000);
    if (mins > 25) return 'high';
    if (mins > 15) return 'medium';
    return 'low';
  }

  static calculateSummary(orders) {
    return {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((s, o) => s + o.totalAmount, 0),
      avgOrderValue: orders.length
        ? Math.round(orders.reduce((s, o) => s + o.totalAmount, 0) / orders.length)
        : 0,
    };
  }

  static assertValidTransition(currentStatus, newStatus) {
    OrderStateMachineService.validateTransition(currentStatus, newStatus);
  }

  static async getOrdersByStatus(req, statusArray, extraFilter = {}) {
    const merchantId = getMerchantId(req);
    if (!merchantId) throw new AppError('Merchant context is required', 401);

    const orders = await Order.find({
      merchant: merchantId,
      status: { $in: statusArray },
      ...extraFilter,
    })
      .populate('table', 'tableNumber')
      .populate('assignedWaiter', 'fullName')
      .populate('assignedKitchenStaff', 'fullName')
      .select(
        'orderNumber status tableNumber totalAmount placedAt readyAt items assignedWaiter assignedKitchenStaff'
      )
      .sort({ placedAt: 1 })
      .lean();

    return orders.map(order => ({
      ...order,
      itemCount: order.items.reduce((s, i) => s + i.quantity, 0),
      elapsed: OrderService.formatElapsed(order.placedAt),
      urgency: OrderService.getUrgency(order.placedAt),
    }));
  }
  static merchantScopedQuery(query, req) {
    return merchantScopedQuery(query, req);
  }

  static getMerchantId(req) {
    const id = getMerchantId(req);
    if (!id) throw new AppError('Merchant context is required', 401);
    return id;
  }

  static async buildOrderItems(items, merchantId) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('Order must contain at least one item', 400);
    }

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      if (!item.menuItemId) {
        throw new AppError('Each item must have "menuItemId" field (ObjectId)', 400);
      }

      const menuItem = await MenuItem.findOne({
        _id: item.menuItemId,
        ...MenuManagementService.buildOrderableMenuFilter(merchantId),
      });

      MenuManagementService.assertMenuItemOrderable(menuItem);

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
