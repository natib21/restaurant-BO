# Branch-Specific Numbering - Quick Reference

## 🎯 What Changed

### Tables
- **Before:** Unique across entire merchant
- **After:** Unique per branch ✅

### Orders  
- **Before:** `#T5-001-123` (daily reset)
- **After:** `#ORDER/000001` (continuous) ✅

---

## 💻 How to Use

### Create Table (Same Number, Different Branches)
```javascript
// Branch 1
await Table.create({
  merchant: merchantId,
  branch: branch1Id,
  tableNumber: 'T-01', // ✅
  capacity: 4
});

// Branch 2  
await Table.create({
  merchant: merchantId,
  branch: branch2Id,
  tableNumber: 'T-01', // ✅ Same number OK!
  capacity: 4
});
```

### Generate Order Number
```javascript
// Automatic generation (in transaction)
const orderNumber = await OrderTransactionService.generateOrderNumber(
  { merchant: merchantId, branch: branchId },
  session
);
// Returns: "#ORDER/000001"
```

### Set Custom Starting Number
```javascript
// Create branch with custom start
await Branch.create({
  merchant: merchantId,
  name: 'New Branch',
  location: { city: 'Addis Ababa', coordinates: [38.7469, 9.0320] },
  config: {
    orderNumberStart: 1000 // ✅ Start from 1000
  }
});

// First order will be: #ORDER/001000
```

---

## 🔍 Database Queries

### Find Tables by Branch
```javascript
const tables = await Table.find({
  merchant: merchantId,
  branch: branchId
});
```

### Check Counter Status
```javascript
const counter = await Counter.findOne({
  merchantId,
  branchId,
  prefix: 'ORDER',
  date: null // Continuous numbering
});

console.log(`Current sequence: ${counter.seq}`);
console.log(`Started at: ${counter.startingNumber}`);
```

### Get Branch Configuration
```javascript
const branch = await Branch.findById(branchId);
console.log(`Starting number: ${branch.config?.orderNumberStart || 1}`);
```

---

## ⚠️ Important Notes

1. **Tables:** `tableNumber` must be unique within `(merchant + branch)`
2. **Orders:** Sequence is continuous (never resets)
3. **Concurrency:** Automatically handled by MongoDB atomic operations
4. **Format:** Always `#ORDER/` + 6-digit zero-padded number
5. **Starting Number:** Configurable per branch (default: 1)

---

## 🐛 Troubleshooting

### Duplicate Table Error
```
Error: E11000 duplicate key error: merchant_1_branch_1_tableNumber_1
```
**Solution:** A table with that number already exists in this branch. Use a different number.

### Order Number Skipped
**Cause:** Transaction rolled back after number was generated.
**Solution:** This is normal. The sequence continues to ensure uniqueness.

### Wrong Starting Number
**Check:**
```javascript
const branch = await Branch.findById(branchId).select('config');
console.log(branch.config?.orderNumberStart); // Should be your desired number
```

**Fix:**
```javascript
await Branch.findByIdAndUpdate(branchId, {
  'config.orderNumberStart': 1000
});
```

---

## 📊 Example Scenario

```javascript
// Merchant: "Pizza Place"
// Branch 1: "Downtown"
// Branch 2: "Airport"

// Both branches can use T-01, T-02, T-03
Downtown: T-01 ✅
Airport:  T-01 ✅

// Each branch has independent order sequence
Downtown: #ORDER/000001, #ORDER/000002, #ORDER/000003
Airport:  #ORDER/000001, #ORDER/000002 (same numbers OK!)

// Airport starts from 500
await Branch.findByIdAndUpdate(airportBranchId, {
  'config.orderNumberStart': 500
});

Airport: #ORDER/000500, #ORDER/000501, #ORDER/000502
```

---

## ✅ Quick Checklist

- [ ] Tables unique per branch? YES ✅
- [ ] Same table number in different branches? YES ✅
- [ ] Order format is `#ORDER/000001`? YES ✅
- [ ] Orders reset daily? NO ✅ (continuous)
- [ ] Different branches share order numbers? NO ✅ (independent)
- [ ] Starting number configurable? YES ✅
- [ ] Concurrent orders safe? YES ✅

---

## 📝 Files to Know

- **Table Model:** `models/tabelModel.js`
- **Counter Model:** `models/CounterModel.js.js`
- **Branch Model:** `models/branchModel.js`
- **Order Number Logic:** `src/modules/order/service/OrderTransactionService.js`
- **Tests:** `tests/branch-specific-numbering.test.js`

---

**Status:** ✅ **READY TO USE**
