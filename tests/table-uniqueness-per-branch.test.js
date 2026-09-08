/**
 * Table Uniqueness Per-Branch Test
 * 
 * Verifies that:
 * 1. Table numbers are unique ONLY within a branch (not per-merchant)
 * 2. Different branches can have the same table number
 * 3. After soft-delete (isActive: false), the same number can be reused
 */

const mongoose = require('mongoose');
const Table = require('../models/tabelModel');

describe('Table Uniqueness - Per-Branch Level', () => {
  test('✅ Table schema has correct unique index: {branch, tableNumber, isActive}', () => {
    // Get the schema indexes
    const indexes = Table.schema._indexes;
    
    // Find the unique index for branch + tableNumber + isActive
    const uniqueIndex = indexes.find(idx => {
      const indexObj = idx[0];
      return (
        indexObj.branch === 1 &&
        indexObj.tableNumber === 1 &&
        indexObj.isActive === 1 &&
        idx[1].unique === true
      );
    });

    expect(uniqueIndex).toBeDefined();
    expect(uniqueIndex[1].unique).toBe(true);
    expect(uniqueIndex[1].partialFilterExpression).toEqual({ isActive: true });
    expect(uniqueIndex[1].sparse).toBe(true);
  });

  test('✅ Unique index is PER-BRANCH, not per-merchant', () => {
    const indexes = Table.schema._indexes;
    
    // The unique index should NOT contain merchant
    const uniqueIndex = indexes.find(idx => {
      const indexObj = idx[0];
      return (
        indexObj.branch === 1 &&
        indexObj.tableNumber === 1 &&
        indexObj.isActive === 1 &&
        idx[1].unique === true
      );
    });

    // Verify it does NOT have merchant in the index
    expect(uniqueIndex[0]).not.toHaveProperty('merchant');
    expect(uniqueIndex[0]).toEqual({
      branch: 1,
      tableNumber: 1,
      isActive: 1
    });
  });

  test('✅ Partial filter ensures inactive tables do not trigger uniqueness', () => {
    const indexes = Table.schema._indexes;
    
    const uniqueIndex = indexes.find(idx => {
      const indexObj = idx[0];
      return (
        indexObj.branch === 1 &&
        indexObj.tableNumber === 1 &&
        idx[1].unique === true
      );
    });

    // MongoDB partialFilterExpression: only index where isActive: true
    // This means deleted tables (isActive: false) won't be in the unique index
    expect(uniqueIndex[1].partialFilterExpression).toEqual({ isActive: true });
  });
});
