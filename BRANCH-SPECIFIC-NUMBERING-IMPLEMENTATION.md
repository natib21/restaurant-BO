# Branch-Specific Table and Order Numbering - Implementation Guide

## 📋 Current State Analysis

### ✅ What's Already Correct

1. **Counter Model** - Already branch-scoped:
   ```javascript
   counterSchema.index({ merchantId: 1, branchId: 1, date: 1, prefix: 1 }, { unique: true });
   ```
   ✅ Order numbers are already unique per branch per day per prefix

2. **Order Number Generation** - Already uses branch:
   ```javascript
   const counter = await Counter.findOneAndUpdate(
     { merchantId: merchant, branchId: branch, date: today, prefix },
     { $inc: { seq: 1 } },
     ...
   );
   ```
   ✅ Each branch has independent counter sequences

### ❌ What Needs Fixing

1. **Table Model** - Currently merchant-scoped:
   ```javascript
   // WRONG: Unique across entire merchant
   tableSchema.index({ merchant: 1, tableNumber: 1 }, { unique: true });
   ```
   ❌ Should be unique per branch

2. **Order Number Format** - Uses table number as prefix:
   ```javascript
   // WRONG: #T5-001-123 (table-based prefix)
   if (orderType === 'dine_in' && tableNumber) {
     prefix = tableNumber.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'POS';
   }
   ```
   ❌ Should use consistent `#ORDER/000001` format

3. **Order Number** - Resets daily:
   ```javascript
   const today = new Date().toISOString().split('T')[0];
   const counter = await Counter.findOneAndUpdate(
     { merchantId: merchant, branchId: branch, date: today, prefix },
     ...
   );
   ```
   ❌ Should be continuous sequence per branch (not reset daily)

---

## 🎯 Implementation Plan

### Phase 1: Fix Table Uniqueness (Branch-Scoped)
### Phase 2: Fix Order Number Format (#ORDER/000001)
### Phase 3: Fix Order Number Sequence (Continuous, Not Daily)
### Phase 4: Add Configuration for Starting Number
### Phase 5: Testing

---

## 📝 Detailed Changes

### **PHASE 1: Table Model - Branch-Scoped Uniqueness**

#### File: `models/tabelModel.js`

**Change 1: Update unique index**

```javascript
// BEFORE (Line ~98):
tableSchema.index({ merchant: 1, tableNumber: 1 }, { unique: true });

// AFTER:
tableSchema.index({ merchant: 1, branch: 1, tableNumber: 1 }, { unique: true });
```

**Result:**
- ✅ Branch 1 can have Table 1
- ✅ Branch 2 can have Table 1
- ❌ Branch 1 cannot have duplicate Table 1

---

### **PHASE 2: Order Number Format**

#### File: `src/modules/order/service/OrderTransactionService.js`

**Change 1: Simplify order number generation (Line ~250)**

```javascript
// BEFORE:
static async generateOrderNumber({ merchant, branch, orderType, tableNumber }, session) {
  const today = new Date().toISOString().split('T')[0];
  let prefix = 'POS';

  if (orderType === 'dine_in' && tableNumber) {
    prefix = tableNumber.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'POS';
  } else if (orderType === 'delivery') {
    prefix = 'DEL';
  } else if (orderType === 'takeaway') {
    prefix = 'TAKE';
  }

  const counter = await Counter.findOneAndUpdate(
    { merchantId: merchant, branchId: branch, date: today, prefix },
    { $inc: { seq: 1 }, $setOnInsert: { prefix } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session }
  );

  const millis = Date.now() % 1000;
  return `#${prefix}-${counter.seq}-${millis}`;
}

// AFTER:
static async generateOrderNumber({ merchant, branch, orderType }, session) {
  const prefix = 'ORDER'; // ✅ Single prefix for all order types

  const counter = await Counter.findOneAndUpdate(
    { merchantId: merchant, branchId: branch, prefix }, // ✅ No date field - continuous sequence
    { $inc: { seq: 1 }, $setOnInsert: { prefix } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session }
  );

  // ✅ Format: #ORDER/000001
  return `#ORDER/${counter.seq.toString().padStart(6, '0')}`;
}
```

**Changes:**
- ✅ Removed `tableNumber` parameter (not needed)
- ✅ Removed `date` field from counter query (continuous sequence)
- ✅ Single `ORDER` prefix for all order types
- ✅ 6-digit zero-padded format: `#ORDER/000001`
- ✅ Removed milliseconds suffix (not needed)

---

### **PHASE 3: Counter Model - Remove Date Field**

#### File: `models/CounterModel.js.js`

**Option A: Remove date field entirely (Breaking Change)**

```javascript
// BEFORE:
const counterSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Merchant' },
  branchId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Branch' },
  date: { type: String, required: true }, // ❌ Remove this
  prefix: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

counterSchema.index({ merchantId: 1, branchId: 1, date: 1, prefix: 1 }, { unique: true });

// AFTER:
const counterSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Merchant', index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Branch', index: true },
  prefix: { type: String, required: true },
  seq: { type: Number, default: 0 },
  // ✅ Optional: Track when sequence started
  startedAt: { type: Date, default: Date.now },
  // ✅ Optional: Allow configurable starting number
  startingNumber: { type: Number, default: 1 },
});

// ✅ Unique index per merchant + branch + prefix
counterSchema.index({ merchantId: 1, branchId: 1, prefix: 1 }, { unique: true });
```

**Option B: Keep date field for backward compatibility (Recommended)**

```javascript
const counterSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Merchant', index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Branch', index: true },
  date: { type: String, required: false }, // ✅ Optional for backward compatibility
  prefix: { type: String, required: true },
  seq: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  startingNumber: { type: Number, default: 1 }, // ✅ Configurable starting number
}, {
  timestamps: true // ✅ Add createdAt, updatedAt
});

// ✅ Two indexes: one for continuous numbering, one for legacy
counterSchema.index({ merchantId: 1, branchId: 1, prefix: 1 }, { unique: true, sparse: true, partialFilterExpression: { date: null } });
counterSchema.index({ merchantId: 1, branchId: 1, date: 1, prefix: 1 }, { unique: true, sparse: true, partialFilterExpression: { date: { $ne: null } } });
```

---

### **PHASE 4: Configurable Starting Number**

#### Add Configuration to Branch Model

**File: `models/branchModel.js`**

```javascript
const branchSchema = new mongoose.Schema({
  // ... existing fields ...
  
  // ✅ Configuration for numbering
  config: {
    orderNumberStart: {
      type: Number,
      default: 1,
      min: 1,
      comment: 'Starting number for order sequence in this branch'
    },
    // Future: Add table number format, receipt settings, etc.
  }
});
```

#### Update Order Number Generation

```javascript
static async generateOrderNumber({ merchant, branch, orderType }, session) {
  const prefix = 'ORDER';

  // ✅ Check if counter exists, if not initialize with branch config
  let counter = await Counter.findOne(
    { merchantId: merchant, branchId: branch, prefix, date: null },
    null,
    { session }
  );

  if (!counter) {
    // ✅ Get starting number from branch config
    const Branch = require('../../../../models/branchModel');
    const branchDoc = await Branch.findById(branch).select('config.orderNumberStart').session(session);
    const startingNumber = branchDoc?.config?.orderNumberStart || 1;

    counter = await Counter.findOneAndUpdate(
      { merchantId: merchant, branchId: branch, prefix, date: null },
      { 
        $setOnInsert: { 
          seq: startingNumber - 1, // Start at N-1 so first increment gives N
          startingNumber,
          prefix 
        } 
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, session }
    );
  }

  // ✅ Increment sequence
  counter = await Counter.findOneAndUpdate(
    { _id: counter._id },
    { $inc: { seq: 1 } },
    { new: true, session }
  );

  // ✅ Format: #ORDER/000001
  return `#ORDER/${counter.seq.toString().padStart(6, '0')}`;
}
```

---

## 🔒 Concurrency Safety

### Current Implementation ✅

```javascript
const counter = await Counter.findOneAndUpdate(
  { merchantId: merchant, branchId: branch, prefix, date: null },
  { $inc: { seq: 1 } },
  { new: true, upsert: true, session } // ✅ Atomic operation within transaction
);
```

**Why it's safe:**
1. ✅ `findOneAndUpdate` with `$inc` is atomic (MongoDB guarantees)
2. ✅ Runs inside transaction session (serializable isolation)
3. ✅ Unique index prevents duplicate counters
4. ✅ Even if 2 waiters create orders simultaneously:
   - Waiter A: Gets seq=15
   - Waiter B: Gets seq=16 (atomic increment)
   - No duplicates possible

---

## 🧪 Testing Strategy

### Test 1: Table Uniqueness (Branch-Scoped)

```javascript
describe('Branch-Specific Table Numbering', () => {
  test('allows same table number in different branches', async () => {
    const branch1 = await Branch.create({ merchant: merchantId, name: 'Branch 1' });
    const branch2 = await Branch.create({ merchant: merchantId, name: 'Branch 2' });

    // ✅ Should succeed
    const table1Branch1 = await Table.create({
      merchant: merchantId,
      branch: branch1._id,
      tableNumber: 'T-01',
      capacity: 4
    });

    // ✅ Should succeed (same table number, different branch)
    const table1Branch2 = await Table.create({
      merchant: merchantId,
      branch: branch2._id,
      tableNumber: 'T-01',
      capacity: 4
    });

    expect(table1Branch1.tableNumber).toBe('T-01');
    expect(table1Branch2.tableNumber).toBe('T-01');
  });

  test('prevents duplicate table number in same branch', async () => {
    const branch = await Branch.create({ merchant: merchantId, name: 'Branch 1' });

    await Table.create({
      merchant: merchantId,
      branch: branch._id,
      tableNumber: 'T-01',
      capacity: 4
    });

    // ❌ Should fail (duplicate in same branch)
    await expect(
      Table.create({
        merchant: merchantId,
        branch: branch._id,
        tableNumber: 'T-01',
        capacity: 6
      })
    ).rejects.toThrow(/duplicate key/);
  });
});
```

### Test 2: Order Number Format

```javascript
describe('Branch-Specific Order Numbering', () => {
  test('generates correct order number format', async () => {
    const order = await placeOrder({
      merchantId,
      branchId,
      orderType: 'dine_in',
      items: [...]
    });

    expect(order.orderNumber).toMatch(/^#ORDER\/\d{6}$/);
    expect(order.orderNumber).toBe('#ORDER/000001');
  });

  test('increments sequence continuously', async () => {
    const order1 = await placeOrder({ merchantId, branchId, ... });
    const order2 = await placeOrder({ merchantId, branchId, ... });
    const order3 = await placeOrder({ merchantId, branchId, ... });

    expect(order1.orderNumber).toBe('#ORDER/000001');
    expect(order2.orderNumber).toBe('#ORDER/000002');
    expect(order3.orderNumber).toBe('#ORDER/000003');
  });

  test('different branches have independent sequences', async () => {
    const branch1 = await Branch.create({ merchant: merchantId, name: 'Branch 1' });
    const branch2 = await Branch.create({ merchant: merchantId, name: 'Branch 2' });

    const order1Branch1 = await placeOrder({ merchantId, branchId: branch1._id, ... });
    const order1Branch2 = await placeOrder({ merchantId, branchId: branch2._id, ... });
    const order2Branch1 = await placeOrder({ merchantId, branchId: branch1._id, ... });

    expect(order1Branch1.orderNumber).toBe('#ORDER/000001');
    expect(order1Branch2.orderNumber).toBe('#ORDER/000001'); // ✅ Same number, different branch
    expect(order2Branch1.orderNumber).toBe('#ORDER/000002');
  });
});
```

### Test 3: Concurrency Safety

```javascript
describe('Order Number Concurrency', () => {
  test('handles concurrent order creation without duplicates', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      placeOrder({
        merchantId,
        branchId,
        customerName: `Customer ${i}`,
        items: [...]
      })
    );

    const orders = await Promise.all(promises);
    const orderNumbers = orders.map(o => o.orderNumber);
    
    // ✅ No duplicates
    const uniqueNumbers = new Set(orderNumbers);
    expect(uniqueNumbers.size).toBe(10);
    
    // ✅ Sequential
    expect(orderNumbers).toContain('#ORDER/000001');
    expect(orderNumbers).toContain('#ORDER/000010');
  });
});
```

### Test 4: Starting Number Configuration

```javascript
describe('Configurable Starting Number', () => {
  test('respects branch starting number configuration', async () => {
    const branch = await Branch.create({
      merchant: merchantId,
      name: 'New Branch',
      config: { orderNumberStart: 1000 } // ✅ Start from 1000
    });

    const order = await placeOrder({ merchantId, branchId: branch._id, ... });

    expect(order.orderNumber).toBe('#ORDER/001000');
  });
});
```

---

## 🚀 Migration Strategy

### Step 1: Update Models (No Breaking Changes)

```javascript
// Update indexes only (doesn't affect existing data)
1. Add new index to Table model (branch-scoped)
2. Update Counter model to support both date and non-date counters
```

### Step 2: Deploy Code Changes

```javascript
// Deploy updated order number generation
1. New orders use #ORDER/000001 format
2. Existing orders keep old format
3. Both formats supported in UI/reports
```

### Step 3: Data Migration (Optional)

```bash
# If you want to migrate existing orders (optional)
node scripts/migrate-order-numbers.js
```

---

## 📊 Summary

### Tables
| Aspect | Before | After |
|--------|--------|-------|
| **Uniqueness** | Merchant-wide | Branch-specific ✅ |
| **Example** | Branch 1: T-01 <br> Branch 2: T-02 ❌ | Branch 1: T-01 <br> Branch 2: T-01 ✅ |
| **Index** | `{merchant, tableNumber}` | `{merchant, branch, tableNumber}` ✅ |

### Orders
| Aspect | Before | After |
|--------|--------|-------|
| **Format** | `#T5-001-123` | `#ORDER/000001` ✅ |
| **Sequence** | Daily reset | Continuous ✅ |
| **Scope** | Branch-specific ✅ | Branch-specific ✅ |
| **Starting** | Always 1 | Configurable ✅ |
| **Concurrency** | Safe ✅ | Safe ✅ |

---

## ✅ Final Result

```
Merchant "ABC Restaurant"
 ├── Branch "Downtown"
 │    ├── Tables: T-01, T-02, T-03
 │    └── Orders: #ORDER/000001, #ORDER/000002, #ORDER/000003
 │
 └── Branch "Airport"
      ├── Tables: T-01, T-02, T-03  ← Same numbers OK!
      └── Orders: #ORDER/000001, #ORDER/000002  ← Same numbers OK!
```

**Status:** Ready for implementation! 🎉
