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
           * 10. Cancellation
           */
          if (
            toStatus === 'canceled'
          ) {
            order.canceledReason =
              reason ||
              'Order canceled';

            order.canceledBy =
              userId;
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
            
            await OutboxEvent.create(
              [
                {
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
                },
              ],
              { session }
            );

            logger.info('kds.outbox.order-preparing.queued', {
              orderId: order._id.toString(),
            });
          }

          result = {
            order,
            previousStatus,
            noop: false,
          };
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
       * Send email notifications for important status transitions:
       * - ready: Order is ready for pickup/delivery
       * - served: Order has been served (dine-in)
       * - out_for_delivery: Order is on its way
       * - delivered: Order has been delivered
       * - completed: Order is complete
       * 
       * Email sending happens after transaction commit and is non-blocking.
       */
      if (!result.noop && toStatus) {
        const statusesWithEmail = ['ready', 'served', 'out_for_delivery', 'delivered', 'completed'];
        
        if (statusesWithEmail.includes(toStatus)) {
          // Run email sending asynchronously without blocking response
          setImmediate(async () => {
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

                // Send status update email (non-blocking)
                await mailerService.sendOrderStatusUpdate(order.customer.email, statusData);

                logger.info('Order status update email sent', {
                  orderId: order._id,
                  orderNumber: order.orderNumber,
                  customerEmail: order.customer.email,
                  status: toStatus,
                });
              }
            } catch (emailError) {
              // Log error but don't fail the status transition
              logger.error('Failed to send order status update email', {
                orderId: result.order?._id,
                orderNumber: result.order?.orderNumber,
                status: toStatus,
                error: emailError.message,
                stack: emailError.stack,
              });
            }
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