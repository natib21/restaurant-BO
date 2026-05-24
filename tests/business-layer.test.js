const { CAPABILITIES, userHasCapability } = require('../src/common/capabilities/capabilities');
const { isOrderablePublishStatus } = require('../src/modules/menu/menu-management.service');
const { TableSystemService } = require('../src/modules/tables/table-system.service');
const { QrTokenService } = require('../src/modules/tables/qr-token.service');

describe('Capabilities (additive RBAC)', () => {
  it('grants super-admin all capabilities', () => {
    expect(
      userHasCapability({ role: { name: 'SUPER-ADMIN', isSystemRole: true } }, CAPABILITIES.MENU_MANAGE)
    ).toBe(true);
  });

  it('infers waiter capabilities from role name when capabilities array empty', () => {
    expect(
      userHasCapability({ role: { name: 'WAITER-01', capabilities: [] } }, CAPABILITIES.ORDER_CREATE)
    ).toBe(true);
  });
});

describe('MenuManagementService publish status', () => {
  it('treats published and missing as orderable', () => {
    expect(isOrderablePublishStatus('published')).toBe(true);
    expect(isOrderablePublishStatus(undefined)).toBe(true);
    expect(isOrderablePublishStatus('draft')).toBe(false);
  });
});

describe('TableSystemService transitions', () => {
  it('allows available to occupied', () => {
    expect(() => TableSystemService.validateTransition('available', 'occupied')).not.toThrow();
  });

  it('rejects occupied to reserved', () => {
    expect(() => TableSystemService.validateTransition('occupied', 'reserved')).toThrow();
  });
});

describe('QrTokenService payload', () => {
  it('builds canonical payload shape', () => {
    const payload = QrTokenService.buildPayload({
      merchantId: 'm1',
      branchId: 'b1',
      tableId: 't1',
    });
    expect(payload).toEqual({ m: 'm1', b: 'b1', t: 't1' });
  });
});
