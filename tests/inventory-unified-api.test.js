describe('inventory unified public API', () => {
  describe('src/modules/inventory index exports', () => {
    let mod;
    let rootShim;

    beforeAll(() => {
      mod = require('../src/modules/inventory');
      rootShim = require('../services/InventoryService');
    });

    test('module exports InventoryService class with deductForOrder method', () => {
      expect(mod).toHaveProperty('InventoryService');
      expect(typeof mod.InventoryService).toBe('function');
      expect(typeof mod.InventoryService.deductForOrder).toBe('function');
    });

    test('module exports InventoryRepository class', () => {
      expect(mod).toHaveProperty('InventoryRepository');
      expect(typeof mod.InventoryRepository).toBe('function');
    });

    test('root services/InventoryService shim re-exports same InventoryService', () => {
      expect(rootShim).toBe(mod.InventoryService);
    });

    test('InventoryService exposes expected public static methods', () => {
      const expected = [
        'getInventoryValuation',
        'adjustStock',
        'deductForOrder',
        'resolveDeductionPlan',
        'scheduleInventoryRealtimeEvents',
      ];
      expected.forEach(m => {
        expect(typeof mod.InventoryService[m]).toBe('function', `InventoryService.${m} missing`);
      });
    });
  });

  describe('InventoryService.deductForOrder', () => {
    const { InventoryService } = require('../src/modules/inventory');

    test('rejects when session is null/undefined (session guard)', async () => {
      await expect(
        InventoryService.deductForOrder(
          {
            merchantId: 'merchant-abc',
            orderId: 'order-123',
            orderNumber: '#T1-1-999',
            plan: [],
            performedBy: null,
          },
          null
        )
      ).rejects.toThrow(/session/);
    });

    test('rejects with Error (not a TypeError) proving method is defined', async () => {
      let thrown;
      try {
        await InventoryService.deductForOrder(
          { merchantId: 'm', orderId: 'o', orderNumber: '#1', plan: [], performedBy: null },
          null
        );
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeDefined();
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown.name).not.toMatch(/type/i);
    });
  });

  describe('InventoryService.resolveDeductionPlan', () => {
    const { InventoryService } = require('../src/modules/inventory');

    test('returns empty plan for empty order items', async () => {
      const plan = await InventoryService.resolveDeductionPlan([], 'merchant-x');
      expect(plan).toEqual(expect.any(Array));
      expect(plan.length).toBe(0);
    });
  });
});
