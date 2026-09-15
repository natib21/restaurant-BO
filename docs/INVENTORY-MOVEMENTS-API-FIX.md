# Inventory Movements API - Query Parameter Fix

## Issue

The `/api/v1/inventory/movements` endpoint is receiving malformed query parameters for the `type` filter.

**Current (BROKEN) URL:**
```
http://localhost:8000/api/v1/inventory/movements?branchId=6aa16c17fc87cf9605920424&type=type%3Dwaste%26type%3Dadjustment%26type%3Din%26type%3Dout
```

**Problem:** The `type` parameter value is double-encoded. When URL-decoded, it becomes:
```
type=type=waste&type=adjustment&type=in&type=out
```

This creates a nested query string, which the Zod validator rejects with:
```json
{
  "success": false,
  "message": "Validation error in query",
  "errors": [
    {
      "field": "type",
      "message": "Invalid input",
      "code": "invalid_union"
    }
  ]
}
```

---

## Solution

### Option 1: Multiple Query Parameters (Recommended)

Send multiple `type` parameters to filter by multiple movement types:

**Correct URL:**
```
http://localhost:8000/api/v1/inventory/movements?branchId=6aa16c17fc87cf9605920424&type=waste&type=adjustment&type=in&type=out
```

**Frontend code example (axios):**
```javascript
const params = {
  branchId: '6aa16c17fc87cf9605920424',
  type: ['waste', 'adjustment', 'in', 'out']
};

axios.get('/api/v1/inventory/movements', { params });
// Axios automatically converts array to multiple params: ?type=waste&type=adjustment&type=in&type=out
```

**Frontend code example (fetch):**
```javascript
const params = new URLSearchParams();
params.append('branchId', '6aa16c17fc87cf9605920424');
params.append('type', 'waste');
params.append('type', 'adjustment');
params.append('type', 'in');
params.append('type', 'out');

fetch(`/api/v1/inventory/movements?${params.toString()}`);
```

### Option 2: Single Value (For one filter only)

**URL:**
```
http://localhost:8000/api/v1/inventory/movements?branchId=6aa16c17fc87cf9605920424&type=waste
```

This returns only movements of type `waste`.

---

## Backend Validation Schema

The endpoint uses this Zod schema (defined in `src/modules/inventory/validators/inventory.validator.js`):

```javascript
type: z
  .union([
    z.enum(['in', 'out', 'waste', 'adjustment']),
    z.array(z.enum(['in', 'out', 'waste', 'adjustment'])),
  ])
  .optional()
```

**Valid values for `type`:**
- `in` - Stock received (purchases, returns)
- `out` - Stock consumed (order deductions, transfers out)
- `waste` - Stock wasted/spoiled
- `adjustment` - Manual adjustments (corrections, audits)

---

## Controller Behavior

The controller (`src/modules/inventory/controller/inventory.controller.js`) normalizes single values to arrays:

```javascript
// Normalize type to array if it's a single value
if (type && !Array.isArray(type)) {
  type = [type];
}
```

So both formats work:
- `?type=waste` → converted to `['waste']` internally
- `?type=waste&type=adjustment` → stays as `['waste', 'adjustment']`

---

## Testing

**Get all movements:**
```bash
curl "http://localhost:8000/api/v1/inventory/movements?branchId=6aa16c17fc87cf9605920424"
```

**Get waste movements only:**
```bash
curl "http://localhost:8000/api/v1/inventory/movements?branchId=6aa16c17fc87cf9605920424&type=waste"
```

**Get waste + adjustment movements:**
```bash
curl "http://localhost:8000/api/v1/inventory/movements?branchId=6aa16c17fc87cf9605920424&type=waste&type=adjustment"
```

**With date range:**
```bash
curl "http://localhost:8000/api/v1/inventory/movements?branchId=6aa16c17fc87cf9605920424&type=waste&startDate=2024-01-01&endDate=2024-12-31"
```

---

## Root Cause

The frontend is likely double-encoding the query parameters. Check the code that builds the URL for the inventory movements API call and ensure it's not encoding an already-encoded query string.

**Common mistake:**
```javascript
// WRONG: Double encoding
const typeParams = 'type=waste&type=adjustment';
const url = `/api/v1/inventory/movements?${encodeURIComponent(typeParams)}`;
// Result: ?type%3Dwaste%26type%3Dadjustment (double-encoded)

// CORRECT: Use URLSearchParams or array
const params = new URLSearchParams({
  branchId: '6aa16c17fc87cf9605920424'
});
['waste', 'adjustment', 'in', 'out'].forEach(t => params.append('type', t));
const url = `/api/v1/inventory/movements?${params.toString()}`;
// Result: ?branchId=6aa16c17fc87cf9605920424&type=waste&type=adjustment&type=in&type=out
```
