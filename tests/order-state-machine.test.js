const { OrderStateMachineService } = require('../src/modules/order/service/OrderStateMachineService');
const AppError = require('../utils/appError');

describe('OrderStateMachineService.validateTransition', () => {
  it('allows the canonical forward path', () => {
    expect(() => OrderStateMachineService.validateTransition('pending', 'accepted')).not.toThrow();
    expect(() =>
      OrderStateMachineService.validateTransition('accepted', 'preparing')
    ).not.toThrow();
    expect(() => OrderStateMachineService.validateTransition('preparing', 'ready')).not.toThrow();
    // Note: ready→completed transition is Phase 2 (deferred) — current path is ready→served
    expect(() => OrderStateMachineService.validateTransition('ready', 'served')).not.toThrow();
  });

  it('allows cancellation from pending and accepted', () => {
    expect(() => OrderStateMachineService.validateTransition('pending', 'canceled')).not.toThrow();
    expect(() => OrderStateMachineService.validateTransition('accepted', 'canceled')).not.toThrow();
  });

  it('rejects illegal transitions', () => {
    expect(() => OrderStateMachineService.validateTransition('completed', 'pending')).toThrow(
      AppError
    );
    expect(() => OrderStateMachineService.validateTransition('canceled', 'preparing')).toThrow(
      AppError
    );
    expect(() => OrderStateMachineService.validateTransition('completed', 'accepted')).toThrow(
      AppError
    );
  });

  it('returns noop for same status', () => {
    const result = OrderStateMachineService.validateTransition('ready', 'ready');
    expect(result.noop).toBe(true);
  });
});

describe('OrderStateMachineService.assertRolePermission', () => {
  it('allows kitchen staff to mark preparing -> ready', () => {
    expect(() =>
      OrderStateMachineService.assertRolePermission('preparing', 'ready', 'kitchen')
    ).not.toThrow();
  });

  it('blocks waiter from preparing -> ready', () => {
    expect(() =>
      OrderStateMachineService.assertRolePermission('preparing', 'ready', 'waiter')
    ).toThrow(AppError);
  });

  it('allows customer to cancel pending orders only', () => {
    expect(() =>
      OrderStateMachineService.assertRolePermission('pending', 'canceled', 'customer')
    ).not.toThrow();
    expect(() =>
      OrderStateMachineService.assertRolePermission('accepted', 'canceled', 'customer')
    ).toThrow(AppError);
  });
});
