const { z } = require('zod');
const AppError = require('../../../../utils/appError');

// ============================================================
// ZOD SCHEMAS (NEW - PREFERRED)
// ============================================================

/**
 * Schema for order item in request
 */
const orderItemSchema = z.object({
  menuItemId: z.string().min(1, 'Menu item ID is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  notes: z.string().optional(),
});

/**
 * Customer (table session) place order
 */
const placeOrderCustomerSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
});

// order.validators.js

const locationSchema = z.object({
  coordinates: z
    .tuple([z.number(), z.number()]) // [longitude, latitude]
    .optional(),
  city: z.string().trim().min(1).optional(),
  wereda: z.string().trim().optional(),
  subCity: z.string().trim().optional(),
  specificArea: z.string().trim().optional(),
  building: z.string().trim().optional(),
  formattedAddress: z.string().trim().optional(),
});

const placeOrderStaffSchema = z
  .object({
    branchId: z.string().min(1, 'Branch ID is required'),
    orderType: z.enum(['dine_in', 'takeaway', 'delivery'], {
      errorMap: () => ({ message: 'Valid orderType is required (dine_in, takeaway, delivery)' }),
    }),
    tableId: z.string().optional(),
    customerName: z.string().min(1, 'Customer name is required').max(100),
    customerPhone: z.string().optional(),
    items: z.array(orderItemSchema).min(1, 'At least one item is required'),
    subtotal: z.number().positive('Subtotal must be positive'),
    notes: z.string().optional(),
    location: locationSchema.optional(),
    deliveryFee: z.number().min(0).optional(),
    deliveryNotes: z.string().max(500).optional(),
  })
  .refine(data => data.orderType !== 'dine_in' || data.tableId, {
    message: 'tableId is required for dine-in orders',
    path: ['tableId'],
  })
  .refine(
    data =>
      data.orderType !== 'delivery' ||
      (data.location?.coordinates && data.location?.city),
    {
      message: 'location.coordinates and location.city are required for delivery orders',
      path: ['location'],
    }
  )
  .refine(
    data => data.orderType !== 'delivery' || data.customerPhone,
    {
      message: 'customerPhone is required for delivery orders',
      path: ['customerPhone'],
    }
  );

/**
 * Update order status
 */
const updateOrderStatusSchema = z.object({
  status: z.enum([
  'pending', 'accepted', 'preparing', 'ready',
  'served', 'out_for_delivery', 'delivered',
  'completed', 'canceled',
], { errorMap: () => ({ message: 'Invalid order status' }) }),
  reason: z.string().optional(),
});

/**
 * Add items to existing order
 */
const addItemToOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
});

/**
 * Query filters for listing orders
 */
const orderFiltersSchema = z.object({
  status: z
    .enum(['pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'canceled'])
    .optional(),
  page: z
    .string()
    .refine(val => !isNaN(parseInt(val)), 'Page must be a number')
    .optional(),
  limit: z
    .string()
    .refine(val => !isNaN(parseInt(val)), 'Limit must be a number')
    .optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  branchId: z.string().optional(),
});

// ============================================================
// LEGACY ASSERTIONS (FOR BACKWARD COMPATIBILITY)
// ============================================================

function assertValidStaffOrderType(orderType) {
  if (!orderType || !['dine_in', 'takeaway', 'delivery'].includes(orderType)) {
    throw new AppError('Valid orderType is required (dine_in, takeaway, delivery)', 400);
  }
}

function assertDineInTableId(orderType, tableId) {
  if (orderType === 'dine_in' && !tableId) {
    throw new AppError('tableId is required for dine-in orders', 400);
  }
}

module.exports = {
  // Zod schemas
  placeOrderCustomerSchema,
  placeOrderStaffSchema,
  updateOrderStatusSchema,
  addItemToOrderSchema,
  orderFiltersSchema,
  orderItemSchema,

  // Legacy assertions (deprecated but kept for backward compatibility)
  assertValidStaffOrderType,
  assertDineInTableId,
};
