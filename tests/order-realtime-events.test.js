const { buildCustomerPlaceOrderEvents } = require('../src/modules/notifications/events/order-realtime-events');

describe('buildCustomerPlaceOrderEvents', () => {
  it('includes order:create, notification, new-order, and inventory events', () => {
    const merchantId = '507f1f77bcf86cd799439011';
    const branchId = '507f1f77bcf86cd799439012';
    const order = {
      _id: '507f1f77bcf86cd799439013',
      orderNumber: '#T5-1-100',
      status: 'pending',
      totalAmount: 50,
      placedAt: new Date(),
      orderType: 'dine_in',
      customerName: 'Guest',
    };
    const table = { tableNumber: 'T5' };
    const ingredient = {
      _id: '507f1f77bcf86cd799439014',
      name: 'Tomato',
      currentStock: 1,
      minStock: 5,
      category: 'veg',
      isLowStock: () => true,
      stockStatus: 'low',
    };

    const events = buildCustomerPlaceOrderEvents({
      order,
      table,
      orderItems: [],
      branchId,
      merchantId,
      ingredients: [ingredient],
    });

    const types = events.map(e => e.eventType);
    expect(types).toContain('order:create');
    expect(types).toContain('notification');
    expect(types).toContain('new-order');
    expect(types).toContain('inventory:stock-updated');
    expect(types).toContain('inventory:low-stock-alert');
    expect(events.every(e => e.merchant.toString() === merchantId)).toBe(true);
  });
});
