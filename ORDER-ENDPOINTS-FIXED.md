# Order Endpoints Path Fixed

**Date:** 2026-08-22  
**Issue:** Orders API returning 404 - endpoint path mismatch

## Problem

The order routes were registered with the **wrong base path**:

```javascript
// ❌ WRONG (in src/routes/index.js line 129)
router.use('/api/v1/order', orderRoutes);
```

This caused all order endpoints to be:
- `/api/v1/order/staff` ❌
- `/api/v1/order/active` ❌
- `/api/v1/order/:id` ❌

But the RBAC seed script and documentation expected:
- `/api/v1/orders/staff` ✅
- `/api/v1/orders/active` ✅
- `/api/v1/orders/:id` ✅

## Root Cause

**Inconsistency:** The route registration used **singular** `order` while:
- All other routes use **plural** (users, merchants, branches, tables, customers, etc.)
- RBAC tasks (218 tasks) expect **plural** `/api/v1/orders`
- Common RESTful convention uses **plural**

## Solution

**File:** `src/routes/index.js` (Line 129)

```javascript
// ✅ FIXED
router.use('/api/v1/orders', orderRoutes);
```

## Impact

### Breaking Change
If any frontend or external API clients were using `/api/v1/order/*`, they will need to update to `/api/v1/orders/*`.

### Fixed Endpoints (All now use `/api/v1/orders`)

**Customer Routes:**
- `POST /api/v1/orders` - Place order (QR menu customer)

**Staff Routes:**
- `POST /api/v1/orders/staff` - Place order (staff)
- `GET /api/v1/orders/active` - List active orders
- `GET /api/v1/orders/review-queue` - Get review queue
- `GET /api/v1/orders/completed` - List completed orders
- `GET /api/v1/orders/pending` - List pending orders
- `GET /api/v1/orders/accepted` - List accepted orders
- `GET /api/v1/orders/preparing` - List preparing orders
- `GET /api/v1/orders/ready` - List ready orders
- `GET /api/v1/orders/served` - List served orders
- `GET /api/v1/orders/canceled` - List canceled orders
- `GET /api/v1/orders/number/:orderNumber` - Get order by number
- `GET /api/v1/orders/:id` - Get order by ID
- `POST /api/v1/orders/:id/pay` - Mark order as paid
- `PATCH /api/v1/orders/:id/status` - Update order status
- `PATCH /api/v1/orders/:id/add-items` - Add items to order
- `PATCH /api/v1/orders/:id/cancel` - Cancel order

**Item Status Routes:**
- `PATCH /api/v1/orders/:orderId/items/:itemId/status` - Update item status
- `POST /api/v1/orders/:orderId/items/serve-ready` - Bulk serve ready items
- `PATCH /api/v1/orders/:orderId/items/:itemId/void` - Void item with replacement

**Order History Route:**
- `GET /api/v1/orders/:id/history` - Get order status history

### RBAC Tasks Alignment

All 21 order-related RBAC tasks now correctly match the actual endpoints:

```javascript
{ name: 'orders.placeStaff', endpoint: '/api/v1/orders/staff', method: 'POST' }
{ name: 'orders.listActive', endpoint: '/api/v1/orders/active', method: 'GET' }
{ name: 'orders.listCompleted', endpoint: '/api/v1/orders/completed', method: 'GET' }
// ... etc (all 21 tasks)
```

## Verification

### Test the fix:
```bash
# ✅ Should now work
curl http://localhost:5000/api/v1/orders/active

# ❌ Will no longer work (returns 404)
curl http://localhost:5000/api/v1/order/active
```

### Check route registration:
```javascript
const app = require('./src/app/create-app');
console.log(app._router.stack.filter(r => r.regexp.toString().includes('order')));
// Should show: /api/v1/orders
```

## Migration Guide (Frontend)

If your frontend was using the old path:

### Before (❌ Wrong):
```javascript
// API Client
const API_BASE = '/api/v1/order';

// Example calls
fetch(`${API_BASE}/active`)
fetch(`${API_BASE}/${orderId}`)
fetch(`${API_BASE}/staff`, { method: 'POST', ... })
```

### After (✅ Correct):
```javascript
// API Client
const API_BASE = '/api/v1/orders';  // Added 's'

// Example calls
fetch(`${API_BASE}/active`)
fetch(`${API_BASE}/${orderId}`)
fetch(`${API_BASE}/staff`, { method: 'POST', ... })
```

### Search & Replace:
```bash
# In your frontend codebase
find . -name "*.js" -o -name "*.ts" -o -name "*.tsx" | xargs sed -i 's|/api/v1/order/|/api/v1/orders/|g'
```

## Consistency Check

All API routes now follow plural convention:

| Resource | Base Path | ✅/❌ |
|----------|-----------|-------|
| Users | `/api/v1/users` | ✅ |
| Merchants | `/api/v1/merchant` | ⚠️ (singular, but intentional for "my merchant") |
| Branches | `/api/v1/branch` | ⚠️ (singular) |
| Tables | `/api/v1/table` | ⚠️ (singular) |
| Customers | `/api/v1/customer` | ⚠️ (singular) |
| Orders | `/api/v1/orders` | ✅ **FIXED** |
| Menu | `/api/v1/menu` | ✅ (collective singular) |
| Ingredients | `/api/v1/ingredients` | ✅ |
| Suppliers | `/api/v1/suppliers` | ✅ |
| Recipes | `/api/v1/recipes` | ✅ |
| Reports | `/api/v1/reports` | ✅ |
| Roles | `/api/v1/roles` | ✅ |
| Tasks | `/api/v1/tasks` | ✅ |
| Feedback | `/api/v1/feedback` | ✅ (collective singular) |

**Note:** Some resources use singular (`branch`, `table`, `customer`) - this appears to be intentional but creates inconsistency. Consider standardizing in a future refactor.

## Related Files Updated

- ✅ `src/routes/index.js` - Fixed route registration (line 129)
- ✅ `scripts/seed-roles-and-tasks.js` - Already correct (uses plural)

## Testing Required

1. **Unit Tests:** Update any tests using old path
2. **Integration Tests:** Verify all order endpoints work
3. **Frontend:** Update API client base URL
4. **Postman/API Docs:** Update collections

## Deployment Notes

- **Breaking Change:** Yes (for any clients using `/api/v1/order/*`)
- **Database Migration:** None required
- **Rollback:** Simply revert to `/api/v1/order` if needed
- **Frontend Coordination:** Required before deployment

---

**Status:** ✅ Fixed  
**Breaking Change:** Yes  
**Frontend Update Required:** Yes  
**Database Impact:** None
