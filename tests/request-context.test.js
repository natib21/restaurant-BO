const {
  initRequestContext,
  syncRequestContext,
} = require('../src/common/middleware/request-context.middleware');

function makeReq(overrides = {}) {
  return Object.assign({ headers: {} }, overrides);
}

function makeRes(overrides = {}) {
  return Object.assign({ locals: {} }, overrides);
}

describe('request-context middleware', () => {
  test('initRequestContext injects ctx, requestId, requestTime, actorType=system, and sets res.locals', () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    initRequestContext(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.ctx).toBeDefined();
    expect(typeof req.ctx.requestId).toBe('string');
    expect(req.ctx.requestId.length).toBe(8);
    expect(new Date(req.ctx.requestTime).toString()).not.toBe('Invalid Date');
    expect(req.ctx.actorType).toBe('system');
    expect(req.requestId).toBe(req.ctx.requestId);
    expect(req.requestTime).toBe(req.ctx.requestTime);
    expect(res.locals.requestId).toBe(req.ctx.requestId);
  });

  test('syncRequestContext: no ctx -> skips safely', () => {
    const req = makeReq({ user: { _id: 'x' } });
    const next = jest.fn();
    syncRequestContext(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('syncRequestContext: staff user populates actor, merchant, actorId on ctx', () => {
    const req = makeReq({
      ctx: { requestId: 'abcd1234', requestTime: new Date().toISOString(), actorType: 'system' },
      user: {
        _id: 'usr-1',
        merchant: { _id: 'm-1' },
      },
    });
    const next = jest.fn();
    syncRequestContext(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.ctx.actorType).toBe('staff');
    expect(req.ctx.actorId).toBe('usr-1');
    expect(req.ctx.merchantId).toBe('m-1');
  });

  test('syncRequestContext: customerId sets actorType=customer + propagates customerId', () => {
    const req = makeReq({
      ctx: { requestId: 'abcd1234', requestTime: new Date().toISOString(), actorType: 'system' },
      customerId: 'cust-42',
    });
    const next = jest.fn();
    syncRequestContext(req, makeRes(), next);
    expect(req.ctx.actorType).toBe('customer');
    expect(req.ctx.customerId).toBe('cust-42');
  });

  test('syncRequestContext: ctx.customerId is honored when req.customerId absent', () => {
    const req = makeReq({
      ctx: {
        requestId: 'abcd1234',
        requestTime: new Date().toISOString(),
        actorType: 'system',
        customerId: 'ctx-cust',
      },
    });
    const next = jest.fn();
    syncRequestContext(req, makeRes(), next);
    expect(req.ctx.actorType).toBe('customer');
    expect(req.ctx.customerId).toBe('ctx-cust');
  });

  test('syncRequestContext: merchant-scoped anonymous request propagates all ids', () => {
    const req = makeReq({
      ctx: { requestId: 'abcd1234', requestTime: new Date().toISOString(), actorType: 'system' },
      merchantId: 'm-2',
      branchId: 'b-2',
      tableId: 't-2',
    });
    const next = jest.fn();
    syncRequestContext(req, makeRes(), next);
    expect(req.ctx.actorType).toBe('anonymous');
    expect(req.ctx.merchantId).toBe('m-2');
    expect(req.ctx.branchId).toBe('b-2');
    expect(req.ctx.tableId).toBe('t-2');
  });

  test('syncRequestContext does not overwrite already-present ctx ids', () => {
    const req = makeReq({
      ctx: {
        requestId: 'abcd1234',
        requestTime: new Date().toISOString(),
        actorType: 'system',
        merchantId: 'ctx-merchant',
        branchId: 'ctx-branch',
        customerId: 'ctx-customer',
        tableId: 'ctx-table',
      },
      merchantId: 'req-merchant',
      branchId: 'req-branch',
      customerId: 'req-customer',
      tableId: 'req-table',
    });
    const next = jest.fn();
    syncRequestContext(req, makeRes(), next);
    expect(req.ctx.merchantId).toBe('ctx-merchant');
    expect(req.ctx.branchId).toBe('ctx-branch');
    expect(req.ctx.customerId).toBe('ctx-customer');
    expect(req.ctx.tableId).toBe('ctx-table');
  });
});
