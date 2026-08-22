// src/modules/kitchen/service/KitchenTicketService.js
// ✅ PHASE 1: Kitchen Ticket lifecycle management with RBAC-guarded transitions
const mongoose = require('mongoose');
const KitchenTicket = require('../../../../models/KitchenTicket');
const KitchenStation = require('../../../../models/KitchenStation');
const Order = require('../../../../models/orderModel');
const AppError = require('../../../../utils/appError');
const logger = require('../../../../utils/logger');
const { getIo } = require('../../../../socket');

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
    console.log('DEBUG order.items[0]:', JSON.stringify(order.items[0]));
console.log('DEBUG order.items[0]._id:', order.items[0]?._id);
console.log('DEBUG order.items[0]._id type:', typeof order.items[0]?._id);

    // Group items by kitchen station
    const itemsByStation = new Map();

    for (const orderItem of order.items) {
      const menuItem = orderItem.menuItem; // Now correctly references the populated menuItem
      
      if (!menuItem) {
        logger.warn('kds.create-tickets.missing-menu-item', {
          orderId,
          orderItemId: orderItem._id,
        });
        continue;
      }

      const stationId = menuItem.kitchenStation;

      // Skip items that don't require kitchen prep (e.g., bottled drinks)
      if (!stationId) {
        logger.debug('kds.create-tickets.skip-no-station', {
          orderId,
          menuItemId: menuItem._id,
          menuItemName: menuItem.name,
        });
        continue;
      }

      if (!itemsByStation.has(stationId.toString())) {
        itemsByStation.set(stationId.toString(), []);
      }

      itemsByStation.get(stationId.toString()).push({
        orderItemId: orderItem._id,
        menuItem: menuItem._id,
        menuItemName: menuItem.name,
        quantity: orderItem.quantity,
        notes: orderItem.specialInstructions || orderItem.notes,
        status: 'pending',
      });
    }

    // No kitchen items? Log and return empty
    if (itemsByStation.size === 0) {
      logger.info('kds.create-tickets.no-kitchen-items', { orderId });
      return [];
    }

    // Create one ticket per station
    const tickets = [];

    for (const [stationId, items] of itemsByStation) {
      const ticketNumber = await this._getNextTicketNumber(stationId, order.branch, session);

      const ticketData = {
        merchant: order.merchant,
        branch: order.branch,
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

    // Emit Socket.IO events for real-time KDS updates
    this._emitTicketEvents('ticket:created', tickets, order.branch);

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

        // 8. Check if all tickets for this order are ready → transition order
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
    const { statuses = ['pending', 'accepted', 'in_progress', 'ready'] } = options;

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

    const tickets = await KitchenTicket.find({
      station: stationId,
      branch: branchId,
      status: { $in: statuses },
    })
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
}

module.exports = KitchenTicketService;
