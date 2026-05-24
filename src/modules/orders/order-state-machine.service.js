const mongoose = require('mongoose');
const Order = require('../../../models/orderModel');
const AppError = require('../../../utils/appError');
const logger = require('../../../utils/logger');
const { NotificationService } = require('../notifications/notification.service');

/** Canonical workflow transitions (single source of truth). */
const TRANSITIONS = {
  pending: ['accepted', 'canceled'],
  accepted: ['preparing', 'canceled'],
  preparing: ['ready'],
  ready: ['completed'],
  /** Legacy orders may still be in served — allow completion only. */
  served: ['completed'],
};

const TERMINAL_STATUSES = new Set(['completed', 'canceled']);

/**
 * Role categories used for transition guards (maps to merchant role.name).
 * @typedef {'superAdmin'|'admin'|'kitchen'|'waiter'|'customer'} RoleCategory
 */

/** @type {Record<string, RoleCategory[]>} */
const TRANSITION_ROLE_PERMISSIONS = {
  'pending->accepted': ['waiter', 'admin', 'superAdmin'],
  'pending->canceled': ['waiter', 'admin', 'superAdmin', 'customer'],
  'accepted->preparing': ['kitchen', 'admin', 'superAdmin'],
  'accepted->canceled': ['waiter', 'admin', 'superAdmin'],
  'preparing->ready': ['kitchen', 'admin', 'superAdmin'],
  'ready->completed': ['waiter', 'admin', 'superAdmin'],
  'served->completed': ['waiter', 'admin', 'superAdmin'],
};

class OrderStateMachineService {
  static TRANSITIONS = TRANSITIONS;

  /**
   * @param {string} fromStatus
   * @param {string} toStatus
   * @throws {AppError}
   */
  static validateTransition(fromStatus, toStatus) {
    if (fromStatus === toStatus) {
      return { noop: true };
    }

    if (TERMINAL_STATUSES.has(fromStatus)) {
      throw new AppError(`Cannot transition from terminal status "${fromStatus}"`, 400);
    }

    const allowed = TRANSITIONS[fromStatus];
    if (!allowed || !allowed.includes(toStatus)) {
      throw new AppError(`Cannot transition from ${fromStatus} to ${toStatus}`, 400);
    }

    return { noop: false };
  }

  /**
   * @param {string} fromStatus
   * @param {string} toStatus
   * @param {RoleCategory} roleCategory
   */
  static assertRolePermission(fromStatus, toStatus, roleCategory) {
    if (fromStatus === toStatus) return;

    const key = `${fromStatus}->${toStatus}`;
    const allowed = TRANSITION_ROLE_PERMISSIONS[key];

    if (!allowed) {
      throw new AppError(`Transition ${key} is not permitted`, 403);
    }

    if (!allowed.includes(roleCategory)) {
      throw new AppError(
        `Your role cannot transition orders from ${fromStatus} to ${toStatus}`,
        403
      );
    }
  }

  /**
   * @param {import('mongoose').Document|null} user
   * @param {{ actorType?: string, customerId?: string }} [options]
   * @returns {{ userId: import('mongoose').Types.ObjectId|null, roleCategory: RoleCategory }}
   */
  static resolveActor(user, options = {}) {
    if (!user && options.actorType === 'customer') {
      return {
        userId: options.customerId || null,
        roleCategory: 'customer',
      };
    }

    if (!user) {
      throw new AppError('Actor context is required', 401);
    }

    const role = user.role;
    if (role?.isSystemRole || role?.name === 'SUPER-ADMIN') {
      return { userId: user._id, roleCategory: 'superAdmin' };
    }

    const name = (role?.name || '').toUpperCase();
    if (name.includes('KITCHEN')) {
      return { userId: user._id, roleCategory: 'kitchen' };
    }
    if (name.includes('WAITER')) {
      return { userId: user._id, roleCategory: 'waiter' };
    }
    if (name.includes('ADMIN') || name === 'SUPER-MERCHANT-ADMIN') {
      return { userId: user._id, roleCategory: 'admin' };
    }

    return { userId: user._id, roleCategory: 'admin' };
  }

  /**
   * @param {import('mongoose').Document} order
   * @param {string} toStatus
   * @param {import('mongoose').Types.ObjectId|null} changedBy
   * @param {string|null} [reason]
   */
  static appendTransitionHistory(order, toStatus, changedBy, reason = null) {
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

  static applyStatusTimestamps(order, toStatus) {
    if (toStatus === 'accepted') order.acceptedAt = new Date();
    if (toStatus === 'ready') order.readyAt = new Date();
    if (toStatus === 'served') order.servedAt = new Date();
    if (toStatus === 'completed') order.completedAt = new Date();
    if (toStatus === 'canceled') {
      order.canceledAt = new Date();
      if (!order.canceledBy && order.statusHistory?.length) {
        const last = order.statusHistory[order.statusHistory.length - 1];
        order.canceledBy = last.changedBy;
      }
    }
  }

  /**
   * @param {{ order: import('mongoose').Document, previousStatus: string }} params
   */
  static async queueTransitionNotifications({ order, previousStatus, toStatus }, session) {
    await NotificationService.notifyOrderStatusUpdated({ order, previousStatus }, session);
    if (toStatus === 'canceled') {
      await NotificationService.notifyOrderCanceled({ order }, session);
    }
  }

  /**
   * Transaction-safe status transition with outbox events in the same commit.
   *
   * @param {Object} params
   * @param {string} params.orderId
   * @param {string} params.toStatus
   * @param {Object} params.merchantQuery - tenant-scoped find query
   * @param {import('mongoose').Document|null} params.user
   * @param {string} [params.reason]
   * @param {import('mongoose').Types.ObjectId} [params.assignedWaiter]
   * @param {import('mongoose').Types.ObjectId} [params.assignedKitchenStaff]
   * @param {string} [params.actorType]
   * @param {import('mongoose').Types.ObjectId} [params.customerId]
   */
  static async transitionOrderStatus(params) {
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

    const { userId, roleCategory } = OrderStateMachineService.resolveActor(user, {
      actorType,
      customerId,
    });

    const session = await mongoose.startSession();
    let result;

    try {
      await session.withTransaction(async () => {
        const order = await Order.findOne({ ...merchantQuery, _id: orderId }).session(session);

        if (!order) {
          throw new AppError('Order not found', 404);
        }

        const previousStatus = order.status;
        const validation = OrderStateMachineService.validateTransition(previousStatus, toStatus);

        if (validation.noop) {
          result = { order, previousStatus, noop: true };
          return;
        }

        OrderStateMachineService.assertRolePermission(previousStatus, toStatus, roleCategory);

        order.status = toStatus;
        OrderStateMachineService.applyStatusTimestamps(order, toStatus);
        OrderStateMachineService.appendTransitionHistory(order, toStatus, userId, reason);

        if (assignedWaiter) order.assignedWaiter = assignedWaiter;
        if (assignedKitchenStaff) order.assignedKitchenStaff = assignedKitchenStaff;

        if (toStatus === 'canceled' && reason) {
          order.canceledReason = reason;
          order.canceledBy = userId;
        }

        await order.save({ session });

        await OrderStateMachineService.queueTransitionNotifications(
          { order, previousStatus, toStatus },
          session
        );

        result = { order, previousStatus, noop: false };
      });

      if (!result.noop) {
        logger.info('order.status.transition', {
          orderId: orderId.toString(),
          fromStatus: result.previousStatus,
          toStatus,
          changedBy: userId?.toString(),
          roleCategory,
        });
      }

      return result;
    } finally {
      await session.endSession();
    }
  }
}

module.exports = { OrderStateMachineService };
