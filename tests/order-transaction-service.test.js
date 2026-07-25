const { OrderTransactionService } = require('../src/modules/order/service/OrderTransactionService');

describe('OrderTransactionService', () => {
  describe('generateOrderNumber', () => {
    const fakeSession = { __mocked: true };
    const Counter = require('../models/CounterModel.js.js');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('produces order number format: #<PREFIX>-<SEQ>-<MILLIS>', async () => {
      jest.spyOn(Counter, 'findOneAndUpdate').mockResolvedValueOnce({ seq: 7 });
      const num = await OrderTransactionService.generateOrderNumber(
        {
          merchant: 'm-1',
          branch: 'b-1',
          orderType: 'dine_in',
          tableNumber: 'T12',
        },
        fakeSession
      );
      expect(num).toMatch(/^#T12-7-\d{1,3}$/);
      expect(Counter.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'm-1',
          branchId: 'b-1',
          prefix: 'T12',
        }),
        expect.objectContaining({ $inc: { seq: 1 } }),
        expect.objectContaining({ new: true, upsert: true, session: fakeSession })
      );
    });

    test('uses DEL prefix for delivery orders', async () => {
      jest.spyOn(Counter, 'findOneAndUpdate').mockResolvedValueOnce({ seq: 3 });
      const num = await OrderTransactionService.generateOrderNumber(
        { merchant: 'm', branch: 'b', orderType: 'delivery' },
        fakeSession
      );
      expect(num.startsWith('#DEL-3-')).toBe(true);
    });

    test('uses TAKE prefix for takeaway orders', async () => {
      jest.spyOn(Counter, 'findOneAndUpdate').mockResolvedValueOnce({ seq: 1 });
      const num = await OrderTransactionService.generateOrderNumber(
        { merchant: 'm', branch: 'b', orderType: 'takeaway' },
        fakeSession
      );
      expect(num.startsWith('#TAKE-1-')).toBe(true);
    });

    test('falls back to POS prefix for unknown types / no tableNumber', async () => {
      jest.spyOn(Counter, 'findOneAndUpdate').mockResolvedValueOnce({ seq: 2 });
      const num = await OrderTransactionService.generateOrderNumber(
        { merchant: 'm', branch: 'b', orderType: 'catering' },
        fakeSession
      );
      expect(num.startsWith('#POS-2-')).toBe(true);
    });
  });

  describe('isInventoryError classifier', () => {
    test('matches insufficient stock message', () => {
      expect(
        OrderTransactionService.isInventoryError(new Error('Insufficient stock: tomatoes'))
      ).toBe(true);
    });

    test('matches ingredient not found message', () => {
      expect(
        OrderTransactionService.isInventoryError(new Error('Ingredient not found: xyz'))
      ).toBe(true);
    });

    test('matches missing recipe / No active recipe', () => {
      expect(
        OrderTransactionService.isInventoryError(new Error('No active recipe found for menu-1'))
      ).toBe(true);
      expect(
        OrderTransactionService.isInventoryError(new Error('Cannot place order without recipe'))
      ).toBe(true);
    });

    test('returns false for unrelated errors', () => {
      expect(OrderTransactionService.isInventoryError(new Error('Network timeout'))).toBe(false);
      expect(OrderTransactionService.isInventoryError(new Error('Table not found'))).toBe(false);
      expect(OrderTransactionService.isInventoryError(null)).toBe(false);
      expect(OrderTransactionService.isInventoryError(undefined)).toBe(false);
    });
  });
});
