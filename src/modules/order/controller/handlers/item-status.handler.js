// src/modules/order/controller/handlers/item-status.handler.js
// ✅ Item-level status workflow endpoints

const mongoose = require('mongoose');
const Order = require('../../../../../models/orderModel');
const { ItemStatusService } = require('../../service/ItemStatusService');
const { StatusSyncService } = require('../../service/StatusSyncService');
const catchAsync = require('../../../../../utils/catchAsync');
const AppError = require('../../../../../utils/appError');
const logger = require('../../../../../utils/logger');

/**
 * Update individual item status
 * PATCH /api/v1/orders/:orderId/items/:itemId/status
 * 
 * Body: { status: "served" | "ready" | "in_progress" }
 * 
 * Enforces state machine - only allows valid transitions
 */
exports.updateItemStatus = catchAsync(async (req, res, next) => {
  const { orderId, itemId } = req.params;
  const { status: newStatus } = req.body;

  if (!newStatus) {
    return next(new AppError('Status is required', 400));
  }

  const validStatuses = ['pending', 'in_progress', 'ready', 'served'];
  if (!validStatuses.includes(newStatus)) {
    return next(new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400));
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);

      if (!order) {
        throw new AppError('Order not found', 404);
      }

      // Update item status
      result = await ItemStatusService.updateItemStatus(
        order,
        itemId,
        newStatus,
        req.user,
        session
      );

      // Recompute order status
      await ItemStatusService.recomputeOrderStatus(order, session);

      // ✅ REVERSE SYNC: Update linked ticket item if item was served
      if (newStatus === 'served' && !result.noop) {
        await StatusSyncService.syncTicketItemCompletion(order, itemId, session);
      }
    });

    // Emit socket events after transaction commits
    if (!result.noop) {
      const order = await Order.findById(orderId);  // Reload after transaction
      await StatusSyncService.afterOrderItemChange(order, result.item, null);
    }

    logger.info('item-status.updated-via-api', {
      orderId,
      itemId,
      newStatus,
      noop: result.noop,
      userId: req.user?._id?.toString(),
    });

    res.status(200).json({
      status: 'success',
      data: {
        item: result.item,
        noop: result.noop,
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Serve all ready items in bulk
 * POST /api/v1/orders/:orderId/items/serve-ready
 * 
 * Transitions all items with status='ready' to 'served'
 * Useful when waiter picks up multiple dishes at once
 */
exports.serveReadyItems = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);

      if (!order) {
        throw new AppError('Order not found', 404);
      }

      // Serve all ready items
      result = await ItemStatusService.serveReadyItems(order, req.user, session);

      // Recompute order status
      await ItemStatusService.recomputeOrderStatus(order, session);

      // ✅ REVERSE SYNC: Update all served items' linked tickets
      if (result.servedItems && result.servedItems.length > 0) {
        for (const servedItem of result.servedItems) {
          await StatusSyncService.syncTicketItemCompletion(order, servedItem._id, session);
        }
      }
    });

    // Emit socket events for bulk operation after transaction commits
    if (result.servedItems && result.servedItems.length > 0) {
      const order = await Order.findById(orderId);  // Reload after transaction
      await StatusSyncService.afterBulkOrderItemsChange(order, result.servedItems, null);
    }

    logger.info('item-status.bulk-served-via-api', {
      orderId,
      servedCount: result.servedCount,
      userId: req.user?._id?.toString(),
    });

    res.status(200).json({
      status: 'success',
      data: {
        servedCount: result.servedCount,
        servedItems: result.servedItems.map(item => ({
          _id: item._id,
          name: item.name,
          status: item.status,
          servedAt: item.servedAt,
        })),
      },
    });
  } finally {
    await session.endSession();
  }
});

/**
 * Void an item (with required reason)
 * PATCH /api/v1/orders/:orderId/items/:itemId/void
 * 
 * Body: { reason: string, createReplacement?: boolean }
 * 
 * Voids the item (terminal status)
 * Optionally creates a replacement item (fresh status='pending')
 */
exports.voidItem = catchAsync(async (req, res, next) => {
  const { orderId, itemId } = req.params;
  const { reason, createReplacement = false } = req.body;

  if (!reason || reason.trim().length === 0) {
    return next(new AppError('Void reason is required', 400));
  }

  const session = await mongoose.startSession();

  try {
    let voidResult, replacementResult;

    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);

      if (!order) {
        throw new AppError('Order not found', 404);
      }

      // Void the item
      voidResult = await ItemStatusService.voidItem(order, itemId, reason, req.user, session);

      // Optionally create replacement
      if (createReplacement) {
        replacementResult = await ItemStatusService.createReplacementItem(
          order,
          itemId,
          req.user,
          session
        );
      }

      // Recompute order status
      await ItemStatusService.recomputeOrderStatus(order, session);
    });

    // Emit socket events after transaction commits
    if (voidResult) {
      const order = await Order.findById(orderId);  // Reload after transaction
      await StatusSyncService.afterOrderItemChange(order, voidResult.item, null);
    }

    // Also emit replacement item event if created
    if (replacementResult) {
      const order = await Order.findById(orderId);  // Reload to get latest state
      await StatusSyncService.afterOrderItemChange(order, replacementResult.replacementItem, null);
    }

    logger.info('item-status.voided-via-api', {
      orderId,
      itemId,
      reason,
      createReplacement,
      userId: req.user?._id?.toString(),
    });

    res.status(200).json({
      status: 'success',
      data: {
        voidedItem: voidResult.item,
        replacementItem: replacementResult?.replacementItem || null,
      },
    });
  } finally {
    await session.endSession();
  }
});
