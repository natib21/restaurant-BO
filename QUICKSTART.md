# Quick Start Guide - Orders Module Refactoring

## ✅ Verify Installation & Testing

### Step 1: Test Backend Changes

#### 1.1 Check middleware is loaded

```bash
# Start the backend
npm run dev

# Look for no errors in console
# Check that response middleware is loaded
```

#### 1.2 Test new Orders routes with curl

**Place order (staff):**

```bash
curl -X POST http://localhost:3000/api/v1/orders/staff \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": "BRANCH_ID",
    "orderType": "dine_in",
    "tableId": "TABLE_ID",
    "customerName": "John Doe",
    "items": [
      {
        "menuItemId": "MENU_ITEM_ID",
        "quantity": 1,
        "notes": "No onions"
      }
    ],
    "subtotal": 250
  }'
```

**Expected Response (201 Created):**

```json
{
  "success": true,
  "message": "Order #T... placed successfully!",
  "data": {
    "_id": "...",
    "orderNumber": "#T...",
    "status": "pending",
    "totalAmount": 250,
    ...
  }
}
```

**Test validation error:**

```bash
curl -X POST http://localhost:3000/api/v1/orders/staff \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": "BRANCH_ID",
    "orderType": "invalid_type",  # ← Invalid
    "customerName": "John",
    "items": [],  # ← Empty
    "subtotal": 0
  }'
```

**Expected Response (400 Bad Request):**

```json
{
  "success": false,
  "message": "Validation error in body",
  "errors": [
    {
      "field": "orderType",
      "message": "Valid orderType is required (dine_in, takeaway, delivery)",
      "code": "invalid_enum_value"
    },
    {
      "field": "items",
      "message": "At least one item is required",
      "code": "too_small"
    }
  ]
}
```

#### 1.3 Get active orders

```bash
curl -X GET http://localhost:3000/api/v1/orders/active \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200 OK):**

```json
{
  "success": true,
  "message": "orders retrieved successfully",
  "data": {
    "orders": [
      {
        "_id": "...",
        "orderNumber": "#T...",
        "status": "pending",
        ...
      }
    ],
    "count": 1
  },
  "meta": {
    "count": 1
  }
}
```

#### 1.4 Update order status

```bash
curl -X PATCH http://localhost:3000/api/v1/orders/ORDER_ID/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "accepted",
    "reason": "Confirmed with kitchen"
  }'
```

### Step 2: Run Integration Tests

```bash
# Run all tests
npm test

# Run only order tests
npm test -- tests/orders-integration.test.js

# Run with verbose output
npm test -- --verbose tests/orders-integration.test.js

# Run with coverage
npm test -- --coverage
```

**Expected output:**

```
PASS  tests/orders-integration.test.js
  Orders Module - Integration Tests
    POST /api/v1/orders/staff - Staff Place Order
      ✓ should create order with valid data (XXXms)
      ✓ should reject invalid order type (XXXms)
      ✓ should reject dine_in without tableId (XXXms)
      ✓ should reject empty items (XXXms)
    PATCH /api/v1/orders/:id/status - Update Order Status
      ✓ should update status to accepted (XXXms)
      ✓ should validate status transition (XXXms)
      ✓ should reject invalid order ID (XXXms)
    ... more tests ...

Test Suites: 1 passed, 1 total
Tests:       XX passed, XX total
Time:        XXs
```

### Step 3: Test Frontend Changes

#### 3.1 Check Error Boundary works

In your React component:

```typescript
import ErrorBoundary from '@/components/ErrorBoundary';

<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>
```

Simulate error (in component):

```typescript
throw new Error('Test error');
```

Expected: Error boundary catches it, shows user-friendly message with retry button.

#### 3.2 Test new query hooks

In your component:

```typescript
import { useActiveOrders, usePlaceOrderStaff } from '@/api/Queries/orderQuery-refactored';

// Reading data
const { data, isLoading, error, refetch } = useActiveOrders();

// Writing data
const { mutate, isPending } = usePlaceOrderStaff();
```

Test states:

- **Loading:** Page shows skeleton loaders
- **Error:** Page shows error message with retry button
- **Empty:** Page shows "no orders" message
- **Success:** Page shows data

#### 3.3 Use reference component

```typescript
import ActiveOrdersList from '@/features/Order/pages/ActiveOrders-refactored';

export default function MyDashboard() {
  return <ActiveOrdersList />;
}
```

---

## 🐛 Troubleshooting

### Issue: Middleware not loaded

**Check:** Is `responseMiddleware` imported in `src/app/create-app.js`?

```javascript
const responseMiddleware = require('../common/middleware/response.middleware');
```

### Issue: Validation not working

**Check:** Is `validate` middleware imported in routes?

```javascript
const validate = require('../../../common/middleware/validate.middleware');
```

### Issue: Old routes return 404

**Check:** Are both routes registered in app.js?

```javascript
app.use('/api/v1/orders', ordersRoutes); // NEW
app.use('/api/v1/order', orderRouter); // LEGACY
```

### Issue: Tests fail

**Common causes:**

1. MongoDB not running
2. Test data not seeding properly
3. Auth token invalid
4. Missing environment variables

**Solution:**

```bash
# Check MongoDB
mongod --version
# or
docker ps  # if using Docker

# Check env
cat .env.example
# Make sure all vars are set in .env

# Run tests with debug
DEBUG=* npm test
```

### Issue: Frontend not showing error states

**Check:** Are you using the refactored hooks?

```typescript
// ✅ Good
import { useActiveOrders } from '@/api/Queries/orderQuery-refactored';

// ❌ Bad (old hooks)
import { useActiveOrders } from '@/api/Queries/orderQuery';
```

---

## 📊 Checking Response Format

All responses should follow this format:

**Success:**

```javascript
{
  "success": true,
  "message": "Human readable message",
  "data": { /* ... */ },
  "meta": { /* optional pagination/metadata */ }
}
```

**Error:**

```javascript
{
  "success": false,
  "message": "Error description",
  "errors": [ /* optional array of error details */ ]
}
```

**List:**

```javascript
{
  "success": true,
  "message": "...",
  "data": {
    "items": [ /* ... */ ],
    "count": 5
  },
  "meta": { /* pagination data */ }
}
```

---

## 🔄 Backward Compatibility Check

**Old routes still work?**

```bash
# Old route should still work
curl http://localhost:3000/api/v1/order/active \
  -H "Authorization: Bearer TOKEN"

# Should return same data as new route
curl http://localhost:3000/api/v1/orders/active \
  -H "Authorization: Bearer TOKEN"
```

**Old clients continue working?**

- Yes! Legacy `/api/v1/order` routes still functional
- New clients should use `/api/v1/orders`
- Gradual migration possible

---

## 📝 Next Steps After Verification

1. **Fix any issues** found during testing
2. **Run full test suite** to check for regressions
3. **Test with frontend app** in browser
4. **Migrate other modules** using same pattern:
   ```
   - Inventory
   - Menu
   - Customers
   - Merchant
   - Payments
   ```
5. **Update client code** gradually to use new endpoints

---

## 📚 Reference Files

| What                  | Where                                                  |
| --------------------- | ------------------------------------------------------ |
| Refactoring guide     | `REFACTORING-GUIDE.md`                                 |
| Response middleware   | `src/common/middleware/response.middleware.js`         |
| Validation middleware | `src/common/middleware/validate.middleware.js`         |
| Orders routes         | `src/modules/orders/orders.routes.js`                  |
| Orders controller     | `src/modules/orders/controller/order.controller.js`    |
| Orders validators     | `src/modules/orders/validators/order.validators.js`    |
| Integration tests     | `tests/orders-integration.test.js`                     |
| Error boundary        | `src/components/ErrorBoundary.tsx`                     |
| Query hooks           | `src/api/Queries/orderQuery-refactored.ts`             |
| Reference component   | `src/features/Order/pages/ActiveOrders-refactored.tsx` |

---

## ✅ Verification Checklist

- [ ] Backend starts without errors
- [ ] New orders routes accessible
- [ ] Validation rejects invalid data (400 status)
- [ ] Valid requests succeed (201/200 status)
- [ ] Response format is consistent
- [ ] Integration tests pass
- [ ] Error boundary catches errors
- [ ] Query hooks show loading states
- [ ] Error states display properly
- [ ] Empty states display properly
- [ ] Old routes still work (backward compatible)
- [ ] Frontend components render without crash
- [ ] Retry buttons work

Once all checks pass, you're ready to migrate other modules! 🚀
