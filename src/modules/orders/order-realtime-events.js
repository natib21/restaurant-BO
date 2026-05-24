const { OutboxService } = require('../../infrastructure/outbox/outbox.service');

function roomEvent(eventType, aggregateType, aggregateId, merchant, branch, room, data) {
  return OutboxService.buildEvent({
    eventType,
    aggregateType,
    aggregateId,
    merchant,
    branch,
    payload: { target: 'room', room, data },
  });
}

function broadcastEvent(eventType, aggregateType, aggregateId, merchant, branch, data) {
  return OutboxService.buildEvent({
    eventType,
    aggregateType,
    aggregateId,
    merchant,
    branch,
    payload: { target: 'broadcast', data },
  });
}

/**
 * Customer place-order realtime events (same shapes as prior PostCommitEventQueue).
 */
function buildCustomerPlaceOrderEvents({ order, table, orderItems, branchId, merchantId, ingredients }) {
  const branchIdStr = branchId.toString();
  const merchantIdStr = merchantId.toString();
  const aggregateId = order._id;

  const orderCreatePayload = {
    orderId: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    tableNumber: table.tableNumber,
    totalAmount: order.totalAmount,
    branch: branchId,
    placedAt: order.placedAt,
    items: orderItems,
    orderType: order.orderType,
    customerName: order.customerName,
  };

  const events = [
    roomEvent(
      'order:create',
      'order',
      aggregateId,
      merchantId,
      branchId,
      `branch:${branchIdStr}:perm:ORDER_VIEW`,
      orderCreatePayload
    ),
    roomEvent('order:create', 'order', aggregateId, merchantId, branchId, `branch:${branchIdStr}`, {
      orderNumber: order.orderNumber,
      tableNumber: table.tableNumber,
      status: order.status,
    }),
    roomEvent(
      'notification',
      'notification',
      aggregateId,
      merchantId,
      branchId,
      `branch:${branchIdStr}:perm:KITCHEN_VIEW`,
      {
        title: 'New Order!',
        message: `Order ${order.orderNumber} placed - Table ${table.tableNumber}`,
        type: 'info',
        sound: true,
        orderId: order._id,
      }
    ),
    broadcastEvent('new-order', 'order', aggregateId, merchantId, branchId, {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      tableNumber: table.tableNumber,
      totalAmount: order.totalAmount,
      placedAt: order.placedAt,
      items: orderItems,
    }),
  ];

  for (const ingredient of ingredients || []) {
    events.push(
      roomEvent(
        'inventory:stock-updated',
        'inventory',
        ingredient._id,
        merchantId,
        null,
        `merchant:${merchantIdStr}`,
        {
          ingredientId: ingredient._id,
          name: ingredient.name,
          currentStock: ingredient.currentStock,
          stockStatus: ingredient.stockStatus,
        }
      )
    );

    if (typeof ingredient.isLowStock === 'function' && ingredient.isLowStock()) {
      events.push(
        roomEvent(
          'inventory:low-stock-alert',
          'inventory',
          ingredient._id,
          merchantId,
          null,
          `merchant:${merchantIdStr}`,
          {
            ingredientId: ingredient._id,
            name: ingredient.name,
            currentStock: ingredient.currentStock,
            minStock: ingredient.minStock,
            category: ingredient.category,
          }
        )
      );
    }
  }

  return events;
}

function buildStaffPlaceOrderEvents({ order, branchId, merchantId, tableNumber, placedByName }) {
  const branchIdStr = branchId.toString();
  const aggregateId = order._id;

  return [
    roomEvent('order:create', 'order', aggregateId, merchantId, branchId, `branch:${branchIdStr}:perm:ORDER_VIEW`, {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      tableNumber: order.tableNumber,
      location: order.location,
      totalAmount: order.totalAmount,
      branch: branchId,
      placedAt: order.placedAt,
      items: order.items,
      orderType: order.orderType,
      customerName: order.customerName,
      placedBy: placedByName,
    }),
    roomEvent(
      'notification',
      'notification',
      aggregateId,
      merchantId,
      branchId,
      `branch:${branchIdStr}:perm:KITCHEN_VIEW`,
      {
        title: 'New Order!',
        message: `Order ${order.orderNumber} placed${tableNumber ? ` - Table ${tableNumber}` : ''}`,
        type: 'info',
        sound: true,
        orderId: order._id,
      }
    ),
    roomEvent('order:create', 'order', aggregateId, merchantId, branchId, `branch:${branchIdStr}`, {
      orderNumber: order.orderNumber,
      tableNumber,
      status: 'pending',
    }),
  ];
}

function buildOrderStatusUpdatedEvents({ order, previousStatus }) {
  const branchId = order.branch;
  const branchIdStr = branchId.toString();
  const merchantId = order.merchant;
  const aggregateId = order._id;

  const payload = {
    orderId: order._id.toString(),
    orderNumber: order.orderNumber,
    branchId: branchIdStr,
    tableNumber: order.tableNumber,
    status: order.status,
    previousStatus,
    updatedAt: new Date().toISOString(),
    assignedWaiter: order.assignedWaiter ? { id: order.assignedWaiter.toString() } : null,
    assignedKitchenStaff: order.assignedKitchenStaff
      ? { id: order.assignedKitchenStaff.toString() }
      : null,
    readyAt: order.readyAt?.toISOString() || null,
    servedAt: order.servedAt?.toISOString() || null,
    completedAt: order.completedAt?.toISOString() || null,
  };

  const events = [
    roomEvent(
      'order:status-updated',
      'order',
      aggregateId,
      merchantId,
      branchId,
      `branch:${branchIdStr}:perm:ORDER_VIEW`,
      payload
    ),
    roomEvent(
      'order:status-updated',
      'order',
      aggregateId,
      merchantId,
      branchId,
      `branch:${branchIdStr}:perm:ORDER_MANAGE`,
      payload
    ),
    roomEvent('order:status-updated', 'order', aggregateId, merchantId, branchId, `branch:${branchIdStr}`, {
      ...payload,
      itemsCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
    }),
  ];

  if (['preparing', 'ready'].includes(order.status)) {
    events.push(
      roomEvent(
        'order:status-updated',
        'order',
        aggregateId,
        merchantId,
        branchId,
        `branch:${branchIdStr}:perm:KITCHEN_VIEW`,
        payload
      )
    );
  }

  if (order.status === 'ready' || order.status === 'served' || order.status === 'completed') {
    const title =
      order.status === 'ready'
        ? 'Order Ready!'
        : order.status === 'completed'
          ? 'Order Completed'
          : 'Order Served';
    events.push(
      roomEvent(
        'notification',
        'notification',
        aggregateId,
        merchantId,
        branchId,
        `branch:${branchIdStr}:perm:ORDER_MANAGE`,
        {
          title,
          message: `Table ${order.tableNumber} — ${order.orderNumber}`,
          type: 'success',
          orderId: order._id.toString(),
          sound: true,
        }
      )
    );
  }

  return events;
}

function buildOrderPaidEvents({ order, paymentMethod, bankName, image }) {
  const branchId = order.branch;
  const branchIdStr = branchId.toString();
  const merchantId = order.merchant;
  const aggregateId = order._id;

  const paidPayload = {
    orderId: order._id.toString(),
    orderNumber: order.orderNumber,
    tableNumber: order.tableNumber,
    paymentStatus: 'paid',
    paymentMethod,
    bankName,
    receiptImage: image,
    paidAt: order.paidAt.toISOString(),
    completedAt: order.completedAt?.toISOString(),
    totalAmount: order.totalAmount,
  };

  return [
    roomEvent('order-paid', 'order', aggregateId, merchantId, branchId, `branch:${branchIdStr}`, paidPayload),
    roomEvent(
      'order-paid',
      'order',
      aggregateId,
      merchantId,
      branchId,
      `branch:${branchIdStr}:perm:ORDER_VIEW`,
      paidPayload
    ),
    roomEvent(
      'order-paid',
      'order',
      aggregateId,
      merchantId,
      branchId,
      `branch:${branchIdStr}:perm:ORDER_MANAGE`,
      paidPayload
    ),
    roomEvent(
      'notification',
      'notification',
      aggregateId,
      merchantId,
      branchId,
      `branch:${branchIdStr}:perm:ORDER_MANAGE`,
      {
        title: 'Payment Received',
        message: `Order #${order.orderNumber} – ${paymentMethod.toUpperCase()} – Table ${order.tableNumber || 'Takeaway'}`,
        type: 'success',
        sound: true,
        orderId: order._id.toString(),
      }
    ),
  ];
}

function buildOrderCanceledEvents({ order }) {
  return [
    broadcastEvent('order-canceled', 'order', order._id, order.merchant, order.branch, {
      orderId: order._id,
      orderNumber: order.orderNumber,
      canceledBy: order.canceledBy,
      canceledAt: order.canceledAt,
      reason: order.canceledReason,
    }),
  ];
}

function buildOrderUpdatedEvents({ order }) {
  return [
    broadcastEvent('order-updated', 'order', order._id, order.merchant, order.branch, {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      items: order.items,
      totalAmount: order.totalAmount,
    }),
  ];
}

function buildInventoryStockUpdatedEvent(merchantId, ingredient) {
  const merchantIdStr = merchantId.toString();
  return [
    roomEvent(
      'inventory:stock-updated',
      'inventory',
      ingredient._id,
      merchantId,
      null,
      `merchant:${merchantIdStr}`,
      {
        ingredientId: ingredient._id,
        name: ingredient.name,
        currentStock: ingredient.currentStock,
        previousStock: ingredient.previousStock,
        stockStatus: ingredient.stockStatus,
      }
    ),
  ];
}

function buildInventoryLowStockEvent(merchantId, ingredient) {
  const merchantIdStr = merchantId.toString();
  return [
    roomEvent(
      'inventory:low-stock-alert',
      'inventory',
      ingredient._id,
      merchantId,
      null,
      `merchant:${merchantIdStr}`,
      {
        ingredientId: ingredient._id,
        name: ingredient.name,
        currentStock: ingredient.currentStock,
        minStock: ingredient.minStock,
        category: ingredient.category,
      }
    ),
  ];
}

module.exports = {
  buildCustomerPlaceOrderEvents,
  buildStaffPlaceOrderEvents,
  buildOrderStatusUpdatedEvents,
  buildOrderPaidEvents,
  buildOrderCanceledEvents,
  buildOrderUpdatedEvents,
  buildInventoryStockUpdatedEvent,
  buildInventoryLowStockEvent,
};
