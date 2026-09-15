# Reporting Module Fixes - Summary

## Issue 1: Sales & Profitability Reports Include Canceled Orders and Voided Items

### Root Cause
- Sales and profitability reports included canceled orders in their aggregation pipelines
- Profitability report included voided items (items marked with `voidedAt` timestamp) in COGS calculations

### Fix Applied

#### File 1: `src/modules/reports/service/sales-report.service.js` (Line 33-36)

**Before:**
```javascript
const matchStage = {
  merchant: new mongoose.Types.ObjectId(merchantId),
  paymentStatus: 'paid', // Only include paid orders for revenue calculation
  placedAt: { 
    $gte: new Date(dateFrom), 
    $lte: new Date(dateTo) 
  }
};
```

**After:**
```javascript
const matchStage = {
  merchant: new mongoose.Types.ObjectId(merchantId),
  paymentStatus: 'paid', // Only include paid orders for revenue calculation
  status: { $ne: 'canceled' }, // ✅ Exclude canceled orders
  placedAt: { 
    $gte: new Date(dateFrom), 
    $lte: new Date(dateTo) 
  }
};
```

#### File 2: `src/modules/reports/service/profitability-report.service.js` (Line 35-50)

**Before:**
```javascript
const matchStage = {
  merchant: new mongoose.Types.ObjectId(merchantId),
  paymentStatus: 'paid', // Only include paid orders for profitability
  placedAt: { 
    $gte: new Date(dateFrom), 
    $lte: new Date(dateTo) 
  }
};

// Conditionally add branch filter if provided
if (branchId) {
  matchStage.branch = new mongoose.Types.ObjectId(branchId);
}

// Summary aggregation - compute profitability metrics
const summaryPipeline = [
  { $match: matchStage },
  { $unwind: '$items' }, // Expand items array to calculate per-item COGS
  {
```

**After:**
```javascript
const matchStage = {
  merchant: new mongoose.Types.ObjectId(merchantId),
  paymentStatus: 'paid', // Only include paid orders for profitability
  status: { $ne: 'canceled' }, // ✅ Exclude canceled orders
  placedAt: { 
    $gte: new Date(dateFrom), 
    $lte: new Date(dateTo) 
  }
};

// Conditionally add branch filter if provided
if (branchId) {
  matchStage.branch = new mongoose.Types.ObjectId(branchId);
}

// Summary aggregation - compute profitability metrics
const summaryPipeline = [
  { $match: matchStage },
  { $unwind: '$items' }, // Expand items array to calculate per-item COGS
  // ✅ Filter out voided items after unwinding
  { $match: { 'items.voidedAt': null } },
  {
```

**Also in breakdown pipeline (Line 187-190):**
```javascript
const breakdownPipeline = [
  { $match: matchStage },
  { $unwind: '$items' },
  // ✅ Filter out voided items after unwinding
  { $match: { 'items.voidedAt': null } },
  {
```

**Also in findLowMarginItems method (Line 340-350):**
```javascript
static async findLowMarginItems(matchStage, marginThreshold = 20) {
  const pipeline = [
    { $match: matchStage },
    { $unwind: '$items' },
    // ✅ Filter out voided items after unwinding
    { $match: { 'items.voidedAt': null } },
    {
      $match: {
        'items.unitCost': { $ne: null }
      }
    },
```

### Test Results

**Test File:** `tests/reports-voided-items-canceled-orders.test.js`

```
✅ TEST 1: Sales report excludes canceled orders
   - Created paid order: #PAID-001 (should be included)
   - Created canceled order: #CANCELED-001 (should be excluded)
   - Gross revenue: 100 (only paid order)
   - Order count: 1 (only paid order)
   
✅ TEST 2: Profitability report excludes voided items
   - Item 1: Price=100, Cost=40 (not voided)
   - Item 2: Price=150, Cost=60 (voided)
   - Total COGS: 40 (only non-voided item)
   
✅ TEST 3: Both canceled orders and voided items excluded together
   - Completed order with non-voided item = included
   - Canceled order with voided item = excluded
   - Total COGS: 40 (only completed order's non-voided item)

Test Results: 3/3 PASSED
```

---

## Issue 2: Export Endpoint Accepts Unimplemented Formats (XLSX/PDF)

### Root Cause
- Export validator (`exportJobRequestSchema`) allowed `['csv', 'xlsx', 'pdf']` formats
- These formats are not implemented in the export service
- Validation accepted the request (returned 202), then failed during job processing
- Result: 202 accepted response followed by silent failure

### Fix Applied

#### File: `src/modules/reports/validators/report.validators.js` (Line 139-142)

**Before:**
```javascript
// Export format (csv, xlsx, pdf)
format: z.enum(['csv', 'xlsx', 'pdf'], {
  errorMap: () => ({ message: 'format must be one of: csv, xlsx, pdf' })
}).default('csv').describe('Export file format')
```

**After:**
```javascript
// Export format (csv only - xlsx/pdf not implemented)
format: z.enum(['csv'], {
  errorMap: () => ({ message: 'format must be: csv (xlsx and pdf are not yet supported)' })
}).default('csv').describe('Export file format')
```

### Behavior Change
- **Before:** POST /reports/exports with `format: 'xlsx'`
  - Returns: 202 Accepted
  - Later: Job fails silently during processing
  - User sees: Incomplete export with no error indication

- **After:** POST /reports/exports with `format: 'xlsx'`
  - Returns: 400 Bad Request
  - Response: `{ "message": "format must be: csv (xlsx and pdf are not yet supported)" }`
  - User sees: Clear error immediately at validation time

### Test Results

**Test File:** `tests/reports-export-format-validation.test.js`

```
✅ TEST 1: CSV format is accepted
   - format: 'csv'
   - Result: PASS (validation succeeds)
   
✅ TEST 2: XLSX format rejected at validation time
   - format: 'xlsx'
   - Result: FAIL (validation rejects with 400-level error)
   - Error: "format must be: csv (xlsx and pdf are not yet supported)"
   
✅ TEST 3: PDF format rejected at validation time
   - format: 'pdf'
   - Result: FAIL (validation rejects with 400-level error)
   - Error: "format must be: csv (xlsx and pdf are not yet supported)"
   
✅ TEST 4: Missing format defaults to CSV
   - format: (omitted)
   - Result: PASS (defaults to 'csv')
   
✅ TEST 5: Error message is clear about unsupported formats
   - Error contains: "xlsx", "pdf", "not yet supported"

Test Results: 5/5 PASSED
```

---

## Verification

### What Was Fixed
1. ✅ Canceled orders excluded from sales report aggregation (status $ne 'canceled')
2. ✅ Canceled orders excluded from profitability report aggregation (status $ne 'canceled')
3. ✅ Voided items excluded from profitability COGS calculations ($match { items.voidedAt: null })
4. ✅ XLSX/PDF export requests rejected at validation time with clear error message

### Test Coverage
- **Unit tests**: 8 tests written and passing
  - 3 tests for canceled orders/voided items
  - 5 tests for export format validation
- **Real data**: Tests use actual MongoDB aggregation against real schema
- **End-to-end**: Tests create real orders/items and run report generators

### No Impact On
- Delivery report service (unchanged per requirements)
- Any other report types or report endpoints
- Existing CSV export functionality

