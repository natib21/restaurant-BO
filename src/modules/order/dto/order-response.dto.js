/**
 * Response shaping helpers — no business rules.
 */
function attachPaymentImage(order, req) {
  if (!order?.paymentDetails?.receiptImage) return order;

  return {
    ...order,
    paymentDetails: {
      ...order.paymentDetails,
      receiptImage: `${req.protocol}://${req.get('host')}/img/orderPayment/${order.paymentDetails.receiptImage}`,
    },
  };
}

function formatOrderByNumberPayload(order) {
  return {
    _id: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    orderType: order.orderType,
    tableNumber: order.tableNumber,
    customerName: order.customerName,
    totalAmount: order.totalAmount,
    placedAt: order.placedAt,
    acceptedAt: order.acceptedAt,
    readyAt: order.readyAt,
    servedAt: order.servedAt,
    completedAt: order.completedAt,
    items: order.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      notes: item.notes || null,
      image: item.menuItem?.image || null,
    })),
    timeline: {
      placed: order.placedAt,
      accepted: order.acceptedAt,
      ready: order.readyAt,
      served: order.servedAt,
      completed: order.completedAt,
    },
    assigned: {
      waiter: order.assignedWaiter?.fullName || null,
      kitchen: order.assignedKitchenStaff?.fullName || null,
    },
  };
}

module.exports = {
  attachPaymentImage,
  formatOrderByNumberPayload,
};
