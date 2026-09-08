/**
 * @file tests/order-type-prefix.test.js
 * @description Unit tests for order type prefix mapping utility
 */

const {
  ORDER_TYPE_PREFIX_MAP,
  getOrderTypePrefix,
  getSupportedOrderTypes,
  isValidOrderType,
  validateOrderType,
  formatOrderNumber,
} = require('../src/modules/order/utils/orderTypePrefix');

describe('Order Type Prefix Utility', () => {
  describe('ORDER_TYPE_PREFIX_MAP', () => {
    test('has correct mappings', () => {
      expect(ORDER_TYPE_PREFIX_MAP).toEqual({
        dine_in: 'DI',
        takeaway: 'TA',
        delivery: 'DL',
      });
    });
  });

  describe('getOrderTypePrefix', () => {
    test('returns correct prefix for dine_in', () => {
      expect(getOrderTypePrefix('dine_in')).toBe('DI');
    });

    test('returns correct prefix for takeaway', () => {
      expect(getOrderTypePrefix('takeaway')).toBe('TA');
    });

    test('returns correct prefix for delivery', () => {
      expect(getOrderTypePrefix('delivery')).toBe('DL');
    });

    test('handles case insensitivity', () => {
      expect(getOrderTypePrefix('DINE_IN')).toBe('DI');
      expect(getOrderTypePrefix('Takeaway')).toBe('TA');
      expect(getOrderTypePrefix('DELIVERY')).toBe('DL');
    });

    test('handles whitespace', () => {
      expect(getOrderTypePrefix(' dine_in ')).toBe('DI');
      expect(getOrderTypePrefix(' takeaway ')).toBe('TA');
    });

    test('throws error for invalid order type', () => {
      expect(() => getOrderTypePrefix('invalid')).toThrow('Invalid order type');
      expect(() => getOrderTypePrefix('telegram')).toThrow('Invalid order type');
      expect(() => getOrderTypePrefix('pickup')).toThrow('Invalid order type');
    });

    test('throws error for null/undefined', () => {
      expect(() => getOrderTypePrefix(null)).toThrow('Order type is required');
      expect(() => getOrderTypePrefix(undefined)).toThrow('Order type is required');
      expect(() => getOrderTypePrefix('')).toThrow('Order type is required');
    });
  });

  describe('getSupportedOrderTypes', () => {
    test('returns all supported order types', () => {
      const types = getSupportedOrderTypes();
      expect(types).toEqual(['dine_in', 'takeaway', 'delivery']);
    });
  });

  describe('isValidOrderType', () => {
    test('returns true for valid order types', () => {
      expect(isValidOrderType('dine_in')).toBe(true);
      expect(isValidOrderType('takeaway')).toBe(true);
      expect(isValidOrderType('delivery')).toBe(true);
    });

    test('returns true for valid types with different casing', () => {
      expect(isValidOrderType('DINE_IN')).toBe(true);
      expect(isValidOrderType('Takeaway')).toBe(true);
    });

    test('returns false for invalid order types', () => {
      expect(isValidOrderType('invalid')).toBe(false);
      expect(isValidOrderType('telegram')).toBe(false);
      expect(isValidOrderType('pickup')).toBe(false);
    });

    test('returns false for null/undefined/empty', () => {
      expect(isValidOrderType(null)).toBe(false);
      expect(isValidOrderType(undefined)).toBe(false);
      expect(isValidOrderType('')).toBe(false);
    });
  });

  describe('validateOrderType', () => {
    test('does not throw for valid order types', () => {
      expect(() => validateOrderType('dine_in')).not.toThrow();
      expect(() => validateOrderType('takeaway')).not.toThrow();
      expect(() => validateOrderType('delivery')).not.toThrow();
    });

    test('throws for invalid order types', () => {
      expect(() => validateOrderType('invalid')).toThrow('Invalid order type');
      expect(() => validateOrderType('telegram')).toThrow('Invalid order type');
    });

    test('throws for null/undefined/empty', () => {
      expect(() => validateOrderType(null)).toThrow('Order type is required');
      expect(() => validateOrderType(undefined)).toThrow('Order type is required');
      expect(() => validateOrderType('')).toThrow('Order type is required');
    });
  });

  describe('formatOrderNumber', () => {
    test('formats with 6-digit padding', () => {
      expect(formatOrderNumber('DI', 1)).toBe('#DI-000001');
      expect(formatOrderNumber('TA', 15)).toBe('#TA-000015');
      expect(formatOrderNumber('DL', 125)).toBe('#DL-000125');
      expect(formatOrderNumber('DI', 999999)).toBe('#DI-999999');
    });

    test('allows overflow beyond 6 digits', () => {
      expect(formatOrderNumber('DI', 1000000)).toBe('#DI-1000000');
      expect(formatOrderNumber('TA', 9999999)).toBe('#TA-9999999');
    });

    test('throws error for missing prefix', () => {
      expect(() => formatOrderNumber('', 1)).toThrow('Prefix is required');
      expect(() => formatOrderNumber(null, 1)).toThrow('Prefix is required');
    });

    test('throws error for invalid sequence', () => {
      expect(() => formatOrderNumber('DI', 0)).toThrow('Sequence must be a positive number');
      expect(() => formatOrderNumber('DI', -1)).toThrow('Sequence must be a positive number');
      expect(() => formatOrderNumber('DI', 'invalid')).toThrow('Sequence must be a positive number');
    });
  });

  describe('Integration: Order Type to Order Number', () => {
    test('dine_in order generates #DI-XXXXXX', () => {
      const prefix = getOrderTypePrefix('dine_in');
      const orderNumber = formatOrderNumber(prefix, 123);
      expect(orderNumber).toBe('#DI-000123');
    });

    test('takeaway order generates #TA-XXXXXX', () => {
      const prefix = getOrderTypePrefix('takeaway');
      const orderNumber = formatOrderNumber(prefix, 456);
      expect(orderNumber).toBe('#TA-000456');
    });

    test('delivery order generates #DL-XXXXXX', () => {
      const prefix = getOrderTypePrefix('delivery');
      const orderNumber = formatOrderNumber(prefix, 789);
      expect(orderNumber).toBe('#DL-000789');
    });
  });

  describe('Order Source vs Order Type', () => {
    test('order source does not affect prefix', () => {
      // Delivery via Telegram
      const prefix1 = getOrderTypePrefix('delivery');
      expect(formatOrderNumber(prefix1, 1)).toBe('#DL-000001');

      // Delivery via Website
      const prefix2 = getOrderTypePrefix('delivery');
      expect(formatOrderNumber(prefix2, 2)).toBe('#DL-000002');

      // Both use DL prefix because orderType is 'delivery'
      expect(prefix1).toBe(prefix2);
    });

    test('telegram is not a valid order type', () => {
      // Telegram is an order SOURCE, not an order TYPE
      expect(() => getOrderTypePrefix('telegram')).toThrow('Invalid order type');
      expect(isValidOrderType('telegram')).toBe(false);
    });
  });
});
