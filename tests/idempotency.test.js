const { IdempotencyService } = require('../src/modules/order/service/idempotency.service');

describe('IdempotencyService.normalizeKey', () => {
  it('returns null when header is absent', () => {
    expect(IdempotencyService.normalizeKey(undefined)).toBeNull();
    expect(IdempotencyService.normalizeKey('')).toBeNull();
  });

  it('accepts valid keys', () => {
    expect(IdempotencyService.normalizeKey('  client-uuid-12345  ')).toBe('client-uuid-12345');
  });

  it('rejects short keys', () => {
    expect(() => IdempotencyService.normalizeKey('short')).toThrow('8 and 128');
  });
});

describe('IdempotencyService.buildRequestHash', () => {
  it('produces stable hashes for equivalent payloads', () => {
    const base = {
      branchId: 'b1',
      tableId: 't1',
      customerId: null,
      items: [{ menuItemId: 'm1', quantity: 2, notes: '' }],
    };
    const a = IdempotencyService.buildRequestHash(base);
    const b = IdempotencyService.buildRequestHash({
      ...base,
      items: [{ menuItemId: 'm1', quantity: 2 }],
    });
    expect(a).toBe(b);
  });

  it('differs when cart contents differ', () => {
    const a = IdempotencyService.buildRequestHash({
      branchId: 'b1',
      tableId: 't1',
      items: [{ menuItemId: 'm1', quantity: 1 }],
    });
    const b = IdempotencyService.buildRequestHash({
      branchId: 'b1',
      tableId: 't1',
      items: [{ menuItemId: 'm2', quantity: 1 }],
    });
    expect(a).not.toBe(b);
  });
});
