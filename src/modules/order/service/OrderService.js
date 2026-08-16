const mongoose = require('mongoose');
const AppError = require('../../../../utils/appError');
const MenuItem = require('../../../../models/menuModel');
const Ingredient = require('../../../../models/Ingredient');
const Table = require('../../../../models/tabelModel');
const CustomerSession = require('../../../../models/customerSessionModule');
const ApiFeatures = require('../../../../utils/apiFeatures');
const {
  merchantScopedQuery,
  getMerchantId,
  getBranchId,
} = require('../../../common/utils/tenant-scope');
const { MenuService } = require('../../menu');
const { NotificationService } = require('../../notifications');
const { OrderRepository } = require('../repository/OrderRepository');
const { attachPaymentImage } = require('../dto/order-response.dto');
const {
  assertValidStaffOrderType,
  assertDineInTableId,
} = require('../validators/order.validators');
const { OrderStateMachineService } = require('./OrderStateMachineService');

class OrderService {
  static VALID_TRANSITIONS = OrderStateMachineService.TRANSITIONS;
  /**
   * Calculate COGS (Cost of Goods Sold) for a menu item based on its recipe.
   * Returns null if the menu item has no recipe or ingredients aren't tracked.
   * 
   * @param {Object} menuItem - The menu item with populated recipe.ingredients
   * @returns {Promise<Number|null>} - Unit cost or null if not trackable
   */
  static async calculateMenuItemCost(menuItem) {
    // No recipe or ingredients means no COGS tracking
    if (!menuItem.recipe || !menuItem.recipe.ingredients || menuItem.recipe.ingredients.length === 0) {
      return null;
    }

    try {
      // Get all ingredient IDs from the recipe
      const ingredientIds = menuItem.recipe.ingredients.map(ri => ri.ingredient);
      
      // Fetch all ingredients with their current costPerUnit
      const ingredients = await Ingredient.find({
        _id: { $in: ingredientIds },
        isActive: true
      }).select('_id costPerUnit').lean();

      // Create a map for quick lookup
      const ingredientCostMap = new Map(
        ingredients.map(ing => [String(ing._id), ing.costPerUnit])
      );

      // Calculate total cost
      let totalCost = 0;
      let hasAllCosts = true;

      for (const recipeIngredient of menuItem.recipe.ingredients) {
        const ingredientId = String(recipeIngredient.ingredient);
        const costPerUnit = ingredientCostMap.get(ingredientId);

        if (costPerUnit === undefined || costPerUnit === null) {
          // Missing cost data for this ingredient
          hasAllCosts = false;
          break;
        }

        // Add (quantity × costPerUnit) to total
        totalCost += recipeIngredient.quantity * costPerUnit;
      }

      // Return null if we couldn't calculate complete cost
      return hasAllCosts ? totalCost : null;
    } catch (error) {
      // Log error but don't fail order placement
      console.error('Error calculating menu item cost:', error);
      return null;
    }
  }

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

  static assertValidTransition(fromStatus, toStatus) {
    OrderStateMachineService.validateTransition(fromStatus, toStatus);
  }

  static merchantScopedQuery(query, req) {
    return merchantScopedQuery(query, req);
  }

  static getMerchantId(req) {
    const id = getMerchantId(req);
    if (!id) throw new AppError('Merchant context is required', 401);
    return id;
  }

  static async getOrdersByStatus(req, statusArray, extraFilter = {}) {
    const merchantId = OrderService.getMerchantId(req);
    const statusList = Array.isArray(statusArray) ? statusArray : [statusArray];

    const filter = {
      merchant: merchantId,
      status: { $in: statusList },
      ...extraFilter,
    };

    if (req.query?.branchId) {
      filter.branch = req.query.branchId;
    }

    const orders = await OrderRepository.find(filter)
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
        ...MenuService.buildOrderableMenuFilter(merchantId),
      });

      MenuService.assertMenuItemOrderable(menuItem);

      const quantity = Number(item.quantity) || 1;

      if (quantity < 1) {
        throw new AppError('Quantity must be at least 1', 400);
      }

      const unitPrice = menuItem.price;
      const totalPrice = quantity * unitPrice;

      // Calculate COGS (Cost of Goods Sold) per unit
      const unitCost = await OrderService.calculateMenuItemCost(menuItem);

      orderItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        quantity,
        unitPrice,
        unitCost, // Will be null if no recipe or ingredient costs unavailable
        totalPrice,
        notes: item.notes || '',
      });

      subtotal += totalPrice;
    }

    return {
      orderItems,
      subtotal,
    };
  }

  static async staffPlaceOrder(data, req) {
    const {
      items,
      tableId,
      orderType,
      customerName,
      customerPhone,
      subtotal,
      notes,
      branchId,
      location,
      performedBy,
      performedByName,
      merchantId,
    } = data;

    assertValidStaffOrderType(orderType);
    assertDineInTableId(orderType, tableId);

    let tableNumber = null;
    if (orderType === 'dine_in') {
      const table = await Table.findOne({ branch: branchId, _id: tableId });
      if (!table) throw new AppError('Table not found', 404);
      tableNumber = table.tableNumber;
    }

    const totalAmount = subtotal;
    const enrichedItems = items.map(item => {
      const unitPrice = item.unitPrice || 0;
      return {
        menuItem: item.menuItemId,
        quantity: item.quantity,
        unitPrice,
        totalPrice: unitPrice * item.quantity,
        notes: item.notes || '',
      };
    });
    const order = OrderRepository.newOrder({
      merchant: merchantId,
      branch: branchId,
      customerName: customerName || 'Walk-in Customer',
      customerPhone: customerPhone || null,
      table: orderType === 'dine_in' ? tableId : null,
      tableNumber: orderType === 'dine_in' ? tableNumber : null,
      orderType,
      items: enrichedItems,
      subtotal,
      totalAmount,
      paymentStatus: 'unpaid',
      status: 'pending',
      notes: notes || '',
      location,
      placedBy: performedBy,
    });
    await order.save();

    if (orderType === 'dine_in') {
      await Table.findByIdAndUpdate(tableId, { status: 'occupied' });
    }

    await NotificationService.notifyStaffOrderPlaced({
      order,
      branchId,
      merchantId: order.merchant,
      tableNumber,
      placedByName: performedByName,
    });

    return order;
  }

  static async getMyActiveOrder(req) {
    const order = await OrderRepository.findOne(
      merchantScopedQuery(
        {
          customer: req.customerId,
          table: req.tableId,
          status: { $in: ['pending', 'accepted', 'preparing', 'ready', 'served'] },
        },
        req
      )
    )
      .populate('items.menuItem', 'name image')
      .sort('-placedAt');

    if (!order) {
      return null;
    }

    return attachPaymentImage(order, req);
  }

  static async getActiveOrders(req) {
    const { branchId, status } = req.query || {};
    const statusList = status ? [status] : ['pending', 'accepted', 'preparing', 'ready'];

    const query = { status: statusList };
    if (branchId) {
      query.branch = branchId;
    }

    const orders = await OrderRepository.find(merchantScopedQuery(query, req))
      .populate('table', 'tableNumber')
      .populate('items.menuItem', 'name')
      .populate('branch', 'name')
      .sort({ placedAt: 1 });

    return orders.map(order => attachPaymentImage(order, req));
  }

  static async updateOrderStatus(req) {
    const { id } = req.params;
    const { status, assignedWaiter, assignedKitchenStaff, reason } = req.body;

    if (!status) {
      throw new AppError('Status is required', 400);
    }

    const result = await OrderStateMachineService.transitionOrderStatus({
      orderId: id,
      toStatus: status,
      merchantQuery: merchantScopedQuery({}, req),
      user: req.user,
      reason,
      assignedWaiter,
      assignedKitchenStaff,
    });

    return result;
  }

  static async markAsPaid(req) {
    const { id } = req.params;
    const { paymentMethod, bankName, image } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const order = await OrderRepository.findOne(merchantScopedQuery({ _id: id }, req)).session(
        session
      );

      if (!order) {
        await session.abortTransaction();
        throw new AppError('Order not found', 404);
      }

      if (order.paymentStatus === 'paid') {
        await session.abortTransaction();
        throw new AppError('Order already paid', 400);
      }

      order.paymentStatus = 'paid';
      order.paidAt = new Date();

      order.paymentDetails = {
        method: paymentMethod || 'cash',
        bankName: bankName || null,
        paidAt: new Date(),
        receiptImage: image || null,
      };

      await order.save({ session });

      const wasCompleted = order.status === 'completed';

      if (!wasCompleted) {
        order.status = 'completed';
        order.completedAt = new Date();

        await order.save({ session });
      }

      if (req.customer) {
        const points = Math.floor(order.totalAmount);

        req.customer.loyalty.points += points;
        req.customer.loyalty.totalPointsEarned += points;

        const tiers = {
          bronze: 0,
          silver: 5000,
          gold: 20000,
          platinum: 50000,
        };

        const newTier = Object.keys(tiers)
          .reverse()
          .find(tier => req.customer.loyalty.totalPointsEarned >= tiers[tier]);

        if (newTier && newTier !== req.customer.loyalty.tier) {
          req.customer.loyalty.tier = newTier;
        }

        req.customer.history.push({
          action: 'award_points',
          details: `Earned ${points} points from order ${order.orderNumber} (${paymentMethod})`,
          order: order._id,
          addedAt: new Date(),
        });

        await req.customer.save({
          session,
          validateBeforeSave: false,
        });
      }

      if (order.table) {
        await CustomerSession.updateOne(
          merchantScopedQuery(
            {
              tableId: order.table,
              isActive: true,
            },
            req
          ),
          { isActive: false },
          { session }
        );

        const table = await Table.findOne(merchantScopedQuery({ _id: order.table }, req)).session(
          session
        );

        if (table) {
          table.status = 'available';
          await table.save({ session });
        }
      }

      await NotificationService.notifyOrderPaid(
        {
          order,
          paymentMethod,
          bankName,
          image,
        },
        session
      );

      await session.commitTransaction();

      return order;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  static async getMyOrderHistory(req) {
    const orders = await OrderRepository.find(
      merchantScopedQuery(
        {
          customer: req.customerId,
          status: ['completed', 'canceled'],
        },
        req
      )
    )
      .select('orderNumber items totalAmount status placedAt')
      .sort('-placedAt')
      .limit(50);

    return orders.map(order => attachPaymentImage(order, req));
  }

  static async getOrderByNumber(req) {
    const { orderNumber } = req.params;

    if (!orderNumber) {
      throw new AppError('Order number is required', 400);
    }

    const cleanNumber = orderNumber.trim().toUpperCase().replace(/^#/, '#');
    const baseQuery = merchantScopedQuery({ orderNumber: cleanNumber }, req);

    let query = OrderRepository.findOne(baseQuery);

    if (req.user || req.isStaff) {
      query = query.select('+isDeleted');
    } else if (req.customerId) {
      query = query.and({ customer: req.customerId });
    } else if (req.tableId) {
      query = query.and({ table: req.tableId });
    } else {
      throw new AppError('Unauthorized', 401);
    }

    const order = await query
      .populate('table', 'tableNumber status')
      .populate('items.menuItem', 'name image')
      .populate('assignedWaiter', 'fullName')
      .populate('assignedKitchenStaff', 'fullName')
      .lean();

    if (!order) {
      throw new AppError('Order not found or access denied', 404);
    }

    if (!req.user && !req.isStaff) {
      delete order.assignedWaiter;
      delete order.assignedKitchenStaff;
    }

    return order;
  }

  static async getAllOrders(req) {
    let queryObj = { merchant: OrderService.getMerchantId(req) };

    const { tableNumber, customerPhone, dateFrom, dateTo, search } = req.query;

    if (tableNumber) queryObj.tableNumber = { $regex: tableNumber, $options: 'i' };

    if (customerPhone) {
      queryObj.customerPhone = { $regex: customerPhone.trim(), $options: 'i' };
    }

    if (dateFrom || dateTo) {
      queryObj.placedAt = {};
      if (dateFrom) queryObj.placedAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        queryObj.placedAt.$lte = end;
      }
    }

    if (search) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      queryObj.$or = [{ orderNumber: searchRegex }, { customerName: searchRegex }];
    }

    const features = new ApiFeatures(OrderRepository.getOrderModel().find(queryObj), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const total = await OrderRepository.countDocuments(queryObj);

    const orders = await features.query
      .populate('table', 'tableNumber status')
      .populate('customer', 'fullName phone')
      .populate('assignedWaiter', 'fullName')
      .populate('assignedKitchenStaff', 'fullName')
      .lean();

    const ordersWithSummary = orders.map(order => {
      const withImage = attachPaymentImage(order, req);
      return {
        ...withImage,
        itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
      };
    });

    const stats = await OrderRepository.aggregate([
      { $match: queryObj },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalOrders: { $sum: 1 },
          paidOrders: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] },
          },
          avgOrderValue: { $avg: '$totalAmount' },
        },
      },
    ]);

    const summary = stats[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      paidOrders: 0,
      avgOrderValue: 0,
    };

    return {
      total,
      page: req.query.page * 1 || 1,
      pages: Math.ceil(total / (req.query.limit * 1 || 40)),
      summary: {
        totalRevenue: summary.totalRevenue,
        totalOrders: summary.totalOrders,
        paidOrders: summary.paidOrders,
        avgOrderValue: Math.round(summary.avgOrderValue || 0),
      },
      orders: ordersWithSummary,
    };
  }

  static async getCompletedOrders(req) {
    const merchantId = OrderService.getMerchantId(req);

    let queryObj = { merchant: merchantId, status: 'completed', paymentStatus: 'paid' };

    const {
      branchId,
      dateFrom,
      dateTo,
      search,
      page = 1,
      limit = 20,
      sort = '-placedAt',
    } = req.query;

    if (branchId) queryObj.branch = branchId;

    if (dateFrom || dateTo) {
      queryObj.placedAt = {};
      if (dateFrom) queryObj.placedAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        queryObj.placedAt.$lte = end;
      }
    }

    if (search) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      queryObj.$or = [
        { orderNumber: searchRegex },
        { customerName: searchRegex },
        { customerPhone: searchRegex },
      ];
    }

    const total = await OrderRepository.countDocuments(queryObj);

    const orders = await OrderRepository.find(queryObj)
      .populate('branch', 'name')
      .populate('table', 'tableNumber')
      .populate('customer', 'fullName phone')
      .populate('assignedWaiter', 'fullName')
      .populate('assignedKitchenStaff', 'fullName')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const totalRevenue = orders.reduce((s, o) => s + o.totalAmount, 0);

    return {
      total,
      page: page * 1,
      pages: Math.ceil(total / (limit * 1 || 20)),
      summary: {
        totalRevenue,
        totalOrders: orders.length,
        avgOrderValue: orders.length ? Math.round(totalRevenue / orders.length) : 0,
      },
      orders,
    };
  }

  static async mergeOrders(req) {
    const { orderIds, targetOrderId } = req.body;
    if (!orderIds || orderIds.length < 1) {
      throw new AppError('Must provide orders to merge', 400);
    }

    const targetOrder = await OrderRepository.findOne(
      merchantScopedQuery({ _id: targetOrderId, status: { $ne: 'completed' } }, req)
    );
    if (!targetOrder) throw new AppError('Target order not found or completed', 404);

    const sourceOrders = await OrderRepository.find(
      merchantScopedQuery({ _id: { $in: orderIds }, status: { $ne: 'completed' } }, req)
    );

    if (sourceOrders.length !== orderIds.length) {
      throw new AppError('One or more source orders not found or completed', 404);
    }

    let subtotalIncrease = 0;

    for (const sourceOrder of sourceOrders) {
      targetOrder.items.push(...sourceOrder.items);
      subtotalIncrease += sourceOrder.subtotal;

      targetOrder.notes = targetOrder.notes || '';
      targetOrder.notes += ` | MERGED FROM ${sourceOrder.orderNumber}`;

      sourceOrder.status = 'canceled';
      sourceOrder.paymentStatus = 'paid';
      sourceOrder.canceledReason = 'Merged into another order';
      await sourceOrder.save({ validateBeforeSave: false });

      await CustomerSession.updateOne(
        merchantScopedQuery({ tableId: sourceOrder.table, isActive: true }, req),
        { isActive: false }
      );

      const table = await Table.findOne(merchantScopedQuery({ _id: sourceOrder.table }, req));
      if (table) {
        table.status = 'available';
        await table.save({ validateBeforeSave: false });
      }
    }

    targetOrder.subtotal += subtotalIncrease;
    targetOrder.totalAmount = targetOrder.subtotal;
    await targetOrder.save();

    return targetOrder;
  }

  static async cancelOrder(req) {
    const { orderId } = req.params;
    const { reason = 'Customer/Staff Cancellation' } = req.body;

    const existing = await OrderRepository.findOne(merchantScopedQuery({ _id: orderId }, req));
    if (!existing) throw new AppError('Order not found', 404);

    if (!req.user && existing.status !== 'pending') {
      throw new AppError('Customers can only cancel orders while they are still pending', 400);
    }

    if (!['pending', 'accepted'].includes(existing.status) && req.user) {
      throw new AppError(`Order cannot be canceled once it is ${existing.status}`, 400);
    }

    if (existing.status === 'canceled') {
      return { order: existing, alreadyCanceled: true };
    }

    if (existing.status === 'completed') {
      throw new AppError('Order is already completed', 400);
    }

    const result = await OrderStateMachineService.transitionOrderStatus({
      orderId,
      toStatus: 'canceled',
      merchantQuery: merchantScopedQuery({}, req),
      user: req.user || null,
      actorType: req.user ? 'staff' : 'customer',
      customerId: req.customerId,
      reason,
    });

    return { order: result.order, alreadyCanceled: false };
  }

  static async addItemToOrder(req) {
    const { orderId } = req.params;
    const { items } = req.body;

    const order = await OrderRepository.findOne(
      merchantScopedQuery(
        { _id: orderId, status: { $in: ['pending', 'accepted', 'preparing'] } },
        req
      )
    );

    if (!order) {
      throw new AppError('Active order not found or cannot be modified', 404);
    }

    const { orderItems: newItems, subtotal: newSubtotal } = await OrderService.buildOrderItems(
      items,
      req.merchant._id
    );

    order.items.push(...newItems);
    order.subtotal += newSubtotal;
    order.totalAmount = order.subtotal;

    if (order.status !== 'pending') {
      order.status = 'accepted';
    }

    await order.save();

    await NotificationService.notifyOrderUpdated({ order });

    return order;
  }

  static async getMerchantAllOrders(req) {
    const merchantId = OrderService.getMerchantId(req);

    let queryObj = { merchant: merchantId };

    const {
      status,
      paymentStatus,
      orderType,
      branchId,
      dateFrom,
      dateTo,
      search,
      page = 1,
      limit = 20,
      sort = '-placedAt',
    } = req.query;

    if (branchId) queryObj.branch = branchId;

    if (status && status !== 'all') queryObj.status = status;
    if (paymentStatus && paymentStatus !== 'all') queryObj.paymentStatus = paymentStatus;
    if (orderType && orderType !== 'all') queryObj.orderType = orderType;

    if (dateFrom || dateTo) {
      queryObj.placedAt = {};
      if (dateFrom) queryObj.placedAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        queryObj.placedAt.$lte = end;
      }
    }

    if (search) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      queryObj.$or = [
        { orderNumber: searchRegex },
        { customerName: searchRegex },
        { customerPhone: searchRegex },
      ];
    }

    const total = await OrderRepository.countDocuments(queryObj);

    const orders = await OrderRepository.find(queryObj)
      .populate('branch', 'name')
      .populate('table', 'tableNumber')
      .populate('customer', 'fullName phone')
      .populate('assignedWaiter', 'fullName')
      .populate('assignedKitchenStaff', 'fullName')
      .select(
        'orderNumber status paymentStatus totalAmount placedAt branch tableNumber customerName orderType items'
      )
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const ordersWithSummary = orders.map(order => {
      const withImage = attachPaymentImage(order, req);
      return {
        ...withImage,
        itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
        branchName: order.branch?.name || 'Unknown',
      };
    });

    const stats = await OrderRepository.aggregate([
      { $match: queryObj },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalOrders: { $sum: 1 },
          paidOrders: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
        },
      },
    ]);

    const summary = stats[0] || { totalRevenue: 0, totalOrders: 0, paidOrders: 0 };

    return {
      orders: ordersWithSummary,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      summary: {
        totalRevenue: summary.totalRevenue,
        totalOrders: summary.totalOrders,
        paidOrders: summary.paidOrders,
        avgOrderValue: summary.totalOrders
          ? Math.round(summary.totalRevenue / summary.totalOrders)
          : 0,
      },
    };
  }

  static async getBranchOrders(req) {
    const merchantId = OrderService.getMerchantId(req);
    const { id: branchId } = req.params;

    if (!branchId) {
      throw new AppError('branchId is required', 400);
    }

    let queryObj = {
      merchant: merchantId,
      branch: branchId,
    };

    const { dateFrom, dateTo, search, page = 1, limit = 20 } = req.query;

    if (dateFrom || dateTo) {
      queryObj.placedAt = {};

      if (dateFrom) {
        queryObj.placedAt.$gte = new Date(dateFrom);
      }

      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        queryObj.placedAt.$lte = end;
      }
    }

    if (search) {
      const searchRegex = {
        $regex: search.trim(),
        $options: 'i',
      };

      queryObj.$or = [
        { orderNumber: searchRegex },
        { customerName: searchRegex },
        { customerPhone: searchRegex },
      ];
    }

    const features = new ApiFeatures(
      OrderRepository.find(queryObj)
        .populate('branch', 'name')
        .populate('table', 'tableNumber status')
        .populate('customer', 'fullName phone')
        .populate('assignedWaiter', 'fullName'),
      req.query
    )
      .filter()
      .sort()
      .limitFields()
      .paginate();

    // IMPORTANT:
    // Do not call .select('branch table customer') here.
    // It would strip the other order fields from the response.

    const orders = await features.query.lean();

    const total = await OrderRepository.countDocuments(queryObj);

    const stats = await OrderRepository.aggregate([
      {
        $match: queryObj,
      },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: '$totalAmount',
          },
          totalOrders: {
            $sum: 1,
          },
          paidOrders: {
            $sum: {
              $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0],
            },
          },
          avgOrderValue: {
            $avg: '$totalAmount',
          },
        },
      },
    ]);

    const summary = stats[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      paidOrders: 0,
      avgOrderValue: 0,
    };

    const ordersWithItemCount = orders.map(order => {
      const withImage = attachPaymentImage(order, req);

      return {
        ...withImage,
        itemCount: order.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0,
      };
    });

    return {
      orders: ordersWithItemCount,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      summary: {
        totalRevenue: summary.totalRevenue,
        totalOrders: summary.totalOrders,
        paidOrders: summary.paidOrders,
        avgOrderValue: Math.round(summary.avgOrderValue || 0),
      },
    };
  }
  static async getOrderById(req) {
    const { id } = req.params;

    if (!id) {
      throw new AppError('Order ID is required', 400);
    }

    let order = await OrderRepository.findById(id)
      .populate('items.menuItem', 'name price')
      .populate('table', 'tableNumber')
      .populate('assignedWaiter', 'fullName')
      .populate('branch', 'name')
      .populate('assignedKitchenStaff', 'fullName')
      .populate('placedBy', 'firstName lastName')
      .lean();

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    return attachPaymentImage(order, req);
  }
}

module.exports = { OrderService };
