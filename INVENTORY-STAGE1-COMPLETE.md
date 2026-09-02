# Stage 1 Complete: Schema Changes

## Changes Applied

### 1. models/Ingredient.js

**Diff:**
```diff
+    reservedStock: {
+      type: Number,
+      default: 0,
+      min: 0,
+    },
+    reorderQuantity: {
+      type: Number,
+      default: 0,
+      min: 0,
+    },
+    alertStatus: {
+      type: String,
+      enum: ['OK', 'LOW', 'CRITICAL', 'OUT_OF_STOCK'],
+      default: 'OK',
+    },
+    dailyUsageRate: {
+      type: Number,
+      default: 0,
+      min: 0,
+    },
```

**Audit plugin updated to track new fields:**
```diff
   auditedFields: [
     'name',
     'category',
     'unit',
     'currentStock',
     'minStock',
     'maxStock',
+    'reservedStock',
+    'reorderQuantity',
+    'alertStatus',
+    'dailyUsageRate',
     'costPerUnit',
     'supplier',
     'isActive',
     'lastRestocked',
     'expiryDate',
   ],
```

### 2. models/StockHistory.js (NEW FILE)

**Created:** New model with branch REQUIRED and action enum including RESERVED, RELEASED, CORRECTED

```javascript
const stockHistorySchema = new Schema({
  ingredient: { type: Schema.Types.ObjectId, ref: 'Ingredient', required: true, index: true },
  merchant: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true, index: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },  // REQUIRED
  
  action: { 
    type: String, 
    enum: ['ADDED', 'USED', 'RESERVED', 'RELEASED', 'ADJUSTED', 'WASTE', 'CORRECTED'], 
    required: true 
  },
  
  quantity: { type: Number, required: true },
  stockBefore: Number,
  stockAfter: Number,
  unit: String,
  
  // Context fields
  supplier: String,
  orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  batchNumber: String,
  expiryDate: Date,
  reason: String,
  costPrice: Number,
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  recordedAt: { type: Date, default: Date.now, index: true },
  previousStatus: String,
  newStatus: String,
}, {
  timestamps: true
});

// Indexes for reporting
stockHistorySchema.index({ ingredient: 1, recordedAt: -1 });
stockHistorySchema.index({ merchant: 1, branch: 1, action: 1 });
stockHistorySchema.index({ merchant: 1, branch: 1, recordedAt: -1 });
stockHistorySchema.index({ orderId: 1 });
```

## Test Results

**File:** `tests/inventory-stage1-schema.test.js`

### Test Output:
```
Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
Time:        2.398 s
```

### Tests Passed (18/18):

#### Ingredient Schema - New Fields (7 tests)
- ✅ should create ingredient with new fields (reservedStock, reorderQuantity, alertStatus, dailyUsageRate)
- ✅ should default new fields to 0 or OK when not provided
- ✅ should validate alertStatus enum values
- ✅ should reject invalid alertStatus value
- ✅ should enforce min: 0 on reservedStock
- ✅ should enforce min: 0 on reorderQuantity
- ✅ should enforce min: 0 on dailyUsageRate

#### StockHistory Schema - Branch Required (7 tests)
- ✅ should create StockHistory entry with all required fields including branch
- ✅ should reject StockHistory without branch (required field)
- ✅ should accept all new action enum values (RESERVED, RELEASED, CORRECTED)
- ✅ should accept legacy action values (ADDED, USED, ADJUSTED, WASTE)
- ✅ should reject invalid action value
- ✅ should store optional context fields (orderId, reason, costPrice)
- ✅ should auto-populate recordedAt timestamp

#### Schema Indexes (4 tests)
- ✅ Ingredient should have index on merchant + name
- ✅ StockHistory should have index on ingredient + recordedAt
- ✅ StockHistory should have index on merchant + branch + action
- ✅ StockHistory should have index on orderId

## Verification

### New Ingredient Fields Verified:
1. ✅ `reservedStock` - Number, default 0, min 0
2. ✅ `reorderQuantity` - Number, default 0, min 0
3. ✅ `alertStatus` - Enum ['OK', 'LOW', 'CRITICAL', 'OUT_OF_STOCK'], default 'OK'
4. ✅ `dailyUsageRate` - Number, default 0, min 0

### StockHistory Verified:
1. ✅ Branch field is REQUIRED
2. ✅ Action enum includes new values: RESERVED, RELEASED, CORRECTED
3. ✅ Action enum preserves legacy values: ADDED, USED, ADJUSTED, WASTE
4. ✅ Validation rejects entries without branch
5. ✅ Optional context fields work (orderId, reason, costPrice)
6. ✅ Auto-populates recordedAt timestamp

### Indexes Verified:
1. ✅ Ingredient: merchant + name
2. ✅ StockHistory: ingredient + recordedAt (descending)
3. ✅ StockHistory: merchant + branch + action
4. ✅ StockHistory: merchant + branch + recordedAt
5. ✅ StockHistory: orderId

## Files Modified:
1. `models/Ingredient.js` - Added 4 new fields
2. `models/StockHistory.js` - Created new file

## Files Created:
1. `tests/inventory-stage1-schema.test.js` - 18 tests, all passing

## Next Stage:
Stage 2: alertStatus hooks (pre('save'), post('findOneAndUpdate'), post('save'))

---

**Status:** ✅ COMPLETE - All schema changes implemented and tested successfully
