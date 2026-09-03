const mongoose = require('mongoose');
const Order = require('../../../../models/orderModel');
const AppError = require('../../../../utils/appError');
const logger = require('../../../../utils/logger');
const { NotificationService } = require('../../notifications/notification.service');

/**
 * Canonical workflow transitions (single source of truth).
 */
const TRANSITIONS = {
  pending: ['accepted', 'canceled'],

  accepted: [
    'preparing',
    'canceled',
  ],

  preparing: [
    'ready',
    'canceled',
  ],

  /**
   * ready can branch depending on order type:
   *
   * dine_in / takeaway:
   * ready -> served
   *
   * delivery:
   * ready -> out_for_delivery
   */
  ready: [
    'served',
    'out_for_delivery',
    'canceled',
  ],

  /**
   * Delivery only
   */
  out_for_delivery: [
    'delivered',
    'canceled',
  ],

  /**
   * Delivery only
   */
  delivered: [
    'completed',
  ],

  served: [
    'completed',
  ],

  completed: [],

  canceled: [],
};

const TERMINAL_STATUSES = new Set([
  'completed',
  'canceled',
]);

/**
 * Role categories used for transition guards.
 *
 * @typedef {'superAdmin'|'admin'|'kitchen'|'waiter'|'customer'} RoleCategory
 */

/**
 * Transition permissions.
 */
const TRANSITION_ROLE_PERMISSIONS = {
  // Pending
  'pending->accepted': [
    'waiter',
    'admin',
    'superAdmin',
    'system', // Automated order routing (Step 3)
  ],

  'pending->canceled': [
    'waiter',
    'admin',
    'superAdmin',
    'customer',
  ],

  // Accepted
  'accepted->preparing': [
    'kitchen',
    'admin',
    'superAdmin',
    'system', // Automated order routing (Step 3)
  ],

  'accepted->canceled': [
    'waiter',
    'admin',
    'superAdmin',
  ],

  // Preparing
  'preparing->ready': [
    'kitchen',
    'admin',
    'superAdmin',
    'system', // Automated KDS ready rollup
  ],

  'preparing->canceled': [
    'kitchen',
    'waiter',
    'admin',
    'superAdmin',
  ],

  // Ready -> dine-in / takeaway
  'ready->served': [
    'waiter',
    'admin',
    'superAdmin',
  ],

  // Ready -> delivery
  'ready->out_for_delivery': [
    'waiter',
    'admin',
    'superAdmin',
  ],

  // Delivery
  'out_for_delivery->delivered': [
    'waiter',
    'admin',
    'superAdmin',
  ],

  // Completed
  'served->completed': [
    'waiter',
    'admin',
    'superAdmin',
  ],

  'delivered->completed': [
    'waiter',
    'admin',
    'superAdmin',
  ],

  // Cancellations
  'ready->canceled': [
    'waiter',
    'admin',
    'superAdmin',
  ],

  'out_for_delivery->canceled': [
    'waiter',
    'admin',
    'superAdmin',
  ],
};

class OrderStateMachineService {
  static TRANSITIONS = TRANSITIONS;

  /**
   * Validate whether a transition is structurally allowed.
   *
   * @param {string} fromStatus
   * @param {string} toStatus
   * @throws {AppError}
   */
  static validateTransition(fromStatus, toStatus) {
    if (fromStatus === toStatus) {
      return {
        noop: true,
      };
    }

    if (TERMINAL_STATUSES.has(fromStatus)) {
      throw new AppError(
        `Cannot transition from terminal status "${fromStatus}"`,
        400
      );
    }

    const allowed = TRANSITIONS[fromStatus];

    if (!allowed || !allowed.includes(toStatus)) {
      throw new AppError(
        `Cannot transition from ${fromStatus} to ${toStatus}`,
        400
      );
    }

    return {
      noop: false,
    };
  }

  /**
   * Validate whether the actor's role can perform the transition.
   *
   * @param {string} fromStatus
   * @param {string} toStatus
   * @param {RoleCategory} roleCategory
   */
  static assertRolePermission(
    fromStatus,
    toStatus,
    roleCategory
  ) {
    if (fromStatus === toStatus) {
      return;
    }

    const key = `${fromStatus}->${toStatus}`;

    const allowed =
      TRANSITION_ROLE_PERMISSIONS[key];

    if (!allowed) {
      throw new AppError(
        `Transition ${key} is not permitted`,
        403
      );
    }

    if (!allowed.includes(roleCategory)) {
      throw new AppError(
        `Your role cannot transition orders from ${fromStatus} to ${toStatus}`,
        403
      );
    }
  }

  /**
   * Resolve actor and role.
   *
   * @param {import('mongoose').Document|null} user
   * @param {{ actorType?: string, customerId?: string }} options
   */
  static resolveActor(user, options = {}) {
    // System actor (for automated transitions like KDS ready rollup)
    if (
      !user &&
      options.actorType === 'system'
    ) {
      return {
        userId: null,
        roleCategory: 'system',
      };
    }

    // Customer actor (for customer-initiated orders)
    if (
      !user &&
      options.actorType === 'customer'
    ) {
      return {
        userId: options.customerId || null,
        roleCategory: 'customer',
      };
    }

    if (!user) {
      throw new AppError(
        'Actor context is required',
        401
      );
    }

    const role = user.role;

    if (
      role?.isSystemRole ||
      role?.name === 'SUPER-ADMIN'
    ) {
      return {
        userId: user._id,
        roleCategory: 'superAdmin',
      };
    }

    const name = (
      role?.name || ''
    ).toUpperCase();

    if (name.includes('KITCHEN')) {
      return {
        userId: user._id,
        roleCategory: 'kitchen',
      };
    }

    if (name.includes('WAITER')) {
      return {
        userId: user._id,
        roleCategory: 'waiter',
      };
    }

    if (
      name.includes('ADMIN') ||
      name === 'SUPER-MERCHANT-ADMIN'
    ) {
      return {
        userId: user._id,
        roleCategory: 'admin',
      };
    }

    // FAIL CLOSED: Unrecognized or unpopulated role
    throw new AppError(
      `User role not recognized or not populated. Role name: '${role?.name || 'undefined'}', Role._id: ${role?._id || 'undefined'}`,
      403
    );
  }

  /**
   * Append transition history.
   *
   * @param {import('mongoose').Document} order
   * @param {string} toStatus
   * @param {import('mongoose').Types.ObjectId|null} changedBy
   * @param {string|null} reason
   */
  static appendTransitionHistory(
    order,
    toStatus,
    changedBy,
    reason = null
  ) {
    const fromStatus = order.status;

    if (!order.statusHistory) {
      order.statusHistory = [];
    }

    order.statusHistory.push({
      fromStatus,
      toStatus,
      changedBy,
      changedAt: new Date(),
      reason: reason || undefined,
    });
  }

  /**
   * Apply normal order status timestamps.
   */
  static applyStatusTimestamps(
    order,
    toStatus
  ) {
    if (toStatus === 'accepted') {
      order.acceptedAt = new Date();
    }

    if (toStatus === 'ready') {
      order.readyAt = new Date();
    }

    if (toStatus === 'served') {
      order.servedAt = new Date();
    }

    if (toStatus === 'completed') {
      order.completedAt = new Date();
    }

    if (toStatus === 'canceled') {
      order.canceledAt = new Date();

      if (
        !order.canceledBy &&
        order.statusHistory?.length
      ) {
        const last =
          order.statusHistory[
            order.statusHistory.length - 1
          ];

        order.canceledBy =
          last.changedBy;
      }
    }
  }

  /**
   * Apply delivery-specific timestamps.
   *
   * ready
   *   ↓
   * out_for_delivery
   *   → dispatchedAt
   *
   * out_for_delivery
   *   ↓
   * delivered
   *   → deliveredAt
   */
  static applyDeliveryStatusTimestamps(
    order,
    toStatus
  ) {
    if (order.orderType !== 'delivery') {
      return;
    }

    if (!order.delivery) {
      order.delivery = {};
    }

    if (
      toStatus === 'out_for_delivery'
    ) {
      order.delivery.dispatchedAt =
        new Date();
    }

    if (
      toStatus === 'delivered'
    ) {
      order.delivery.deliveredAt =
        new Date();
    }
  }

  /**
   * Validate that delivery-only statuses are only
   * used by delivery orders.
   */
  static assertDeliveryStatus(
    order,
    toStatus
  ) {
    const deliveryStatuses = [
      'out_for_delivery',
      'delivered',
    ];

    if (
      deliveryStatuses.includes(toStatus) &&
      order.orderType !== 'delivery'
    ) {
      throw new AppError(
        `Order ${order.orderNumber} is not a delivery order`,
        400
      );
    }
  }

  /**
   * Queue notifications.
   */
  static async queueTransitionNotifications(
    {
      order,
      previousStatus,
      toStatus,
    },
    session
  ) {
    await NotificationService.notifyOrderStatusUpdated(
      {
        order,
        previousStatus,
      },
      session
    );

    if (toStatus === 'canceled') {
      await NotificationService.notifyOrderCanceled(
        {
          order,
        },
        session
      );
    }
  }

  /**
   * Transaction-safe status transition.
   *
   * @param {Object} params
   * @param {string} params.orderId
   * @param {string} params.toStatus
   * @param {Object} params.merchantQuery
   * @param {import('mongoose').Document|null} params.user
   * @param {string} [params.reason]
   * @param {import('mongoose').Types.ObjectId} [params.assignedWaiter]
   * @param {import('mongoose').Types.ObjectId} [params.assignedKitchenStaff]
   * @param {string} [params.actorType]
   * @param {import('mongoose').Types.ObjectId} [params.customerId]
   */
  static async transitionOrderStatus(
    params
  ) {
    const {
      orderId,
      toStatus,
      merchantQuery,
      user,
      reason,
      assignedWaiter,
      assignedKitchenStaff,
      actorType,
      customerId,
    } = params;
  // console.error('MARKER-12345-TOP-OF-FUNCTION');
    const {
      userId,
      roleCategory,
    } =
      OrderStateMachineService.resolveActor(
        user,
        {
          actorType,
          customerId,
        }
      );

    const session =
      await mongoose.startSession();

    let result;

    try {
      await session.withTransaction(
        async () => {
          const order =
            await Order.findOne({
              ...merchantQuery,
              _id: orderId,
            }).session(session);

          if (!order) {
            throw new AppError(
              'Order not found',
              404
            );
          }

          const previousStatus =
            order.status;

          /**
           * 1. Structural transition validation
           */
          const validation =
            OrderStateMachineService.validateTransition(
              previousStatus,
              toStatus
            );

          /**
           * Same status = nothing to do.
           */
          if (validation.noop) {
            result = {
              order,
              previousStatus,
              noop: true,
            };

            return;
          }

          /**
           * 2. Validate role permission
           */
          OrderStateMachineService.assertRolePermission(
            previousStatus,
            toStatus,
            roleCategory
          );

          /**
           * 3. Validate delivery-specific states
           */
          OrderStateMachineService.assertDeliveryStatus(
            order,
            toStatus
          );

          /**
           * 4. Change status
           */
          order.status = toStatus;

          /**
           * 5. Normal timestamps
           */
          OrderStateMachineService.applyStatusTimestamps(
            order,
            toStatus
          );

          /**
           * 6. Delivery timestamps
           */
          OrderStateMachineService.applyDeliveryStatusTimestamps(
            order,
            toStatus
          );

          /**
           * 7. History
           *
           * Important:
           * append history BEFORE changing status would
           * be required to capture the old status.
           *
           * Since we already changed order.status above,
           * pass previousStatus manually.
           */
          if (!order.statusHistory) {
            order.statusHistory = [];
          }

          order.statusHistory.push({
            fromStatus: previousStatus,
            toStatus,
            changedBy: userId,
            changedAt: new Date(),
            reason:
              reason || undefined,
          });

          /**
           * 8. Assign waiter
           */
          if (assignedWaiter) {
            order.assignedWaiter =
              assignedWaiter;
          }

          /**
           * 9. Assign kitchen staff
           */
          if (assignedKitchenStaff) {
            order.assignedKitchenStaff =
              assignedKitchenStaff;
          }

          /**
           * 10. Table availability (dine-in orders)
           * 
           * Free table when order reaches terminal status (completed or canceled).
           * This ensures tables are returned to 'available' status regardless of
           * which path the order took to completion (payment or state machine).
           */
          if (
            (toStatus === 'completed' || toStatus === 'canceled') &&
            order.orderType === 'dine_in' &&
            order.table
          ) {
            const Table = require('../../../../models/tabelModel');
            const CustomerSession = require('../../../../models/customerSessionModule');

            // End active customer session for this table
            await CustomerSession.updateMany(
              {
                merchant: order.merchant,
                tableId: order.table,
                isActive: true,
              },
              {
                $set: { isActive: false },
              },
              { session }
            );

            // Free the table
            const table = await Table.findOne({
              _id: order.table,
              merchant: order.merchant,
            }).session(session);

            if (table) {
              table.status = 'available';
              await table.save({ session });

              logger.info('order.table.freed', {
                orderId: order._id.toString(),
                orderNumber: order.orderNumber,
                tableId: table._id.toString(),
                tableNumber: table.tableNumber,
                toStatus,
              });
            }
          }

          /**
           * 11. Cancellation
           */
          if (
            toStatus === 'canceled'
          ) {
            order.canceledReason =
              reason ||
              'Order canceled';

            order.canceledBy =
              userId;

            // Cancel all non-terminal KDS tickets for this order inside
            // the same transaction so the KDS screen reflects the cancellation.
            const KitchenTicket = require('../../../../models/KitchenTicket');
            await KitchenTicket.updateMany(
              {
                order: order._id,
                status: { $nin: ['completed', 'canceled'] },
              },
              {
                $set: {
                  status: 'canceled',
                  canceledAt: new Date(),
                  canceledBy: userId || null,
                  canceledReason: `Order ${order.orderNumber} was canceled`,
                },
              },
              { session }
            );
          }

          /**
           * 11. Save order
           */
          await order.save({
            session,
          });

          /**
           * 12. Notifications / outbox
           */
          await OrderStateMachineService.queueTransitionNotifications(
            {
              order,
              previousStatus,
              toStatus,
            },
            session
          );

          /**
           * ✅ PHASE 1: Queue KDS ticket creation when order enters 'preparing'
           */
          if (toStatus === 'preparing') {

            const OutboxEvent = require('../../../../models/OutboxEvent');
            
            const eventData = {
              aggregateId: order._id,
              aggregateType: 'order',
              eventType: 'order:preparing',
              merchant: order.merchant,
              payload: {
                target: 'room',
                room: `branch:${order.branch}`,
                data: {
                  orderId: order._id,
                  orderNumber: order.orderNumber,
                  orderType: order.orderType,
                },
              },
            };

            logger.info('kds.transition.BEFORE-CREATE', {
              orderId: order._id.toString(),
              hasSession: !!session,
              eventData: JSON.stringify(eventData),
            });

            // Create event with or without session
            if (session) {
              await OutboxEvent.create([eventData], { session });
              logger.info('kds.transition.CREATED-WITH-SESSION', {
                orderId: order._id.toString(),
              });
            } else {
              await OutboxEvent.create(eventData);
              logger.info('kds.transition.CREATED-WITHOUT-SESSION', {
                orderId: order._id.toString(),
              });
            }

            logger.info('kds.outbox.order-preparing.queued', {
              orderId: order._id.toString(),
              hasSession: !!session,
            });
          }

          result = {
            order,
            previousStatus,
            noop: false,
          };

          /**
           * ✅ Item Status Integration: Auto-serve non-cooked items on acceptance
           * 
           * After successful pending → accepted transition:
           * - For dine-in orders only
           * - Auto-serve items with requiresKitchen=false (e.g., bottled drinks)
           * - Items marked as served immediately (servedVia='auto')
           */
          if (toStatus === 'accepted') {
            const { ItemStatusService } = require('./ItemStatusService');
            await ItemStatusService.autoServeNonCookedItems(order, session);
          }

          /**
           * ✅ CRITICAL BUG FIX: DO NOT recompute order status after state machine transitions!
           * 
           * REMOVED: ItemStatusService.recomputeOrderStatus(order, session)
           * 
           * WHY: This caused a race condition bug where:
           * 1. Auto-routing transitions order: pending → accepted (status explicitly set)
           * 2. Recompute sees all items still "pending" → derives status as "preparing"
           * 3. Order saved with status="preparing" instead of "accepted"
           * 4. Next transition (accepted → preparing) becomes NOOP
           * 5. order:preparing event never created → tickets never generated
           * 
           * CORRECT BEHAVIOR:
           * - State machine transitions (accept, cancel, etc.) = EXPLICIT status setting
           * - Item status changes (KDS updates, void, etc.) = IMPLICIT status derivation
           * - Item changes trigger recomputation via ItemStatusService/StatusSyncService
           * - Order transitions should NOT be overridden by item-derived status
           */
          // REMOVED FOR BUG FIX:
          // const { ItemStatusService } = require('./ItemStatusService');
          // await ItemStatusService.recomputeOrderStatus(order, session);
        }
      );

      /**
       * Log transition after successful commit.
       */
      if (!result.noop) {
        logger.info(
          'order.status.transition',
          {
            orderId:
              orderId.toString(),

            fromStatus:
              result.previousStatus,

            toStatus,

            changedBy:
              userId?.toString(),

            roleCategory,

            orderType:
              result.order?.orderType,

            isDelivery:
              result.order?.orderType ===
              'delivery',
          }
        );
      }

      /**
       * Task 16.3: Send status update email after successful transition
       * 
       * ✅ FIXED: Email sending is NOW truly asynchronous and non-blocking.
       * Email is queued for background processing after transaction commits,
       * and response is sent immediately without waiting for email completion.
       * 
       * Important status transitions that trigger email:
       * - ready: Order is ready for pickup/delivery
       * - served: Order has been served (dine-in)
       * - out_for_delivery: Order is on its way
       * - delivered: Order has been delivered
       * - completed: Order is complete
       */
      if (!result.noop && toStatus) {
        const statusesWithEmail = ['ready', 'served', 'out_for_delivery', 'delivered', 'completed'];
        
        if (statusesWithEmail.includes(toStatus)) {
          // Queue email for background processing (fire-and-forget)
          // This ensures email failures don't affect order status transition
          process.nextTick(async () => {
            try {
              const order = result.order;
              
              // Populate customer if needed to access email field
              if (order.customer && !order.populated('customer')) {
                await order.populate('customer');
              }

              // Check if customer email exists
              if (order.customer?.email) {
                const mailerService = require('../../../../utils/mailerService');
                
                // Generate appropriate status message
                const statusMessages = {
                  ready: 'Your order is ready for pickup!',
                  served: 'Your order has been served. Enjoy your meal!',
                  out_for_delivery: 'Your order is out for delivery and will arrive soon!',
                  delivered: 'Your order has been delivered. Thank you for your order!',
                  completed: 'Your order is complete. Thank you for choosing us!'
                };

                const statusData = {
                  orderNumber: order.orderNumber,
                  status: toStatus.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                  message: statusMessages[toStatus] || 'Your order status has been updated.'
                };

                // Send status update email (completely non-blocking)
                await mailerService.sendOrderStatusUpdate(order.customer.email, statusData);

                logger.info('order.email.status_update.sent', {
                  orderId: order._id,
                  orderNumber: order.orderNumber,
                  customerEmail: order.customer.email,
                  status: toStatus,
                });
              }
            } catch (emailError) {
              // Log error but don't fail the status transition
              // Email errors are non-critical and don't block order processing
              logger.error('order.email.status_update.failed', {
                orderId: result.order?._id,
                orderNumber: result.order?.orderNumber,
                status: toStatus,
                error: emailError.message,
              });
            }
          });
        }
      }

      // ✅ PHASE 2: Emit real-time WebSocket event to QR customers after status transition
      if (!result.noop && toStatus && result.order) {
        try {
          const { getIo } = require('../../../infrastructure/websocket/socket-server');
          const io = getIo();
          
          const order = result.order;
          const orderId = order._id.toString();
          const branchId = order.branch?.toString() || order.branch;
          
          // Emit to customers in this order's room (QR customers viewing this order)
          io.to(`order:${orderId}`).emit('order:status_changed', {
            orderId,
            orderNumber: order.orderNumber,
            previousStatus: result.previousStatus,
            status: toStatus,
            timestamp: new Date(),
            orderType: order.orderType,
            table: order.table?.toString(),
          });
          
          logger.info('order.websocket.status_changed.emitted', {
            orderId: orderId,
            orderNumber: order.orderNumber,
            previousStatus: result.previousStatus,
            toStatus,
            broadcastRoom: `order:${orderId}`,
          });
        } catch (socketError) {
          // Don't fail the order status transition if WebSocket broadcast fails
          logger.warn('order.websocket.status_changed.emit_failed', {
            orderId: result.order?._id?.toString(),
            orderNumber: result.order?.orderNumber,
            error: socketError.message,
          });
        }
      }

      return result;
    } finally {
      await session.endSession();
    }
  }
}

module.exports = {
  OrderStateMachineService,
};