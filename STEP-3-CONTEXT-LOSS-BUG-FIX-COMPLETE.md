# Step 3: Context-Loss Bug Fix - COMPLETE

**Date:** August 16, 2026  
**Status:** ✅ COMPLETE  
**Test Results:** 66/66 report-security tests passing, 45/45 sales-report unit tests passing

---

## Summary

Fixed production crash discovered during Step 2 verification: report handlers were losing class context when static methods were passed as callbacks, causing `TypeError: Cannot read properties of undefined`. Also discovered and fixed a separate MongoDB aggregation bug using `$literal` in the wrong stage.

---

## Root Cause Analysis

### Bug 1: Context Loss (Primary Issue)
**Error:**
```
TypeError: Cannot read properties of undefined (reading 'buildGroupByExpression')
at generate (src/modules/reports/service/sales-report.service.js:95:36)
```

**Cause:**  
When passing static method `SalesReportService.generate` as callback to `createReportHandler`, the class context (`this`) was lost. Inside `generate()`, calls to `this.buildGroupByExpression()` failed because `this` became `undefined`.

**Why Tests Didn't Catch It:**  
Unit tests in `tests/sales-report.service.test.js` (45/45 passing) call `SalesReportService.generate()` directly with class context maintained. Bug only surfaced when method was passed through controller as callback (integration test path).

### Bug 2: MongoDB $literal in $group Stage (Secondary Issue)
**Error:**
```
MongoServerError: unknown group operator '$literal'
```

**Cause:**  
Line 59 of `sales-report.service.js` used `totalRefunds: { $literal: 0 }` inside a `$group` stage. MongoDB's `$literal` operator is only valid in `$project` stages, not `$group`.

---

## Files Modified

### 1. `src/modules/reports/controller/report.controller.js`
**Changes Applied:**

**Already Fixed (from previous work):**
- ✅ Line 268: `getSalesReport` - uses `(params) => SalesReportService.generate(params)`
- ✅ Line 281: `getOrdersReport` - uses `(params) => OrdersReportService.generate(params)`
- ✅ Line 294: `getProductsReport` - uses `(params) => ProductsReportService.generate(params)`
- ✅ Line 307: `getCustomersReport` - uses `(params) => CustomersReportService.generate(params)`
- ✅ Line 320: `getDeliveryReport` - uses `(params) => DeliveryReportService.generate(params)`

**Fixed in This Step:**
- ✅ Line 433: `getStaffReport` - changed from `StaffReportService.generate` to `(params) => StaffReportService.generate(params)`
- ✅ Line 446: `getInventoryReport` - changed from `InventoryReportService.generate` to `(params) => InventoryReportService.generate(params)`

**No Fix Needed:**
- ✅ `getProfitabilityReport` (line 323-415) - doesn't use `createReportHandler`, has inline implementation

**Status:** All 7 handlers using `createReportHandler` now use arrow function wrappers to preserve context.

### 2. `src/modules/reports/service/sales-report.service.js`
**Changes Applied:**

**Before (Line 52-63):**
```javascript
{
  $group: {
    _id: null,
    grossRevenue: { $sum: '$totalAmount' },
    totalDiscounts: { $sum: '$discountAmount' },
    totalTaxes: { $sum: '$taxAmount' },
    totalDeliveryFees: { $sum: '$deliveryFee' },
    orderCount: { $sum: 1 },
    // Refunds stub (Phase 3 will replace with actual refund join)
    totalRefunds: { $literal: 0 },  // ❌ INVALID - $literal not allowed in $group
    paymentMethods: { $push: '$paymentDetails.method' }
  }
}
```

**After (Line 52-72):**
```javascript
{
  $group: {
    _id: null,
    grossRevenue: { $sum: '$totalAmount' },
    totalDiscounts: { $sum: '$discountAmount' },
    totalTaxes: { $sum: '$taxAmount' },
    totalDeliveryFees: { $sum: '$deliveryFee' },
    orderCount: { $sum: 1 },
    // Collect all payment methods for breakdown
    paymentMethods: { $push: '$paymentDetails.method' }
  }
},
{
  $project: {
    _id: 0,
    grossRevenue: 1,
    totalDiscounts: 1,
    totalTaxes: 1,
    // Refunds stub (Phase 3 will replace with actual refund join)
    totalRefunds: { $literal: 0 },  // ✅ VALID - $literal allowed in $project
    totalDeliveryFees: 1,
    // ... rest of projection
  }
}
```

**Impact:** Moved `totalRefunds: { $literal: 0 }` from `$group` stage to `$project` stage where `$literal` is valid.

---

## Test Verification

### Report Security Tests (Integration Path)
```bash
npm test tests/report-security.test.js
```

**Result:** ✅ **66/66 PASSING**
- 7 authentication tests (HTTP 401)
- 10 authorization tests (HTTP 403)
- 5 feature gating tests (HTTP 403)
- 10 cross-tenant isolation tests (HTTP 403)
- 2 middleware chain tests
- 32 security-applied-to-all-endpoints tests

**Key Observations:**
- ✅ No more `TypeError: Cannot read properties of undefined` errors
- ✅ No more `MongoServerError: unknown group operator '$literal'` errors
- ✅ All 403 Forbidden tests correctly detect missing permissions
- ✅ All 401 Unauthorized tests correctly detect missing/invalid tokens

### Sales Report Unit Tests
```bash
npm test tests/sales-report.service.test.js
```

**Result:** ✅ **45/45 PASSING**
- Summary aggregation tests
- Breakdown aggregation tests
- Payment method breakdown tests
- Date range validation tests
- Branch scoping tests
- Edge case handling tests
- Helper method tests

**Key Observations:**
- ✅ No regression from moving `$literal` to `$project` stage
- ✅ All aggregation pipelines still produce correct results
- ✅ `totalRefunds: 0` still present in summary output

---

## Why This Bug Wasn't Caught Earlier

### Unit Test Limitation
The 45 unit tests in `tests/sales-report.service.test.js` call service methods directly:
```javascript
const result = await SalesReportService.generate(params);
```

This maintains the class context (`this`), so `this.buildGroupByExpression()` works fine.

### Integration Test Gap
The bug only surfaces when the method is passed as a callback through the controller:
```javascript
// OLD (broken):
const getSalesReport = createReportHandler(
  SalesReportService.generate,  // Context lost here!
  { reportType: 'sales' }
);

// NEW (fixed):
const getSalesReport = createReportHandler(
  (params) => SalesReportService.generate(params),  // Context preserved
  { reportType: 'sales' }
);
```

The integration tests in `tests/report-security.test.js` were the first to exercise the full controller→service path with realistic fixtures, which exposed the bug.

---

## Prevention Recommendations

### 1. Add Controller-Level Integration Tests
Create tests that exercise the full HTTP → Controller → Service path, not just Service → Database:

```javascript
// tests/report-controller-integration.test.js
describe('Report Controller Integration', () => {
  test('should successfully generate sales report via controller', async () => {
    const response = await request(app)
      .get('/api/v1/reports/sales')
      .query(validParams)
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(200);
    expect(response.body.data.summary).toBeDefined();
  });
});
```

### 2. Static Method Best Practices
When passing static class methods as callbacks, always use arrow function wrappers:

```javascript
// ❌ BAD - loses context
createHandler(MyService.method)

// ✅ GOOD - preserves context
createHandler((params) => MyService.method(params))

// ✅ ALSO GOOD - explicit binding
createHandler(MyService.method.bind(MyService))
```

### 3. MongoDB Aggregation Validation
Add ESLint rule or pre-commit hook to catch `$literal` in `$group` stages:

```javascript
// Check aggregation pipelines for common mistakes
if (stage.$group && hasLiteral(stage.$group)) {
  throw new Error('$literal not allowed in $group stage');
}
```

---

## Next Steps

- **Step 4:** Fix `TEST-AUDIT-FINDINGS.md` conclusion section (contradicts earlier statements)
- **Step 5:** Full test suite re-run with complete output and honest count

---

## Technical Notes

### JavaScript Class Context Binding
- Static methods in JavaScript classes don't automatically bind `this`
- When a static method is passed as a callback, it loses its class context
- Solutions:
  1. Arrow function wrapper: `(params) => Class.method(params)`
  2. Explicit binding: `Class.method.bind(Class)`
  3. Non-static methods (but not idiomatic for stateless services)

### MongoDB $literal Operator
- **Valid in:** `$project`, `$addFields`, `$replaceRoot`, `$set`
- **Invalid in:** `$group`, `$match`, `$sort`
- **Purpose:** Treats a value as a literal constant, not a field path
- **Common use:** Setting default values in projections

**Example:**
```javascript
// ✅ Valid
{ $project: { status: { $literal: 'pending' } } }

// ❌ Invalid
{ $group: { _id: null, status: { $literal: 'pending' } } }
```

For setting constants in `$group`, use accumulator operators like `$sum: 0` or set the value in a subsequent `$project` stage.

---

**Completion Checklist:**
- [x] Identified root cause (context loss + $literal misuse)
- [x] Fixed all 7 report handlers with arrow function wrappers
- [x] Fixed MongoDB $literal placement in sales-report.service.js
- [x] Verified report-security.test.js (66/66 passing)
- [x] Verified sales-report.service.test.js (45/45 passing)
- [x] Documented findings and prevention recommendations
- [x] Ready for Step 4 (audit report correction)
