const { getMerchantId, merchantScopedQuery } = require('../src/common/utils/tenant-scope');

describe('tenant-scope', () => {
  it('resolves merchantId from ctx', () => {
    const req = { ctx: { merchantId: '507f1f77bcf86cd799439011' } };
    expect(String(getMerchantId(req))).toBe('507f1f77bcf86cd799439011');
  });

  it('resolves merchantId from legacy req.merchantId', () => {
    const req = { merchantId: '507f1f77bcf86cd799439012' };
    expect(String(getMerchantId(req))).toBe('507f1f77bcf86cd799439012');
  });

  it('builds merchant-scoped query', () => {
    const req = { merchantId: '507f1f77bcf86cd799439011' };
    const q = merchantScopedQuery({ status: 'pending' }, req);
    expect(q.status).toBe('pending');
    expect(String(q.merchant)).toBe('507f1f77bcf86cd799439011');
  });
});
