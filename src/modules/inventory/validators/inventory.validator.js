/**
 * Inventory Module — Zod Validation Schemas
 * 
 * Schemas for:
 * - Stock adjustments (in, out, waste, adjustment)
 * - Stock transfers
 * - Batch operations
 */

const { z } = require('zod');

/**
 * Adjust Stock Schema
 * 
 * Validates inventory adjustments (receiving, usage, waste, manual corrections)
 * 
 * Query/Body:
 * {
 *   "ingredientId": "507f1f77bcf86cd799439011",
 *   "quantity": 10,
 *   "type": "in",  // "in", "out", "waste", "adjustment"
 *   "reason": "Purchase from supplier",
 *   "reference": "PO-2024-001",
 *   "cost": 5000
 * }
 */
exports.adjustStockSchema = z.object({
  ingredientId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid ingredient ID'),
  quantity: z.number().min(0.01, 'Quantity must be greater than 0'),
  type: z.enum(['in', 'out', 'waste', 'adjustment']).describe('Stock movement type'),
  reason: z.string().min(3).max(200).optional().describe('Why stock is being adjusted'),
  reference: z.string().max(100).optional().describe('PO number, invoice, etc.'),
  cost: z.number().min(0).optional().describe('Cost per unit or total cost'),
});

/**
 * Batch Adjust Stock Schema
 * 
 * Validates multiple stock adjustments in a single request
 */
exports.batchAdjustStockSchema = z.object({
  adjustments: z.array(
    z.object({
      ingredientId: z.string().regex(/^[a-f0-9]{24}$/),
      quantity: z.number().min(0.01),
      type: z.enum(['in', 'out', 'waste', 'adjustment']),
      reason: z.string().optional(),
      cost: z.number().min(0).optional(),
    })
  ).min(1).max(50),
});

/**
 * Stock Transfer Schema
 * 
 * Validates transfers between branches (if applicable)
 */
exports.stockTransferSchema = z.object({
  ingredientId: z.string().regex(/^[a-f0-9]{24}$/),
  quantity: z.number().min(0.01),
  fromBranchId: z.string().regex(/^[a-f0-9]{24}$/),
  toBranchId: z.string().regex(/^[a-f0-9]{24}$/),
  reason: z.string().optional(),
});

/**
 * Deduct Stock (for Order) Schema
 * 
 * Validates stock deduction during order placement.
 * This is the critical schema for ACID transactions.
 * 
 * {
 *   "items": [
 *     { "ingredientId": "...", "quantity": 2 },
 *     { "ingredientId": "...", "quantity": 0.5 }
 *   ]
 * }
 */
exports.deductStockSchema = z.object({
  items: z.array(
    z.object({
      ingredientId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid ingredient ID'),
      quantity: z.number().min(0.01, 'Quantity must be > 0'),
      recipeId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
    })
  ).min(1).max(100).describe('Items to deduct from inventory'),
});

/**
 * Set Min/Max Stock Schema
 * 
 * Validates minimum and maximum stock threshold updates
 */
exports.setStockThresholdsSchema = z.object({
  ingredientId: z.string().regex(/^[a-f0-9]{24}$/),
  minStock: z.number().min(0),
  maxStock: z.number().min(0),
}).refine(
  data => data.maxStock >= data.minStock,
  { message: 'maxStock must be >= minStock', path: ['maxStock'] }
);

/**
 * Get Stock Movements Query Schema
 * 
 * Validates pagination and filtering for stock movement history
 */
exports.getStockMovementsSchema = z.object({
  ingredientId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  type: z.enum(['in', 'out', 'waste', 'adjustment']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
}).refine(
  data => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  { message: 'startDate must be <= endDate' }
);
