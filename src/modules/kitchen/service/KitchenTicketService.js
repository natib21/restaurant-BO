// src/modules/kitchen/service/KitchenTicketService.js
// ✅ PHASE 1: Kitchen Ticket lifecycle management with RBAC-guarded transitions
const mongoose = require('mongoose');
const KitchenTicket = require('../../../../models/KitchenTicket');
const KitchenStation = require('../../../../models/KitchenStation');
const Order = require('../../../../models/orderModel');
const AppError = require('../../../../utils/appError');
const logger = require('../../../../utils/logger');
const { getIo } = require('../../../infrastructure/websocket/socket-server');

/**
 * Valid ticket status transitions (mirrors Order state machine pattern)
 */
const TICKET_TRANSITIONS = {
  pending: ['accepted', 'canceled'],
  accepted: ['in_progress', 'canceled'],
  in_progress: ['ready', 'canceled'],
  ready: ['canceled'], // Phase 1: No auto-complete yet, tickets stay 'ready' until order done
  completed: [], // Reserved for Phase 2
  canceled: [],
};

/**
 * Role-based permissions for ticket transitions (Option 1: Explicit Accept)
 * Matches OrderStateMachineService.TRANSITION_ROLE_PERMISSIONS pattern
 * 
 * Key decision: "Accept" is explicit action (not auto-start) to preserve
 * real actor attribution in audit logs
 */
const TICKET_TRANSITION_PERMISSIONS = {
  'pending->accepted': ['kitchen', 'admin', 'superAdmin'],      // ← Explicit Accept button
  'pending->canceled': ['kitchen', 'admin', 'superAdmin'],
  
  'accepted->in_progress': ['kitchen', 'admin', 'superAdmin'],  // Start working
  'accepted->canceled': ['kitchen', 'admin', 'superAdmin'],
  
  'in_progress->ready': ['kitchen', 'admin', 'superAdmin'],     // Mark as ready
  'in_progress->canceled': ['kitchen', 'admin', 'superAdmin'],
  
  // Phase 1: No ready->completed transition (tickets stay ready until order done)
  // Phase 2 will add: 'ready->completed': ['system'] triggered by order:served event
  'ready->canceled': ['kitchen', 'waiter', 'admin', 'superAdmin'],
};

const TERMINAL_STATUSES = new Set(['completed', 'canceled']);

class KitchenTicketService {
  /**
   * Create kitchen tickets for an order (one per station)
   * Called when order transitions to 'preparing' status
   * 
   * @param {string} orderId - Order ID
   * @param {Object} session - Mongoose session (optional, for transactions)
   * @returns {Promise<Array>} Created tickets
   */
  static async createTicketsForOrder(orderId, session = null) {
    logger.info('kds.create-tickets.start', { orderId });

    const order = await Order.findById(orderId)
      .populate({
        path: 'items.menuItem',
        select: 'name kitchenStation prepTime category' 
      })
      .session(session);

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    // Group items by kitchen station (or null for items without station assignment)
    const itemsByStation = new Map();
    let unassignedItems = [];  // Items without kitchen station assigned

    for (const orderItem of order.items) {
      const menuItem = orderItem.menuItem;
      
      if (!menuItem) {
        logger.warn('kds.create-tickets.missing-menu-item', {
          orderId,
          orderItemId: orderItem._id,
        });
        continue;
      }

      // Skip items that don't require kitchen prep
      if (orderItem.requiresKitchen === false) {
        logger.debug('kds.create-tickets.skip-no-kitchen', {
          orderId,
          menuItemId: menuItem._id,
          menuItemName: menuItem.name,
          requiresKitchen: false
        });
        continue;
      }

      const stationId = menuItem.kitchenStation;

      if (stationId) {
        // Item has a kitchen station assigned
        if (!itemsByStation.has(stationId.toString())) {
          itemsByStation.set(stationId.toString(), []);
        }

        itemsByStation.get(stationId.toString()).push({
          orderItemId: orderItem._id,
          menuItem: menuItem._id,
          menuItemName: menuItem.name?.en || menuItem.name,  // Extract English name from localized object
          quantity: orderItem.quantity,
          notes: orderItem.specialInstructions || orderItem.notes,
          status: 'pending',
        });
      } else {
        // Item requires kitchen but has NO station assigned
        // Add to unassigned pool
        logger.debug('kds.create-tickets.unassigned-item', {
          orderId,
          menuItemId: menuItem._id,
          menuItemName: menuItem.name,
        });

        unassignedItems.push({
          orderItemId: orderItem._id,
          menuItem: menuItem._id,
          menuItemName: menuItem.name?.en || menuItem.name,  // Extract English name from localized object
          quantity: orderItem.quantity,
          notes: orderItem.specialInstructions || orderItem.notes,
          status: 'pending',
        });
      }
    }

    // No kitchen items at all? Return empty
    if (itemsByStation.size === 0 && unassignedItems.length === 0) {
      logger.info('kds.create-tickets.no-kitchen-items', { orderId });
      return [];
    }

    const tickets = [];

    // Create tickets for assigned stations
    for (const [stationId, items] of itemsByStation) {
      const station = await KitchenStation.findById(stationId).select('branch').session(session);
      
      if (!station) {
        logger.warn('kds.create-tickets.station-not-found', { stationId });
        continue;
      }

      const ticketNumber = await this._getNextTicketNumber(stationId, station.branch, session);

      const ticketData = {
        merchant: order.merchant,
        branch: station.branch,
        order: order._id,
        station: stationId,
        ticketNumber,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        tableNumber: order.table?.tableNumber || null,
        items,
        status: 'pending',
        priority: this._calculatePriority(order),
      };

      const ticket = session
        ? await KitchenTicket.create([ticketData], { session }).then(docs => docs[0])
        : await KitchenTicket.create(ticketData);

      tickets.push(ticket);

      logger.info('kds.ticket.created', {
        ticketId: ticket._id,
        orderId: order._id,
        stationId,
        ticketNumber: ticket.ticketNumber,
        itemCount: items.length,
      });
    }

    // Create fallback ticket for unassigned items
    // Find the first/default kitchen station for the branch
    if (unassignedItems.length > 0) {
      logger.info('kds.create-tickets.creating-fallback-ticket', {
        orderId,
        itemCount: unassignedItems.length,
      });

      const defaultStation = await KitchenStation.findOne({
        branch: order.branch,
        isActive: true,
      })
        .sort({ displayOrder: 1, createdAt: 1 })  // Get first station by display order
        .session(session);

      if (defaultStation) {
        const ticketNumber = await this._getNextTicketNumber(defaultStation._id, order.branch, session);

        const ticketData = {
          merchant: order.merchant,
          branch: order.branch,
          order: order._id,
          station: defaultStation._id,
          ticketNumber,
          orderNumber: order.orderNumber,
          orderType: order.orderType,
          tableNumber: order.table?.tableNumber || null,
          items: unassignedItems,
          status: 'pending',
          priority: this._calculatePriority(order),
        };

        const ticket = session
          ? await KitchenTicket.create([ticketData], { session }).then(docs => docs[0])
          : await KitchenTicket.create(ticketData);

        tickets.push(ticket);

        logger.info('kds.ticket.created-fallback', {
          ticketId: ticket._id,
          orderId: order._id,
          stationId: defaultStation._id,
          stationName: defaultStation.name,
          ticketNumber: ticket.ticketNumber,
          itemCount: unassignedItems.length,
        });
      } else {
        logger.error('kds.create-tickets.no-default-station', {
          orderId,
          branch: order.branch,
          unassignedItemCount: unassignedItems.length,
        });

        throw new AppError(
          'No kitchen stations found for branch. Please create at least one kitchen station.',
          500
        );
      }
    }

    // Emit Socket.IO events for real-time KDS updates
    this._emitTicketEvents('ticket:created', tickets, order.branch);

    // Update order items to 'in_progress' after tickets created
    await this._updateOrderItemsOnTicketCreation(order, tickets, session);

    return tickets;
  }

  /**
   * Update ticket status with RBAC permission checks (Option 1 pattern)
   * 
   * @param {string} ticketId - Ticket ID
   * @param {string} toStatus - Target status
   * @param {Object} user - User object with role
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Updated ticket and transition info
   */
  static async transitionTicketStatus(ticketId, toStatus, user, options = {}) {
    const { reason, session: externalSession } = options;

    logger.info('kds.transition.start', {
      ticketId,
      toStatus,
      userId: user?._id,
      reason,
    });

    const session = externalSession || await mongoose.startSession();
    const shouldCommit = !externalSession;

    try {
      let result;

      const transactionBody = async () => {
        // 1. Fetch ticket with lock
        const ticket = await KitchenTicket.findById(ticketId)
          .session(session)
          .populate('station', 'name slug');

        if (!ticket) {
          throw new AppError('Kitchen ticket not found', 404);
        }

        const fromStatus = ticket.status;

        // 2. Validate transition is allowed
        const allowedTransitions = TICKET_TRANSITIONS[fromStatus];
        if (!allowedTransitions || !allowedTransitions.includes(toStatus)) {
          throw new AppError(
            `Invalid transition: ${fromStatus} → ${toStatus}`,
            400
          );
        }

        // 3. Check if already in target status (noop)
        if (fromStatus === toStatus) {
          logger.info('kds.transition.noop', { ticketId, status: toStatus });
          result = { ticket, previousStatus: fromStatus, noop: true };
          return;
        }

        // 4. Check role-based permissions (RBAC guard - Option 1 pattern)
        const transitionKey = `${fromStatus}->${toStatus}`;
        const allowedRoles = TICKET_TRANSITION_PERMISSIONS[transitionKey];

        if (!allowedRoles) {
          throw new AppError(
            `No permission configuration for transition: ${transitionKey}`,
            500
          );
        }

        const roleCategory = this._extractRoleCategory(user);

        if (!allowedRoles.includes(roleCategory)) {
          throw new AppError(
            `Insufficient permissions. Role '${roleCategory}' cannot perform ${transitionKey}`,
            403
          );
        }

        // 5. Apply status change
        ticket.status = toStatus;

        // 6. Apply timestamps based on transition
        const now = new Date();

        switch (toStatus) {
          case 'accepted':
            ticket.acceptedAt = now;
            ticket.assignedTo = user._id;
            break;

          case 'in_progress':
            ticket.startedAt = now;
            if (!ticket.assignedTo) {
              ticket.assignedTo = user._id;
            }
            break;

          case 'ready':
            ticket.completedAt = now;
            break;

          case 'canceled':
            ticket.canceledAt = now;
            ticket.canceledBy = user._id;
            ticket.canceledReason = reason || 'Canceled by kitchen staff';
            break;
        }

        // 7. Save ticket
        await ticket.save({ session });

        // ✅ 8. Update order item statuses based on ticket transition
        await this._updateOrderItemStatuses(ticket, toStatus, session);

        logger.info('kds.transition.success', {
          ticketId,
          fromStatus,
          toStatus,
          userId: user._id,
        });

        result = {
          ticket,
          previousStatus: fromStatus,
          noop: false,
        };

        // 9. Check if all tickets for this order are ready → transition order
        if (toStatus === 'ready') {
          await this._checkOrderReadyRollup(ticket.order, session);
        }
      };

      if (shouldCommit) {
        await session.withTransaction(transactionBody);
      } else {
        await transactionBody();
      }

      // Emit Socket.IO event AFTER commit
      if (!result.noop) {
        this._emitTicketEvents('ticket:updated', [result.ticket], result.ticket.branch);
      }

      return result;
    } finally {
      if (shouldCommit) {
        await session.endSession();
      }
    }
  }

  /**
   * Update order item statuses to 'in_progress' when tickets are created
   * 
   * @private
   */
  static async _updateOrderItemsOnTicketCreation(order, tickets, session) {
    const { ItemStatusService } = require('../../order/service/ItemStatusService');

    // Collect all order item IDs referenced by tickets
    const ticketItemIds = new Set();
    for (const ticket of tickets) {
      for (const ticketItem of ticket.items) {
        ticketItemIds.add(ticketItem.orderItemId.toString());
      }
    }

    let updatedCount = 0;

    // Update matching order items to 'in_progress'
    for (const orderItem of order.items) {
      if (ticketItemIds.has(orderItem._id.toString())) {
        try {
          const { noop } = ItemStatusService.validateTransition(orderItem.status, 'in_progress');
          
          if (!noop) {
            orderItem.status = 'in_progress';
            updatedCount++;
          }
        } catch (err) {
          logger.warn('kds.ticket-creation.invalid-transition', {
            orderItemId: orderItem._id.toString(),
            currentStatus: orderItem.status,
            error: err.message,
          });
        }
      }
    }

    if (updatedCount > 0) {
      await order.save({ session });

      logger.info('kds.ticket-creation.items-updated', {
        orderId: order._id.toString(),
        updatedCount,
      });

      // Recompute order status
      await ItemStatusService.recomputeOrderStatus(order, session);
    }
  }

  /**
   * Update order item statuses based on ticket transition
   * 
   * When ticket moves to:
   * - in_progress: Set all ticket items in order to 'in_progress'
   * - ready: Set all ticket items in order to 'ready' (NOT auto-served)
   * 
   * Then recompute overall order status
   * 
   * @private
   */
  static async _updateOrderItemStatuses(ticket, toStatus, session) {
    // Only update item status for these transitions
    if (toStatus !== 'in_progress' && toStatus !== 'ready') {
      return;
    }

    const Order = require('../../../../models/orderModel');
    const { ItemStatusService } = require('../../order/service/ItemStatusService');

    // Fetch order with session lock
    const order = await Order.findById(ticket.order).session(session);

    if (!order) {
      logger.warn('kds.update-item-statuses.order-not-found', {
        ticketId: ticket._id,
        orderId: ticket.order,
      });
      return;
    }

    let updatedCount = 0;

    // Map of ticket item ObjectIds for fast lookup
    const ticketItemIds = new Set(ticket.items.map(ti => ti.orderItemId.toString()));

    // Update matching order items
    for (const orderItem of order.items) {
      if (ticketItemIds.has(orderItem._id.toString())) {
        // Validate transition is allowed
        try {
          const { noop } = ItemStatusService.validateTransition(orderItem.status, toStatus);
          
          if (!noop) {
            orderItem.status = toStatus;
            updatedCount++;

            logger.debug('kds.update-item-status', {
              ticketId: ticket._id.toString(),
              orderItemId: orderItem._id.toString(),
              newStatus: toStatus,
            });
          }
        } catch (err) {
          // Log but don't fail - item might have been manually updated
          logger.warn('kds.update-item-status.invalid-transition', {
            ticketId: ticket._id.toString(),
            orderItemId: orderItem._id.toString(),
            currentStatus: orderItem.status,
            targetStatus: toStatus,
            error: err.message,
          });
        }
      }
    }

    if (updatedCount > 0) {
      await order.save({ session });

      logger.info('kds.update-item-statuses.complete', {
        ticketId: ticket._id.toString(),
        orderId: order._id.toString(),
        updatedCount,
        toStatus,
      });

      /**
       * CRITICAL: DO NOT recompute order status here!
       * 
       * Order status transitions (preparing → ready) must go through the state machine
       * via the kitchen:all_tickets_ready event handler. This ensures:
       * 1. Proper notifications are sent
       * 2. Status history is recorded correctly  
       * 3. Socket.IO events are emitted
       * 
       * Item status changes should NOT directly drive order status when using KDS.
       * The roll-up happens via: ticket ready → kitchen:all_tickets_ready event → state machine → order ready
       */
      // REMOVED FOR BUG FIX:
      // await ItemStatusService.recomputeOrderStatus(order, session);
    }
  }

  /**
   * Check if all tickets for an order are ready, and if so, transition order to 'ready'
   * (Ticket → Order ready roll-up)
   * 
   * @private
   */
  static async _checkOrderReadyRollup(orderId, session) {
    const allTickets = await KitchenTicket.find({
      order: orderId,
      status: { $ne: 'canceled' },
    }).session(session);

    const allReady = allTickets.length > 0 && allTickets.every(t => t.status === 'ready');

    if (allReady) {
      logger.info('kds.order-ready-rollup.all-tickets-ready', {
        orderId,
        ticketCount: allTickets.length,
      });

      // Use outbox pattern to transition order (processed by separate handler)
      const OutboxEvent = require('../../../../models/OutboxEvent');

      await OutboxEvent.create(
        [
          {
            aggregateId: orderId,
            aggregateType: 'order',
            eventType: 'kitchen:all_tickets_ready',
            merchant: allTickets[0].merchant,
            payload: {
              target: 'room',
              room: `branch:${allTickets[0].branch}`,
              data: {
                orderId,
                ticketIds: allTickets.map(t => t._id),
              },
            },
          },
        ],
        { session }
      );

      logger.info('kds.order-ready-rollup.outbox-queued', { orderId });
    }
  }

  /**
   * Get next ticket number for a station (auto-increment per day)
   * Format: GRILL-42, SALAD-15, etc.
   * 
   * @private
   */
  static async _getNextTicketNumber(stationId, branchId, session) {
    const station = await KitchenStation.findById(stationId).session(session);

    if (!station) {
      throw new AppError('Kitchen station not found', 404);
    }

    // Get start of today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Count tickets created today for this station
    const todayCount = await KitchenTicket.countDocuments({
      station: stationId,
      branch: branchId,
      createdAt: { $gte: startOfDay },
    }).session(session);

    const sequenceNumber = todayCount + 1;

    // Format: GRILL-42
    const stationPrefix = (station.slug || station.name).toUpperCase().replace(/[^A-Z]/g, '');
    return `${stationPrefix}-${sequenceNumber}`;
  }

  /**
   * Calculate ticket priority based on order type and timing
   * @private
   */
  static _calculatePriority(order) {
    // Simple heuristic (can be enhanced)
    if (order.orderType === 'delivery') return 'high';
    if (order.orderType === 'takeaway') return 'normal';
    return 'normal';
  }

  /**
   * Extract role category from user (matches OrderStateMachineService.resolveActor pattern)
   * @private
   */
  static _extractRoleCategory(user) {
    if (!user || !user.role) {
      throw new AppError('User role not found or not populated', 403);
    }

    const role = user.role;

    // Check system roles first (like OrderStateMachineService does)
    if (role.isSystemRole || role.name === 'SUPER-ADMIN') {
      return 'superAdmin';
    }

    // Use UPPERCASE for consistency with OrderStateMachineService
    const name = (role.name || '').toUpperCase();

    if (name.includes('KITCHEN') || name.includes('COOK') || name.includes('CHEF')) {
      return 'kitchen';
    }

    if (name.includes('WAITER') || name.includes('SERVER')) {
      return 'waiter';
    }

    if (name.includes('ADMIN') || name === 'SUPER-MERCHANT-ADMIN') {
      return 'admin';
    }

    // FAIL CLOSED: Unrecognized role
    throw new AppError(
      `User role not recognized. Role name: '${role.name || 'undefined'}', Role._id: ${role._id || 'undefined'}`,
      403
    );
  }

  /**
   * Emit Socket.IO events for real-time KDS updates
   * @private
   */
  static _emitTicketEvents(eventName, tickets, branchId) {
    try {
      const io = getIo();
      
      for (const ticket of tickets) {
        const stationRoom = `branch:${branchId}:station:${ticket.station}`;
        const branchRoom = `branch:${branchId}`;

        io.to(stationRoom).emit(eventName, ticket);
        io.to(branchRoom).emit(eventName, ticket);

        logger.debug('kds.emit.success', {
          eventName,
          ticketId: ticket._id,
          stationRoom,
        });
      }
    } catch (error) {
      // Socket.io not initialized (e.g., in tests) - skip emission
      logger.debug('kds.emit.skipped', { 
        eventName, 
        reason: error.message 
      });
    }
  }

  /**
   * Get all tickets with filters (for cross-station views)
   * 
   * @param {string} branchId - Branch ID (for tenant isolation)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Tickets
   */
  static async getAllTickets(branchId, options = {}) {
    const { 
      stationId, 
      status, 
      statuses = ['pending', 'accepted', 'in_progress', 'ready'],
      limit = 100 
    } = options;

    const query = { branch: branchId };

    // Filter by station if provided
    if (stationId) {
      query.station = stationId;
    }

    // Filter by status (single or multiple)
    if (status) {
      query.status = status;
    } else {
      query.status = { $in: statuses };
    }

    const tickets = await KitchenTicket.find(query)
      .populate('station', 'name code color')
      .populate('order', 'orderNumber orderType tableNumber')
      .populate('assignedTo', 'name')
      .sort({ priority: -1, createdAt: 1 })
      .limit(limit)
      .lean();

    return tickets;
  }

  /**
   * Get active tickets for a station (for KDS dashboard)
   * 
   * @param {string} stationIdOrCode - Station ObjectId OR station code (e.g., "GRILL", "cat_01")
   * @param {string} branchId - Branch ID (for tenant isolation)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Tickets
   */
  static async getActiveTickets(stationIdOrCode, branchId, options = {}) {
    const { 
      statuses = ['pending', 'accepted', 'in_progress', 'ready'],
      includeCompleted = false 
    } = options;

    // Resolve station: Try to find by code first, then fall back to ObjectId
    let stationId = stationIdOrCode;

    // If not a valid ObjectId format, treat as station code
    if (!mongoose.Types.ObjectId.isValid(stationIdOrCode)) {
      const station = await KitchenStation.findOne({
        code: stationIdOrCode.toUpperCase(),
        branch: branchId,
      }).select('_id');

      if (!station) {
        throw new AppError(`Kitchen station not found with code: ${stationIdOrCode}`, 404);
      }

      stationId = station._id;
    } else {
      // Valid ObjectId - verify station exists
      const station = await KitchenStation.findOne({
        _id: stationIdOrCode,
        branch: branchId,
      }).select('_id');

      if (!station) {
        throw new AppError(`Kitchen station not found with ID: ${stationIdOrCode}`, 404);
      }
    }

    // ✅ Build query: exclude completed tickets unless explicitly requested
    const query = {
      station: stationId,
      branch: branchId,
    };

    if (includeCompleted) {
      query.status = { $in: [...statuses, 'completed'] };
    } else {
      query.status = { $in: statuses };
    }

    const tickets = await KitchenTicket.find(query)
      .populate('station', 'name code color')
      .populate('order', 'orderNumber orderType tableNumber')
      .populate('assignedTo', 'name')
      .sort({ priority: -1, createdAt: 1 })
      .lean();

    return tickets;
  }

  /**
   * Get all kitchen stations for a branch
   * 
   * @param {string} branchId - Branch ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Stations
   */
  static async getAllStations(branchId, options = {}) {
    const { includeInactive = false } = options;

    const query = { branch: branchId };

    if (!includeInactive) {
      query.isActive = true;
    }

    const stations = await KitchenStation.find(query)
      .sort({ displayOrder: 1, name: 1 })
      .lean();

    return stations;
  }

  /**
   * Get a single kitchen station by ID or code
   * 
   * @param {string} stationIdOrCode - Station ObjectId or code
   * @param {string} branchId - Branch ID (for tenant isolation)
   * @returns {Promise<Object>} Station
   */
  static async getStationById(stationIdOrCode, branchId) {
    let station;

    // Try to find by ObjectId first
    if (mongoose.Types.ObjectId.isValid(stationIdOrCode)) {
      station = await KitchenStation.findOne({
        _id: stationIdOrCode,
        branch: branchId,
      }).lean();
    }

    // If not found, try by code
    if (!station) {
      station = await KitchenStation.findOne({
        code: stationIdOrCode.toUpperCase(),
        branch: branchId,
      }).lean();
    }

    if (!station) {
      throw new AppError('Kitchen station not found', 404);
    }

    return station;
  }

  /**
   * Create a new kitchen station
   * 
   * @param {Object} data - Station data
   * @param {string} merchantId - Merchant ID
   * @param {string} branchId - Branch ID
   * @returns {Promise<Object>} Created station
   */
  static async createStation(data, merchantId, branchId) {
    const { name, code, description, displayOrder } = data;

    // Check if code already exists in this branch
    const existing = await KitchenStation.findOne({
      code: code.toUpperCase(),
      branch: branchId,
    });

    if (existing) {
      throw new AppError(
        `Station code '${code}' already exists in this branch`,
        400
      );
    }

    const station = await KitchenStation.create({
      merchant: merchantId,
      branch: branchId,
      name,
      code: code.toUpperCase(),
      description: description || '',
      displayOrder: displayOrder || 0,
      isActive: true,
    });

    logger.info('kds.station.created', {
      stationId: station._id,
      code: station.code,
      branchId,
    });

    return station;
  }

  /**
   * Update a kitchen station
   * 
   * @param {string} stationId - Station ID
   * @param {Object} data - Update data
   * @param {string} branchId - Branch ID (for tenant isolation)
   * @returns {Promise<Object>} Updated station
   */
  static async updateStation(stationId, data, branchId) {
    const station = await KitchenStation.findOne({
      _id: stationId,
      branch: branchId,
    });

    if (!station) {
      throw new AppError('Kitchen station not found', 404);
    }

    // If code is being changed, check for conflicts
    if (data.code && data.code.toUpperCase() !== station.code) {
      const existing = await KitchenStation.findOne({
        code: data.code.toUpperCase(),
        branch: branchId,
        _id: { $ne: stationId },
      });

      if (existing) {
        throw new AppError(
          `Station code '${data.code}' already exists in this branch`,
          400
        );
      }

      station.code = data.code.toUpperCase();
    }

    // Update allowed fields
    if (data.name !== undefined) station.name = data.name;
    if (data.description !== undefined) station.description = data.description;
    if (data.displayOrder !== undefined) station.displayOrder = data.displayOrder;
    if (data.isActive !== undefined) station.isActive = data.isActive;

    await station.save();

    logger.info('kds.station.updated', {
      stationId: station._id,
      code: station.code,
    });

    return station;
  }

  /**
   * Delete a kitchen station (soft delete - mark as inactive)
   * 
   * @param {string} stationId - Station ID
   * @param {string} branchId - Branch ID (for tenant isolation)
   * @returns {Promise<Object>} Result
   */
  static async deleteStation(stationId, branchId) {
    const station = await KitchenStation.findOne({
      _id: stationId,
      branch: branchId,
    });

    if (!station) {
      throw new AppError('Kitchen station not found', 404);
    }

    // Check if station has active tickets
    const activeTickets = await KitchenTicket.countDocuments({
      station: stationId,
      status: { $in: ['pending', 'accepted', 'in_progress'] },
    });

    if (activeTickets > 0) {
      throw new AppError(
        `Cannot delete station with ${activeTickets} active tickets. Complete or cancel them first.`,
        400
      );
    }

    // Soft delete - mark as inactive instead of removing
    station.isActive = false;
    await station.save();

    logger.info('kds.station.deleted', {
      stationId: station._id,
      code: station.code,
    });

    return {
      message: 'Station deactivated successfully',
      station,
    };
  }

  /**
   * Assign or remove kitchen station for a menu item
   * 
   * @param {string} menuItemId - Menu item ID
   * @param {string|null} stationId - Station ID or null to remove assignment
   * @param {string} merchantId - Merchant ID (for validation)
   * @param {string} branchId - Branch ID (for validation)
   * @returns {Promise<Object>} Updated menu item
   */
  static async assignMenuItemStation(menuItemId, stationId, merchantId, branchId) {
    const Menu = require('../../menu/model/MenuItem.model');

    // Get menu item
    const menuItem = await Menu.findOne({
      _id: menuItemId,
      merchant: merchantId,
    });

    if (!menuItem) {
      throw new AppError('Menu item not found', 404);
    }

    // If removing station assignment
    if (stationId === null || stationId === undefined) {
      menuItem.kitchenStation = null;
      await menuItem.save();

      logger.info('kds.menu-station.removed', {
        menuItemId,
        menuItemName: menuItem.name,
      });

      return {
        message: 'Kitchen station removed from menu item',
        menuItem: {
          _id: menuItem._id,
          name: menuItem.name,
          kitchenStation: null,
        },
      };
    }

    // Validate station exists and belongs to same merchant/branch
    const station = await KitchenStation.findOne({
      _id: stationId,
      merchant: merchantId,
      branch: branchId,
    });

    if (!station) {
      throw new AppError(
        'Kitchen station not found or does not belong to your branch',
        404
      );
    }

    // Validate station is active
    if (!station.isActive) {
      throw new AppError('Cannot assign an inactive station to a menu item', 400);
    }

    // Assign station
    menuItem.kitchenStation = stationId;
    await menuItem.save();

    logger.info('kds.menu-station.assigned', {
      menuItemId,
      menuItemName: menuItem.name,
      stationId,
      stationCode: station.code,
    });

    return {
      message: 'Kitchen station assigned to menu item',
      menuItem: {
        _id: menuItem._id,
        name: menuItem.name,
        kitchenStation: {
          _id: station._id,
          code: station.code,
          name: station.name,
        },
      },
    };
  }

  /**
   * Recompute ticket status from its item statuses
   * Rule: Ticket status is ALWAYS derived from children - never set directly
   * 
   * @param {Object} ticket - Ticket document
   * @param {Object} session - MongoDB session for transactions (optional)
   * @returns {Promise<Object>} { statusChanged, oldStatus?, newStatus? }
   */
  static async recomputeTicketStatus(ticket, session = null) {
    const items = ticket.items;
    
    if (items.length === 0) {
      return { statusChanged: false };
    }

    const oldStatus = ticket.status;
    let newStatus = oldStatus;

    const allReady = items.every(i => i.status === 'ready');
    const anyInProgress = items.some(i => i.status === 'in_progress');

    if (allReady) {
      // All items ready → ticket ready
      newStatus = 'ready';
      if (!ticket.readyAt) {
        ticket.readyAt = new Date();
      }
    } else if (anyInProgress) {
      // At least one item in progress → ticket in_progress
      newStatus = 'in_progress';
    } else {
      // All items pending → ticket pending
      newStatus = 'pending';
    }

    if (newStatus !== oldStatus) {
      ticket.status = newStatus;
      await ticket.save({ session });

      logger.info('kds.ticket.status-recomputed', {
        ticketId: ticket._id,
        oldStatus,
        newStatus,
        itemCount: items.length,
      });

      return { statusChanged: true, oldStatus, newStatus };
    }

    return { statusChanged: false };
  }

  /**
   * Get all tickets for an order (for order detail view)
   * 
   * @param {string} orderId - Order ID
   * @returns {Promise<Array>} Tickets
   */
  static async getTicketsForOrder(orderId) {
    const tickets = await KitchenTicket.find({ order: orderId })
      .populate('station', 'name slug color')
      .populate('assignedTo', 'name')
      .sort({ createdAt: 1 })
      .lean();

    return tickets;
  }

  /**
   * Update status of a specific item within a ticket
   * Allows kitchen staff to mark individual items as started or completed
   * 
   * @param {string} ticketId - Ticket ID
   * @param {string} itemId - Item _id within the ticket
   * @param {string} newStatus - New status: 'pending' | 'in_progress' | 'ready'
   * @param {Object} actor - { id, role }
   * @returns {Promise<Object>} Updated ticket
   */
  static async updateTicketItemStatus(ticketId, itemId, newStatus, actor) {
    // Validate status
    const validStatuses = ['pending', 'in_progress', 'ready'];
    if (!validStatuses.includes(newStatus)) {
      throw new AppError(
        `Invalid item status. Must be one of: ${validStatuses.join(', ')}`,
        400
      );
    }

    const session = await mongoose.startSession();
    let result = null;
    let ticketItemData = null;
    let orderItemData = null;

    try {
      await session.withTransaction(async () => {
        // Get ticket with session lock
        const ticket = await KitchenTicket.findById(ticketId).session(session);
        if (!ticket) {
          throw new AppError('Ticket not found', 404);
        }

        // Find item within ticket
        const item = ticket.items.id(itemId);
        if (!item) {
          throw new AppError('Item not found in ticket', 404);
        }

        const oldStatus = item.status;

        // Don't update if status is the same
        if (oldStatus === newStatus) {
          result = { noop: true, ticket };
          return;
        }

        // Update item status and timestamps
        item.status = newStatus;
        
        if (newStatus === 'in_progress' && !item.startedAt) {
          item.startedAt = new Date();
        }
        
        if (newStatus === 'ready' && !item.completedAt) {
          item.completedAt = new Date();
        }

        // Store for later event emission
        ticketItemData = { ticket, item: { ...item.toObject() }, oldStatus, newStatus };

        // Recompute overall ticket status from all items
        await this.recomputeTicketStatus(ticket, session);

        // Save ticket within transaction
        await ticket.save({ session });

        logger.info('kds.ticket-item.status-updated', {
          ticketId,
          itemId,
          oldStatus,
          newStatus,
          ticketStatus: ticket.status,
          actorId: actor.id,
          actorRole: actor.role,
          transaction: 'active',
        });

        // Sync to order item if status changed to ready or in_progress
        if (newStatus === 'ready' || newStatus === 'in_progress') {
          orderItemData = await this._syncTicketItemToOrder(ticket, item, newStatus, session);
        }

        result = { noop: false, ticket };
      });
    } finally {
      await session.endSession();
    }

    // AFTER transaction: Emit socket events
    if (!result.noop && ticketItemData) {
      const { StatusSyncService } = require('../../order/service/StatusSyncService');
      const ticket = await KitchenTicket.findById(ticketId);  // Reload fresh
      const order = await Order.findById(ticket.order);        // Reload fresh

      if (order) {
        // Emit both ticket and order events via StatusSyncService
        await StatusSyncService.afterTicketItemChange(
          ticket,
          ticketItemData.item,
          order,
          orderItemData?.item || null,
          null
        );
      }

      // Also emit kitchen-specific ticket event
      const io = getIo();
      if (io) {
        io.to(`branch:${order.branch}:station:${ticket.station}`).emit('ticket:item-updated', {
          ticketId: ticket._id,
          itemId,
          status: ticketItemData.newStatus,
          ticketStatus: ticket.status,
          startedAt: ticketItemData.item.startedAt,
          completedAt: ticketItemData.item.completedAt,
        });
      }
    }

    return result?.ticket || { noop: true };
  }

  /**
   * Sync a single ticket item status to its corresponding order item
   * Called within a transaction to ensure atomicity
   * 
   * @private
   * @param {KitchenTicket} ticket - The ticket containing the item
   * @param {Object} ticketItem - The ticket item that changed
   * @param {string} newStatus - The new status
   * @param {ClientSession} session - MongoDB session for transaction
   */
  static async _syncTicketItemToOrder(ticket, ticketItem, newStatus, session) {
    const { ItemStatusService } = require('../../order/service/ItemStatusService');

    // Fetch order with session lock
    const order = await Order.findById(ticket.order).session(session);

    if (!order) {
      throw new AppError('Order not found for ticket', 404);
    }

    // Find the corresponding order item
    const orderItem = order.items.id(ticketItem.orderItemId);

    if (!orderItem) {
      // Item not found - this is a data integrity error that must abort the transaction
      const err = new AppError(
        `Order item ${ticketItem.orderItemId} not found for ticket item ${ticketItem._id}`,
        500
      );
      logger.error('kds.sync-to-order.item-not-found', {
        ticketId: ticket._id.toString(),
        ticketItemId: ticketItem._id.toString(),
        orderItemId: ticketItem.orderItemId.toString(),
        error: err.message,
      });
      throw err; // Must throw to trigger transaction rollback
    }

    const oldOrderItemStatus = orderItem.status;

    // Validate and apply transition
    try {
      const { noop } = ItemStatusService.validateTransition(orderItem.status, newStatus);
      
      if (!noop) {
        orderItem.status = newStatus;
        
        logger.debug('kds.sync-to-order.updating', {
          ticketId: ticket._id.toString(),
          ticketItemId: ticketItem._id.toString(),
          orderItemId: orderItem._id.toString(),
          oldStatus: oldOrderItemStatus,
          newStatus,
        });

        // Recompute order status after item change
        await ItemStatusService.recomputeOrderStatus(order, session);
        
        // Save order within transaction
        await order.save({ session });

        logger.info('kds.sync-to-order.success', {
          ticketId: ticket._id.toString(),
          ticketItemId: ticketItem._id.toString(),
          orderItemId: orderItem._id.toString(),
          newStatus,
          orderStatus: order.status,
        });
      }

      // Return updated order item for event emission
      return { item: { ...orderItem.toObject() }, order };
    } catch (err) {
      logger.error('kds.sync-to-order.failed', {
        ticketId: ticket._id.toString(),
        orderItemId: orderItem._id.toString(),
        currentStatus: orderItem.status,
        targetStatus: newStatus,
        error: err.message,
      });
      throw err; // Re-throw to trigger transaction rollback
    }
  }

  /**
   * Get ticket history (completed tickets)
   * 
   * @param {ObjectId} branchId - Branch ID
   * @param {ObjectId} merchantId - Merchant ID
   * @param {Object} filters - { stationId?, startDate?, endDate? }
   * @returns {Array} Completed tickets
   */
  static async getTicketHistory(branchId, merchantId, filters = {}) {
    const { stationId, startDate, endDate } = filters;

    const query = {
      branch: branchId,
      merchant: merchantId,
      status: 'completed',
    };

    if (stationId) {
      query.station = stationId;
    }

    if (startDate || endDate) {
      query.completedAt = {};
      if (startDate) query.completedAt.$gte = startDate;
      if (endDate) query.completedAt.$lte = endDate;
    }

    const tickets = await KitchenTicket.find(query)
      .populate('order', 'orderNumber orderType tableNumber')
      .populate('station', 'name code color')
      .sort({ completedAt: -1 })
      .limit(100)  // Pagination in production
      .lean();

    return tickets;
  }
}

module.exports = KitchenTicketService;
