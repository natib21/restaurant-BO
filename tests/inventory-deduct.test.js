const InventoryService = require('../services/InventoryService');

describe('InventoryService.deductForOrder', () => {
  it('requires an injected session', async () => {
    await expect(
      InventoryService.deductForOrder(
        { merchantId: 'm', orderNumber: '#1', plan: [], performedBy: null },
        null
      )
    ).rejects.toThrow('requires a MongoDB session');
  });
});
