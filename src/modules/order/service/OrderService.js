const mongoose = require('mongoose');
const AppError = require('../../../../utils/appError');
const MenuItem = require('../../menu/model/MenuItem.model');
const Ingredient = require('../../../../models/Ingredient');
const Table = require('../../../../models/tabelModel');
const CustomerSession = require('../../../../models/customerSessionModule');
const Customer = require('../../../../models/customerModule');
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
const { OrderTransactionService } = require('./OrderTransactionService');
const { InventoryService } = require('../../inventory');
const logger = require('../../../../utils/logger');

class OrderService {
  static VALID_TRANSITIONS = OrderStateMachineService.TRANSITIONS;
  /**
   * Calculate COGS (Cost of Goods Sold) for a menu item.
   * 
   * Feature-flag aware:
   * - If inventory module enabled: Calculate from recipe ingredients
   * - If inventory module disabled: Use simple costPrice field
   * 
   * @param {Object} menuItem - The menu item document
   * @param {string} merchantId - Merchant ID for feature flag check
   * @returns {Promise<Number|null>} - Unit cost or null if not calculable
   */
  static async calculateMenuItemCost(menuItem, merchantId) {
    try {
      // Check if merchant has inventory module enabled
      const Merchant = require('../../../../models/merchantModel');
      const merchant = await Merchant.findById(merchantId);

      if (!merchant) {
        logger.warn('order.cogs.merchant_not_found', { merchantId });
        return null;
      }

      const hasInventoryModule = merchant.hasFeature('inventory');

      // If inventory module is disabled, use simple costPrice field
      if (!hasInventoryModule) {
        return menuItem.costPrice || 0; // Return 0 if costPrice not set
      }

      // Inventory module enabled - calculate from recipe
      if (!menuItem.recipe || !menuItem.recipe.ingredients || menuItem.recipe.ingredients.length === 0) {
        logger.warn('order.cogs.no_recipe', { 
          menuItemId: menuItem._id,
          merchantId,
          message: 'Inventory module enabled but no recipe found'
        });
        // Fallback to costPrice even with inventory module
        return menuItem.costPrice || 0;
      }

      // Get all ingredient IDs from the recipe
      const Ingredient = require('../../inventory/model/Ingredient');
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

      // Return calculated cost or fallback to costPrice
      if (hasAllCosts) {
        return totalCost;
      } else {
        logger.warn('order.cogs.incomplete_ingredient_costs', {
          menuItemId: menuItem._id,
          merchantId
        });
        return menuItem.costPrice || 0;
      }
    } catch (error) {
      // Log error but don't fail order placement
      logger.error('order.cogs.calculation_failed', { 
        message: error.message,
        menuItemId: menuItem._id,
        merchantId
      });
      return menuItem.costPrice || 0; // Fallback to simple cost
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

    const baseQuery = OrderRepository.find(filter)
      .populate('table', 'tableNumber')
      .populate('assignedWaiter', 'fullName')
      .populate('assignedKitchenStaff', 'fullName')
      .select(
        'orderNumber status tableNumber totalAmount placedAt readyAt items assignedWaiter assignedKitchenStaff'
      );

    // Apply ApiFeatures for search, sort, pagination
    const features = new ApiFeatures(baseQuery, req.query)
      .search(['orderNumber', 'customerName', 'customerPhone'])
      .sort()
      .paginate();

    const total = await OrderRepository.countDocuments(filter);
    const orders = await features.query.lean();

    const enrichedOrders = orders.map(order => ({
      ...order,
      itemCount: order.items.reduce((s, i) => s + i.quantity, 0),
      elapsed: OrderService.formatElapsed(order.placedAt),
      urgency: OrderService.getUrgency(order.placedAt),
    }));

    const page = req.query.page * 1 || 1;
    const limit = Math.min(req.query.limit * 1 || 100, 100);

    return {
      orders: enrichedOrders,
      results: enrichedOrders.length,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Get review queue - pending orders that require review by the requesting user's role
   * 
   * Returns orders where:
   * - status = 'pending'
   * - OrderFlowConfig.channels[order.source].reviewerRole matches user's role
   * 
   * Role matching:
   * - If user role name includes 'WAITER' → matches reviewerRole='waiter'
   * - If user role name includes 'SUPPORT' → matches reviewerRole='support'
   * 
   * @param {Object} req - Express request with req.user (from JWT auth)
   * @returns {Promise<Object>} { orders: Array }
   */
  static async getReviewQueue(req) {
    const merchantId = OrderService.getMerchantId(req);
    const { OrderFlowConfigService } = require('../../order-flow-config');

    // Determine reviewer role from user's role name
    const userRoleName = req.user?.role?.name || '';
    let reviewerRole = null;

    if (userRoleName.includes('WAITER')) {
      reviewerRole = 'waiter';
    } else if (userRoleName.includes('SUPPORT')) {
      reviewerRole = 'support';
    } else {
      // User role doesn't match any reviewer role
      return { orders: [] };
    }

    // Get all pending orders for this merchant
    const pendingOrders = await OrderRepository.find({
      merchant: merchantId,
      status: 'pending',
    })
      .populate('table', 'tableNumber')
      .populate('assignedWaiter', 'fullName')
      .select('orderNumber source status tableNumber customerName totalAmount placedAt items')
      .sort({ placedAt: 1 }) // Oldest first
      .lean();

    // Filter orders by channel config
    const filteredOrders = [];
    for (const order of pendingOrders) {
      const channelConfig = await OrderFlowConfigService.getChannelConfig(
        merchantId,
        order.source
      );

      // Include if:
      // 1. requiresReview is true (needs manual review)
      // 2. reviewerRole matches user's role
      if (channelConfig.requiresReview && channelConfig.reviewerRole === reviewerRole) {
        filteredOrders.push({
          ...order,
          itemCount: order.items.reduce((s, i) => s + i.quantity, 0),
          elapsed: OrderService.formatElapsed(order.placedAt),
          urgency: OrderService.getUrgency(order.placedAt),
          reviewerRole: channelConfig.reviewerRole, // Include for transparency
        });
      }
    }

    return { orders: filteredOrders };
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
      const unitCost = await OrderService.calculateMenuItemCost(menuItem, merchantId);

      orderItems.push({
        menuItem: menuItem._id,
        // Snapshot the primary-locale name as a plain string.
        // menuItem.name is a localizedTextSchema object { en, am } — we store the English
        // variant (falling back to a string coercion) so the field is always a plain String.
        name: menuItem.name?.en || String(menuItem.name),
        quantity,
        unitPrice,
        unitCost, // Will be null if no recipe or ingredient costs unavailable
        totalPrice,
        notes: item.notes || '',
        // ✅ Snapshot requiresKitchen from MenuItem (prevents retroactive menu changes from affecting historical orders)
        requiresKitchen: menuItem.requiresKitchen !== false, // Default to true if undefined
        // ✅ Item status starts at 'pending' (set by schema default)
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
      notes,
      branchId,
      location,
      deliveryFee,
      deliveryNotes,
      performedBy,
      performedByName,
      merchantId,
      source, // explicit source parameter ('waiter' | 'admin')
    } = data;
    // Note: client-supplied `subtotal` and per-item `unitPrice` are intentionally
    // ignored — prices are always resolved server-side from the MenuItem documents.

    // Build the delivery sub-document from the validated `location` field.
    // The Zod validator accepts location.coordinates as [longitude, latitude] (GeoJSON order).
    // The Order model's delivery sub-schema stores { location: { lat, lng }, phone, fee }.
    // These are two distinct fields: top-level `location` (GeoJSON) and `delivery` (sub-doc).
    let deliverySubDoc = undefined;
    if (orderType === 'delivery') {
      const coords = location?.coordinates; // [longitude, latitude]
      deliverySubDoc = {
        location: {
          lat: coords?.[1] ?? null,
          lng: coords?.[0] ?? null,
        },
        phone: customerPhone || null,
        fee: deliveryFee || 0,
        addressNote: deliveryNotes || undefined,
      };
    }

    assertValidStaffOrderType(orderType);
    assertDineInTableId(orderType, tableId);

    // Phase 0 — pre-transaction validation (read-only, fast-fail before opening a session)
    const { orderItems, subtotal } = await OrderService.buildOrderItems(items, merchantId);
    const deductionPlan = await InventoryService.resolveDeductionPlan(orderItems, merchantId);

    const mongoSession = await mongoose.startSession();
    let createdOrder;
    let diningSessionId = null; // Track dining session for dine-in orders

    try {
      await mongoSession.withTransaction(async () => {
        // ✅ TASK 6: Get or create dining session for dine-in orders
        let tableNumber = null;
        if (orderType === 'dine_in') {
          const table = await Table.findOne({
            _id: tableId,
            merchant: merchantId,
            branch: branchId,
          }).session(mongoSession);
          if (!table) throw new AppError('Table not found', 404);
          tableNumber = table.tableNumber;
          
          // ✅ Get or create active dining session for this table
          const { SessionService } = require('../../sessions/service/SessionService');
          const { session: diningSession } = await SessionService.getOrCreateActiveSession({
            tableId,
            createdBy: performedBy, // Staff user ID
            mongoSession, // Pass transaction session
          });
          
          diningSessionId = diningSession._id;
          
          logger.info('staff.order.session_attached', {
            tableId: tableId.toString(),
            sessionId: diningSessionId.toString(),
            isNew: !diningSession.startedAt || 
                   (Date.now() - new Date(diningSession.startedAt).getTime() < 1000)
          });
        }

        // Generate orderNumber inside the transaction so the Counter update is
        // session-aware. This causes the pre-validate hook's early-exit guard
        // (`if (!this.isNew || this.orderNumber) return next()`) to skip its own
        // un-sessioned Counter call, matching OrderTransactionService.executePlaceOrder.
        const orderNumber = await OrderTransactionService.generateOrderNumber(
          { merchant: merchantId, branch: branchId, orderType }, // ✅ Pass orderType for prefix
          mongoSession
        );

        // Create order using server-computed prices only
        const [order] = await OrderRepository.create(
          [
            {
              merchant: merchantId,
              branch: branchId,
              customerName: customerName || 'Walk-in Customer',
              customerPhone: customerPhone || null,
              table: orderType === 'dine_in' ? tableId : null,
              tableNumber: orderType === 'dine_in' ? tableNumber : null,
              session: diningSessionId, // ✅ TASK 6: Link to dining session (null for takeaway/delivery)
              orderType,
              orderNumber,
              source, // explicit source ('waiter' | 'admin')
              items: orderItems,     // prices from buildOrderItems — never from client
              subtotal,              // computed server-side — never from client
              totalAmount: subtotal, // same
              paymentStatus: 'unpaid',
              status: 'pending',
              notes: notes || '',
              location,
              delivery: deliverySubDoc,
              deliveryFee: deliveryFee || 0,
              deliveryNotes: deliveryNotes || undefined,
              placedBy: performedBy,
            },
          ],
          { session: mongoSession }
        );
        createdOrder = order;

        // Mark table occupied (SessionService already did this, but keep for safety)
        if (orderType === 'dine_in') {
          await Table.findByIdAndUpdate(tableId, { status: 'occupied' }, { session: mongoSession });
        }

        // Deduct inventory inside the same transaction
        await InventoryService.deductForOrder(
          {
            merchantId,
            orderId: createdOrder._id,
            orderNumber: createdOrder.orderNumber,
            plan: deductionPlan,
            performedBy,
          },
          mongoSession
        );

        await NotificationService.notifyStaffOrderPlaced(
          {
            order: createdOrder,
            branchId,
            merchantId: createdOrder.merchant,
            tableNumber,
            placedByName: performedByName,
          },
          mongoSession
        );
      });

      // ──────────────────────────────────────────────────────────────────
      // Step 3: Auto-routing based on OrderFlowConfig
      // (Must happen AFTER transaction commits, since transitionOrderStatus
      // creates its own transaction)
      // ──────────────────────────────────────────────────────────────────
      const { OrderFlowConfigService } = require('../../order-flow-config');
      const { OrderStateMachineService } = require('./OrderStateMachineService');

      const channelConfig = await OrderFlowConfigService.getChannelConfig(
        merchantId,
        createdOrder.source
      );

      if (channelConfig.requiresReview === false) {
        // Auto-route: pending → accepted → preparing
        // Use actorType: 'system' for automated transitions

        // Transition 1: pending → accepted
        await OrderStateMachineService.transitionOrderStatus({
          orderId: createdOrder._id,
          toStatus: 'accepted',
          merchantQuery: { merchant: merchantId },
          user: null,
          actorType: 'system',
          reason: 'Auto-accepted: channel requires no review',
        });

        // Transition 2: accepted → preparing
        await OrderStateMachineService.transitionOrderStatus({
          orderId: createdOrder._id,
          toStatus: 'preparing',
          merchantQuery: { merchant: merchantId },
          user: null,
          actorType: 'system',
          reason: 'Auto-sent to kitchen: channel requires no review',
        });

        // Refresh order to get updated status
        await createdOrder.populate([
          { path: 'items.menuItem', select: 'name price kitchenStation' },
          { path: 'customer', select: 'name phone' },
          { path: 'table', select: 'number' },
        ]);

        logger.info('order.auto-routed.staff', {
          orderId: createdOrder._id.toString(),
          source: createdOrder.source,
          finalStatus: createdOrder.status,
        });
      }

      logger.info('staff.order.place.success', {
        orderId: createdOrder._id.toString(),
        merchantId: merchantId.toString(),
        branchId: branchId.toString(),
        orderNumber: createdOrder.orderNumber,
      });

      // ✅ Emit real-time socket event to staff (after DB transaction committed)
      try {
        const { getIo } = require('../../../infrastructure/websocket/socket-server');
        const io = getIo();
        
        // Broadcast to branch staff with ORDER_VIEW and ORDER_MANAGE permissions
        io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:new', {
          _id: createdOrder._id,
          orderNumber: createdOrder.orderNumber,
          status: createdOrder.status,
          source: createdOrder.source,
          orderType: createdOrder.orderType,
          tableNumber: createdOrder.tableNumber,
          customerName: createdOrder.customerName,
          totalAmount: createdOrder.totalAmount,
          placedAt: createdOrder.placedAt,
          branchId,
        });
        
        io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('order:new', {
          _id: createdOrder._id,
          orderNumber: createdOrder.orderNumber,
          status: createdOrder.status,
          source: createdOrder.source,
          orderType: createdOrder.orderType,
          tableNumber: createdOrder.tableNumber,
          customerName: createdOrder.customerName,
          totalAmount: createdOrder.totalAmount,
          placedAt: createdOrder.placedAt,
          branchId,
        });
      } catch (socketError) {
        // Don't fail the order if socket broadcast fails
        logger.warn('staff.order.place.socket_emit_failed', {
          orderId: createdOrder._id.toString(),
          error: socketError.message,
        });
      }

      return createdOrder;
    } catch (error) {
      if (error instanceof AppError) throw error;

      if (OrderTransactionService.isInventoryError(error)) {
        logger.warn('staff.order.place.inventory_failed', {
          merchantId: merchantId.toString(),
          message: error.message,
        });
        throw new AppError('Insufficient inventory for this order', 400);
      }

      logger.error('staff.order.place.failed', {
        merchantId: merchantId.toString(),
        error: error.message,
        errorName: error.constructor.name,
        stack: error.stack,
      });
      throw new AppError('Failed to create staff order', 500);
    } finally {
      await mongoSession.endSession();
    }
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
    const statusList = status ? [status] : ['pending', 'accepted', 'preparing', 'ready', 'served'];

    const query = { status: statusList };
    if (branchId) {
      query.branch = branchId;
    }

    const baseQuery = OrderRepository.find(merchantScopedQuery(query, req))
      .populate('table', 'tableNumber')
      .populate('items.menuItem', 'name')
      .populate('branch', 'name');

    // Apply ApiFeatures for search, sort, pagination
    const features = new ApiFeatures(baseQuery, req.query)
      .search(['orderNumber', 'customerName', 'customerPhone'])
      .sort()
      .paginate();

    const total = await OrderRepository.countDocuments(merchantScopedQuery(query, req));
    const orders = await features.query.lean();

    const enrichedOrders = orders.map(order => attachPaymentImage(order, req));

    const page = req.query.page * 1 || 1;
    const limit = Math.min(req.query.limit * 1 || 100, 100);

    return {
      orders: enrichedOrders,
      results: enrichedOrders.length,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
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
    let order;
    let tableIdToFree = null;

    try {
      await session.withTransaction(async () => {
        order = await OrderRepository.findOne(merchantScopedQuery({ _id: id }, req)).session(
          session
        );

        if (!order) {
          throw new AppError('Order not found', 404);
        }

        if (order.paymentStatus === 'paid') {
          throw new AppError('Order already paid', 400);
        }

        if (order.status === 'canceled') {
          throw new AppError('Cannot mark a canceled order as paid', 400);
        }

        // ✅ GUARD: Dine-in orders must have all items served before payment completes them
        if (order.orderType === 'dine_in' && order.status !== 'served') {
          throw new AppError(
            'Cannot complete a dine-in order before all items have been served',
            400
          );
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

        // ✅ COMPLETION LOGIC: Only complete if not already completed
        // For dine-in: guard above ensures status === 'served', so this always succeeds
        // For takeaway/delivery: payment does NOT complete the order (stays in current status)
        if (order.status !== 'completed') {
          // Only dine-in orders reach here (takeaway/delivery require separate pickup/delivery completion)
          if (order.orderType === 'dine_in') {
            order.status = 'completed';
            order.completedAt = new Date();
            await order.save({ session });

            // ✅ TABLE CLEANUP: Only runs when order actually completes
            if (order.table) {
              await CustomerSession.updateOne(
                merchantScopedQuery({ tableId: order.table, isActive: true }, req),
                { isActive: false },
                { session }
              );

              // ✅ SECURITY FIX: Use transitionTableStatus (called after transaction) instead of direct set
              // This ensures session auto-close logic triggers for table status change
              tableIdToFree = order.table;
            }
          }
          // else: takeaway/delivery payment does NOT complete order - separate endpoint needed
        }

        if (req.customer) {
          const points = Math.floor(order.totalAmount);
          const customerId = req.customer._id;

          // Atomic increment — safe under withTransaction retries because
          // each retry issues a fresh $inc against the DB value rather than
          // reading a stale in-memory snapshot and adding to it again.
          await Customer.findByIdAndUpdate(
            customerId,
            {
              $inc: {
                'loyalty.points': points,
                'loyalty.totalPointsEarned': points,
              },
              $push: {
                history: {
                  action: 'award_points',
                  details: `Earned ${points} points from order ${order.orderNumber} (${paymentMethod || 'cash'})`,
                  order: order._id,
                  addedAt: new Date(),
                },
              },
            },
            { session, new: true }
          );

          // Re-fetch after $inc to get the authoritative totalPointsEarned
          // for tier threshold comparison — in-memory snapshot is no longer valid.
          const updatedCustomer = await Customer.findById(customerId)
            .select('loyalty.totalPointsEarned loyalty.tier')
            .session(session)
            .lean();

          const tiers = {
            platinum: 50000,
            gold: 20000,
            silver: 5000,
            bronze: 0,
          };

          const newTier = Object.keys(tiers).find(
            tier => updatedCustomer.loyalty.totalPointsEarned >= tiers[tier]
          );

          if (newTier && newTier !== updatedCustomer.loyalty.tier) {
            await Customer.findByIdAndUpdate(
              customerId,
              { $set: { 'loyalty.tier': newTier } },
              { session }
            );
          }
        }

        await NotificationService.notifyOrderPaid(
          { order, paymentMethod, bankName, image },
          session
        );
      });

      // ✅ AFTER TRANSACTION: Call transitionTableStatus to trigger session auto-close
      if (tableIdToFree && order.table) {
        try {
          const { BranchService } = require('../../branch/service/BranchService');
          await BranchService.transitionTableStatus({
            tableId: order.table,
            merchantId: order.merchant,
            branchId: order.branch,
            toStatus: 'available'
          });
        } catch (error) {
          logger.warn('payment.table_transition_failed', {
            orderId: order._id.toString(),
            tableId: order.table?.toString(),
            error: error.message
          });
        }
      }

      return order;
    } finally {
      await session.endSession();
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

    const { tableNumber, customerPhone, dateFrom, dateTo } = req.query;

    // ✅ FIXED: Use exact match instead of unescaped $regex to prevent injection
    if (tableNumber) queryObj.tableNumber = tableNumber.trim();

    if (customerPhone) {
      queryObj.customerPhone = customerPhone.trim();
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

    // Don't manually build $or for search — ApiFeatures.search() handles it
    const features = new ApiFeatures(OrderRepository.getOrderModel().find(queryObj), req.query)
      .search(['orderNumber', 'customerName', 'customerPhone'])
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

    const page = req.query.page * 1 || 1;
    const limit = Math.min(req.query.limit * 1 || 40, 100);

    return {
      total,
      page,
      pages: Math.ceil(total / limit),
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

    const { branchId, dateFrom, dateTo } = req.query;

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

    const baseQuery = OrderRepository.find(queryObj)
      .populate('branch', 'name')
      .populate('table', 'tableNumber')
      .populate('customer', 'fullName phone')
      .populate('assignedWaiter', 'fullName')
      .populate('assignedKitchenStaff', 'fullName');

    // Apply ApiFeatures for search, sort, pagination (max limit 100)
    const features = new ApiFeatures(baseQuery, req.query)
      .search(['orderNumber', 'customerName', 'customerPhone'])
      .sort()
      .paginate();

    const total = await OrderRepository.countDocuments(queryObj);
    const orders = await features.query.lean();

    const totalRevenue = orders.reduce((s, o) => s + o.totalAmount, 0);

    const page = req.query.page * 1 || 1;
    const limit = Math.min(req.query.limit * 1 || 20, 100);

    return {
      total,
      page,
      pages: Math.ceil(total / limit),
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
      // paymentStatus intentionally left as 'unpaid' — the source order was never paid.
      // status:'canceled' prevents any future markAsPaid attempt on this order.
      sourceOrder.canceledReason = `Merged into order ${targetOrder.orderNumber}`;
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

    // Terminal states — check first for clean early exits
    if (existing.status === 'canceled') {
      return { order: existing, alreadyCanceled: true };
    }

    if (existing.status === 'completed') {
      throw new AppError('Order is already completed and cannot be canceled', 400);
    }

    // Customer path (no req.user): only allowed while still pending
    if (!req.user && existing.status !== 'pending') {
      throw new AppError('Customers can only cancel orders while they are still pending', 400);
    }

    // Staff path: state machine enforces per-status role permissions.
    // No additional status gate here — preparing/ready/out_for_delivery cancellations
    // are legitimate for the appropriate roles as defined in TRANSITION_ROLE_PERMISSIONS.

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

  static async addItemToOrder(orderId, items, merchantId, userId) {
    const order = await OrderRepository.findOne({
      _id: orderId,
      merchant: merchantId,
      status: { $in: ['pending', 'accepted', 'preparing'] },
    });

    if (!order) {
      throw new AppError('Active order not found or cannot be modified', 404);
    }

    const { orderItems: newItems, subtotal: newSubtotal } = await OrderService.buildOrderItems(
      items,
      merchantId
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

    const { status, paymentStatus, orderType, branchId, dateFrom, dateTo } = req.query;

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

    const baseQuery = OrderRepository.find(queryObj)
      .populate('branch', 'name')
      .populate('table', 'tableNumber')
      .populate('customer', 'fullName phone')
      .populate('assignedWaiter', 'fullName')
      .populate('assignedKitchenStaff', 'fullName')
      .select(
        'orderNumber status paymentStatus totalAmount placedAt branch tableNumber customerName orderType items'
      );

    // Apply ApiFeatures for search, sort, pagination (max limit 100)
    const features = new ApiFeatures(baseQuery, req.query)
      .search(['orderNumber', 'customerName', 'customerPhone'])
      .sort()
      .paginate();

    const total = await OrderRepository.countDocuments(queryObj);
    const orders = await features.query.lean();

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

    const page = req.query.page * 1 || 1;
    const limit = Math.min(req.query.limit * 1 || 20, 100);

    return {
      orders: ordersWithSummary,
      total,
      page,
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

    const { dateFrom, dateTo } = req.query;

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

    // Don't manually build $or for search — ApiFeatures.search() handles it
    const features = new ApiFeatures(
      OrderRepository.find(queryObj)
        .populate('branch', 'name')
        .populate('table', 'tableNumber status')
        .populate('customer', 'fullName phone')
        .populate('assignedWaiter', 'fullName'),
      req.query
    )
      .search(['orderNumber', 'customerName', 'customerPhone'])
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

    const page = req.query.page * 1 || 1;
    const limit = Math.min(req.query.limit * 1 || 20, 100);

    return {
      total,
      page,
      pages: Math.ceil(total / limit),
      summary: {
        totalRevenue: summary.totalRevenue,
        totalOrders: summary.totalOrders,
        paidOrders: summary.paidOrders,
        avgOrderValue: Math.round(summary.avgOrderValue || 0),
      },
      orders: ordersWithItemCount,
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

  /**
   * Get order by ID with dual authentication support
   * 
   * Staff (JWT) → Can view any order in their merchant
   * Customer (Session) → Can only view orders associated with their table's session
   */
  static async getOrderByIdDualAuth(req) {
    const { id } = req.params;
    console.log(req)
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

    // Verify merchant access first
    if (order.merchant?.toString() !== req.merchantId?.toString()) {
      throw new AppError('Order not found', 404);
    }

    // If customer session auth (not JWT), verify they can access this order
    if (req.tableSession) {
      // Customer can only view orders from their session's table
      // ✅ FIX: Compare string representations (order.table is populated object with _id)
      const orderTableId = order.table?._id?.toString() || order.table?.toString();
      const sessionTableId = req.tableId?.toString();
      
      if (orderTableId !== sessionTableId) {
        throw new AppError('You do not have access to this order', 403);
      }
    }

    return attachPaymentImage(order, req);
  }
}

module.exports = { OrderService };
