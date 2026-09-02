// src/modules/order/service/ItemStatusService.js
// ✅ Item-level status workflow management
const mongoose = require('mongoose');
const AppError = require('../../../../utils/appError');
const logger = require('../../../../utils/logger');

/**
 * Item status state machine (one-way transitions only)
 * No backward edges - corrections done via void + replacement
 */
const ITEM_TRANSITIONS = {
  pending: ['in_progress', 'served', 'void'],
  in_progress: ['ready', 'void'],
  ready: ['served', 'void'],
  served: ['void'],
  void: [] // Terminal
};

const TERMINAL_STATUSES = new Set(['void']);

class ItemStatusService {
  /**
   * Validate item status transition
   * @param {string} fromStatus - Current status
   * @param {string} toStatus - Target status
   * @returns {Object} { valid: boolean, noop: boolean }
   */
  static validateTransition(fromStatus, toStatus) {
    // No-op if same status
    if (fromStatus === toStatus) {
      return { valid: true, noop: true };
    }

    // Cannot transition from terminal status
    if (TERMINAL_STATUSES.has(fromStatus)) {
      throw new AppError(
        `Cannot transition from terminal status "${fromStatus}"`,
        400
      );
    }

    // Check if transition is allowed
    const allowedTransitions = ITEM_TRANSITIONS[fromStatus];
    if (!allowedTransitions || !allowedTransitions.includes(toStatus)) {
      throw new AppError(
        `Invalid transition: ${fromStatus} → ${toStatus}`,
        400
      );
    }

    return { valid: true, noop: false };
  }

  /**
   * Auto-serve non-cooked items for dine-in orders
   * Called when order transitions pending → accepted
   * 
   * @param {Object} order - Order document
   * @param {Object} session - MongoDB session for transaction
   */
  static async autoServeNonCookedItems(order, session = null) {
    // Only for dine-in orders
    if (order.orderType !== 'dine_in') {
      logger.debug('item-status.auto-serve.skip-non-dine-in', {
        orderId: order._id,
        orderType: order.orderType
      });
      return { servedCount: 0 };
    }

    let servedCount = 0;
    const now = new Date();

    for (const item of order.items) {
      // Only auto-serve if:
      // 1. Item doesn't require kitchen (requiresKitchen === false)
      // 2. Item is still pending
      if (item.requiresKitchen === false && item.status === 'pending') {
        item.status = 'served';
        item.servedAt = now;
        item.servedVia = 'auto';
        item.servedBy = null; // System served, not a specific user
        servedCount++;

        logger.info('item-status.auto-served', {
          orderId: order._id.toString(),
          itemId: item._id.toString(),
          itemName: item.name,
          requiresKitchen: item.requiresKitchen
        });
      }
    }

    if (servedCount > 0) {
      await order.save({ session });
      logger.info('item-status.auto-serve.complete', {
        orderId: order._id.toString(),
        servedCount
      });
    }

    return { servedCount };
  }

  /**
   * Update individual item status
   * 
   * INTEGRITY RULE: Kitchen-required items cannot reach 'ready' manually
   * - For requiresKitchen=true: 'ready' can ONLY be set via ticket completion
   * - Manual endpoint may only move kitchen items to 'served' (after ready) or 'void'
   * - For requiresKitchen=false: No restriction (no tickets exist)
   * 
   * @param {Object} order - Order document
   * @param {string} itemId - Item _id
   * @param {string} newStatus - Target status
   * @param {Object} actor - User performing the action
   * @param {Object} session - MongoDB session
   */
  static async updateItemStatus(order, itemId, newStatus, actor, session = null) {
    const item = order.items.id(itemId);
    
    if (!item) {
      throw new AppError('Item not found in order', 404);
    }

    // INTEGRITY CHECK: Kitchen items cannot be manually set to 'ready'
    if (item.requiresKitchen && newStatus === 'ready') {
      throw new AppError(
        'Kitchen items can only reach "ready" via their ticket completing — cannot be set manually. ' +
        'The kitchen must mark the ticket item as ready, which will automatically sync to the order item.',
        400
      );
    }

    // Validate transition
    const { noop } = ItemStatusService.validateTransition(item.status, newStatus);
    
    if (noop) {
      return { item, noop: true };
    }

    const oldStatus = item.status;
    item.status = newStatus;

    // Set timestamps and actor based on new status
    const now = new Date();
    
    if (newStatus === 'served') {
      item.servedAt = now;
      item.servedBy = actor?._id || null;
      item.servedVia = 'manual';
    } else if (newStatus === 'void') {
      // Void should use voidItem() method which requires a reason
      throw new AppError('Use voidItem() method to void items (requires reason)', 400);
    }

    await order.save({ session });

    logger.info('item-status.updated', {
      orderId: order._id.toString(),
      itemId: item._id.toString(),
      oldStatus,
      newStatus,
      actorId: actor?._id?.toString(),
      requiresKitchen: item.requiresKitchen
    });

    return { item, noop: false };
  }

  /**
   * Serve all ready items in bulk
   * 
   * @param {Object} order - Order document
   * @param {Object} actor - User performing the action
   * @param {Object} session - MongoDB session
   * @returns {Promise<Object>} { servedItems: Array, servedCount: number }
   */
  static async serveReadyItems(order, actor, session = null) {
    const readyItems = order.items.filter(item => item.status === 'ready');
    
    if (readyItems.length === 0) {
      return { servedItems: [], servedCount: 0 };
    }

    const now = new Date();
    const servedItems = [];

    for (const item of readyItems) {
      item.status = 'served';
      item.servedAt = now;
      item.servedBy = actor?._id || null;
      item.servedVia = 'manual';
      servedItems.push(item);
    }

    await order.save({ session });

    logger.info('item-status.bulk-served', {
      orderId: order._id.toString(),
      servedCount: servedItems.length,
      actorId: actor?._id?.toString()
    });

    return { servedItems, servedCount: servedItems.length };
  }

  /**
   * Void an item (with required reason)
   * 
   * @param {Object} order - Order document
   * @param {string} itemId - Item _id
   * @param {string} reason - Required void reason
   * @param {Object} actor - User performing the action
   * @param {Object} session - MongoDB session
   */
  static async voidItem(order, itemId, reason, actor, session = null) {
    if (!reason || reason.trim().length === 0) {
      throw new AppError('Void reason is required', 400);
    }

    const item = order.items.id(itemId);
    
    if (!item) {
      throw new AppError('Item not found in order', 404);
    }

    // Can't void if already void
    if (item.status === 'void') {
      throw new AppError('Item is already voided', 400);
    }

    const oldStatus = item.status;
    const now = new Date();

    item.status = 'void';
    item.voidedAt = now;
    item.voidedBy = actor?._id || null;
    item.voidReason = reason.trim();

    await order.save({ session });

    logger.info('item-status.voided', {
      orderId: order._id.toString(),
      itemId: item._id.toString(),
      oldStatus,
      reason,
      actorId: actor?._id?.toString()
    });

    return { item };
  }

  /**
   * Create replacement item for a voided item
   * 
   * @param {Object} order - Order document
   * @param {string} voidedItemId - Voided item _id
   * @param {Object} actor - User performing the action
   * @param {Object} session - MongoDB session
   */
  static async createReplacementItem(order, voidedItemId, actor, session = null) {
    const voidedItem = order.items.id(voidedItemId);
    
    if (!voidedItem) {
      throw new AppError('Voided item not found in order', 404);
    }

    if (voidedItem.status !== 'void') {
      throw new AppError('Can only create replacement for voided items', 400);
    }

    // Create new item (copy of voided item, but fresh status)
    const replacementItem = {
      menuItem: voidedItem.menuItem,
      name: voidedItem.name,
      quantity: voidedItem.quantity,
      unitPrice: voidedItem.unitPrice,
      unitCost: voidedItem.unitCost,
      totalPrice: voidedItem.totalPrice,
      notes: voidedItem.notes,
      requiresKitchen: voidedItem.requiresKitchen,
      status: 'pending', // Start fresh
      replacedItemId: voidedItem._id // Link back to voided item
    };

    order.items.push(replacementItem);
    await order.save({ session });

    // Get the newly created item (it will have a new _id)
    const newItem = order.items[order.items.length - 1];

    // Link voided item to replacement
    voidedItem.replacementItemId = newItem._id;
    await order.save({ session });

    logger.info('item-status.replacement-created', {
      orderId: order._id.toString(),
      voidedItemId: voidedItem._id.toString(),
      replacementItemId: newItem._id.toString(),
      actorId: actor?._id?.toString()
    });

    return { replacementItem: newItem, voidedItem };
  }

  /**
   * Recompute order status based on item statuses
   * Rule: Call after EVERY item status mutation
   * 
   * @param {Object} order - Order document
   * @param {Object} session - MongoDB session
   */
  static async recomputeOrderStatus(order, session = null) {
    // Filter out voided items
    const activeItems = order.items.filter(item => item.status !== 'void');

    if (activeItems.length === 0) {
      // All items voided - order should probably be canceled
      logger.warn('item-status.recompute.all-items-voided', {
        orderId: order._id.toString()
      });
      // Don't auto-cancel - let staff handle it
      return { statusChanged: false };
    }

    const oldStatus = order.status;
    let newStatus = oldStatus;

    // Count items by status
    const statusCounts = {
      pending: 0,
      in_progress: 0,
      ready: 0,
      served: 0
    };

    for (const item of activeItems) {
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    }

    // Derive order status from item statuses
    // Rule: Parent status is ALWAYS derived from children - never set directly
    // A single lagging item holds the whole order back (intentional)
    const totalActive = activeItems.length;

    const allServed = statusCounts.served === totalActive;
    const anyReady = statusCounts.ready > 0;
    const anyInProgress = statusCounts.in_progress > 0 || statusCounts.pending > 0;

    if (allServed) {
      // All items served - order is fully served
      newStatus = 'served';
    } else if (anyInProgress) {
      // As long as ANYTHING is still pending/cooking, order is NOT ready
      // Even if some items are already 'ready', the order stays 'preparing'
      newStatus = 'preparing';
    } else if (anyReady) {
      // Nothing left pending/in_progress, but not fully served yet
      // This means ALL items are at least 'ready' (some may be served)
      newStatus = 'ready';
    }

    // Only update if status actually changed
    if (newStatus !== oldStatus) {
      order.status = newStatus;

      // Set appropriate timestamp
      const now = new Date();
      if (newStatus === 'ready' && !order.readyAt) {
        order.readyAt = now;
      } else if (newStatus === 'served' && !order.servedAt) {
        order.servedAt = now;
      }

      await order.save({ session });

      logger.info('item-status.recompute.status-changed', {
        orderId: order._id.toString(),
        oldStatus,
        newStatus,
        activeItems: totalActive,
        statusCounts
      });

      return { statusChanged: true, oldStatus, newStatus };
    }

    return { statusChanged: false };
  }
}

module.exports = { ItemStatusService, ITEM_TRANSITIONS };
