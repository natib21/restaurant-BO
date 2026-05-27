# Orders Module Refactor - Complete Implementation Guide

## 🎯 What Was Done

This document explains the **Orders module refactoring** that serves as the reference implementation for all other modules. It covers:
1. Response format standardization
2. Request validation middleware
3. Module routes restructuring
4. Controller simplification
5. Frontend error handling
6. Integration tests

---

## 📊 BEFORE vs AFTER STRUCTURE

### Backend Orders Module

**BEFORE (Monolithic/Inconsistent):**
```
controllers/orderController.js
  - HTTP handlers mixed with business logic
  - Inconsistent response format
  - Validation inside controller methods
  - Complex error handling
  - Hard to test

routes/orderRouter.js
  - No validation middleware
  - Routes point to legacy controller

models/orderModel.js
  - Still main source of truth
  - Mixed with legacy code
```

**AFTER (Clean/Modular):**
```
src/modules/orders/
├── orders.routes.js ✨ NEW
│   - Clean route definitions
│   - Validation middleware on each route
│   - Clear documentation
│
├── controller/order.controller.js ✨ REFACTORED
│   - HTTP only (no business logic)
│   - Uses res.sendSuccess/sendError
│   - Delegates to services
│   - 70% smaller
│
├── service/OrderService.js
│   - Business logic
│   - Transactions
│   - State management
│
├── repository/OrderRepository.js
│   - Database queries only
│   - No business rules
│
└── validators/order.validators.js ✨ REFACTORED
    - Zod schemas (NEW)
    - Legacy assertions (for compatibility)
    - Comprehensive validation
```

---

## 🔧 IMPLEMENTATION DETAILS

### 1. Response Middleware (`src/common/middleware/response.middleware.js`)

**What it does:**
- Provides 3 helper methods: `res.sendSuccess()`, `res.sendError()`, `res.sendList()`
- Ensures ALL responses follow standard format
- Works globally (added once in app.js)

**Files Created:**
- ✅ `src/common/middleware/response.middleware.js`

**Usage:**
```javascript
// Success
res.sendSuccess(order, 201, 'Order placed!', { orderId: order._id });
// Returns: { success: true, message: "...", data: {...}, meta: {...} }

// Error
res.sendError('Validation failed', 400, errors);
// Returns: { success: false, message: "...", errors: [...] }

// List
res.sendList(orders, 'orders', 200, { count: 5 });
// Returns: { success: true, message: "orders retrieved...", data: { orders: [...], count: 5 }, meta: {...} }
```

---

### 2. Validation Middleware (`src/common/middleware/validate.middleware.js`)

**What it does:**
- Centralizes Zod validation
- Catches validation errors automatically
- Returns standard error format
- Attaches validated data to request

**Files Created:**
- ✅ `src/common/middleware/validate.middleware.js`

**Usage in routes:**
```javascript
const validate = require('../../../common/middleware/validate.middleware');
const { placeOrderStaffSchema } = require('../validators/order.validators');

router.post(
  '/staff',
  validate(placeOrderStaffSchema, 'body'),  // ← Validation middleware
  placeOrder  // ← Controller only handles HTTP
);

// In controller:
exports.placeOrder = (req, res, next) => {
  const validatedData = req.validatedBody;  // ← Already validated!
  // ... rest of logic
};
```

---

### 3. Zod Validators (`src/modules/orders/validators/order.validators.js`)

**What it does:**
- Defines schemas for all order operations
- Uses Zod for type-safe validation
- Includes composition and conditional logic
- Maintains backward compatibility

**Files Updated:**
- ✅ `src/modules/orders/validators/order.validators.js`

**Schema Examples:**
```javascript
const placeOrderStaffSchema = z.object({
  branchId: z.string().min(1, 'Branch ID is required'),
  orderType: z.enum(['dine_in', 'takeaway', 'delivery']),
  tableId: z.string().optional(),
  customerName: z.string().min(1).max(100),
  items: z.array(orderItemSchema).min(1),
  subtotal: z.number().positive(),
}).refine(
  data => data.orderType !== 'dine_in' || data.tableId,
  { message: 'tableId is required for dine-in orders', path: ['tableId'] }
);
```

---

### 4. Clean Routes File (`src/modules/orders/orders.routes.js`)

**What it does:**
- Single source of truth for all order routes
- Validation middleware on each route
- Clear separation of customer vs staff routes
- Well-documented with JSDoc

**Files Created:**
- ✅ `src/modules/orders/orders.routes.js`

**Structure:**
```javascript
// Customer routes (no auth required, table session protected)
router.post('/', protectTableSession, validate(...), placeOrder);

// Staff routes (JWT auth required)
router.use(protect);
router.get('/active', validate(...), getActiveOrders);
router.patch('/:id/status', validate(...), updateOrderStatus);
```

---

### 5. Thin Controller (`src/modules/orders/controller/order.controller.js`)

**What it does:**
- HTTP request/response only
- NO business logic
- NO database queries
- Delegates everything to services
- Uses response helpers

**Files Updated:**
- ✅ `src/modules/orders/controller/order.controller.js`

**Before (70 lines of logic):**
```javascript
exports.placeOrder = catchAsync(async (req, res, next) => {
  const { items } = req.body;
  const { tableId, customerId } = req;
  
  // Validation
  if (!branchId) { ... }
  
  // Business logic
  const { order, replayed } = await OrderTransactionService...
  
  // Multiple response formats
  res.status(201).json({
    status: 'success',
    message: `Order ${order.orderNumber} sent to kitchen!`,
    data: { order: {...} }
  });
});
```

**After (20 lines):**
```javascript
exports.placeOrder = catchAsync(async (req, res, next) => {
  // Data already validated ✓
  const items = req.validatedBody?.items;
  
  // Delegate to service ✓
  const { order, replayed } = await OrderTransactionService.executePlaceOrder({...});
  
  // Use response helper ✓
  res.sendSuccess(order, 201, `Order ${order.orderNumber} sent to kitchen!`);
});
```

**Benefits:**
- 70% smaller
- Easy to test
- Easy to understand
- No surprises

---

### 6. Integration Tests (`tests/orders-integration.test.js`)

**What it does:**
- Tests full request → response flow
- Tests validation errors
- Tests business logic
- Tests response format compliance

**Files Created:**
- ✅ `tests/orders-integration.test.js`

**Test Structure:**
```javascript
describe('POST /api/v1/orders/staff - Staff Place Order', () => {
  it('should create order with valid data', async () => {
    const response = await request(app)
      .post('/api/v1/orders/staff')
      .send({...});
    
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });
  
  it('should reject invalid order type', async () => {
    // ...
  });
});
```

---

## 🎨 Frontend Changes

### 1. Error Boundary Component (`src/components/ErrorBoundary.tsx`)

**What it does:**
- Catches React component errors
- Shows user-friendly error message
- Provides retry button
- Prevents white screen of death

**Files Created:**
- ✅ `src/components/ErrorBoundary.tsx`

**Usage:**
```typescript
<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>
```

---

### 2. Improved Query Hooks (`src/api/Queries/orderQuery-refactored.ts`)

**What it does:**
- Smart retry logic (doesn't retry validation errors)
- Proper error handling
- Loading states with `isLoading`
- Mutation success/error handling
- Query invalidation

**Files Created:**
- ✅ `src/api/Queries/orderQuery-refactored.ts`

**Hook Examples:**

```typescript
// Query (read)
const { data, isLoading, error, refetch } = useActiveOrders();

// Mutation (write)
const { mutate, isPending, error } = usePlaceOrderStaff();
```

---

### 3. Reference Component (`src/features/Order/pages/ActiveOrders-refactored.tsx`)

**What it does:**
- Shows proper loading state (skeleton loaders)
- Shows error state (with retry)
- Shows empty state
- Shows success state with real data

**Files Created:**
- ✅ `src/features/Order/pages/ActiveOrders-refactored.tsx`

**State Handling:**
```typescript
if (isLoading) return <OrdersLoadingState />;
if (error) return <OrdersErrorState error={error} refetch={refetch} />;
if (!orders?.length) return <OrdersEmptyState />;
return <OrdersList orders={orders} />;
```

---

## 🔗 Integration Points

### App Setup (`src/app/create-app.js`)

**Changes Made:**
1. ✅ Added response middleware import
2. ✅ Registered response middleware (after enrichBranchContext)
3. ✅ Registered new orders routes at `/api/v1/orders`
4. ✅ Kept legacy routes at `/api/v1/order` (backward compatibility)

**Code:**
```javascript
// Middleware
app.use(responseMiddleware);

// Routes
app.use('/api/v1/orders', ordersRoutes);      // ← NEW (preferred)
app.use('/api/v1/order', orderRouter);        // ← LEGACY (deprecated)
```

---

## 📋 Request/Response Examples

### Place Order (Staff)

**Request:**
```json
POST /api/v1/orders/staff

{
  "branchId": "507f1f77bcf86cd799439011",
  "orderType": "dine_in",
  "tableId": "507f1f77bcf86cd799439012",
  "customerName": "John Doe",
  "customerPhone": "+251911111111",
  "items": [
    {
      "menuItemId": "507f1f77bcf86cd799439013",
      "quantity": 2,
      "notes": "Extra cheese"
    }
  ],
  "subtotal": 500,
  "notes": "Customer prefers no onions"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Order #T1234567890 placed successfully!",
  "data": {
    "_id": "507f1f77bcf86cd799439014",
    "orderNumber": "#T1234567890",
    "orderType": "dine_in",
    "status": "pending",
    "totalAmount": 500,
    "tableNumber": "5",
    "customerName": "John Doe",
    "placedAt": "2024-05-26T10:30:00Z",
    "items": [...]
  }
}
```

**Validation Error (400):**
```json
{
  "success": false,
  "message": "Validation error in body",
  "errors": [
    {
      "field": "orderType",
      "message": "Valid orderType is required (dine_in, takeaway, delivery)",
      "code": "invalid_enum_value"
    }
  ]
}
```

---

## 🚀 How to Apply This Pattern to Other Modules

### For Inventory Module:

```
1. Create /src/modules/inventory/inventory.routes.js
   - Same structure as orders.routes.js
   - Use validate() middleware for all routes

2. Create /src/modules/inventory/validators/inventory.validators.js
   - Define Zod schemas for stock deduction, updates, etc.

3. Refactor /src/modules/inventory/controller/inventory.controller.js
   - Remove business logic
   - Use validated data from middleware
   - Use res.sendSuccess/sendError

4. Ensure repository exists and has only DB queries

5. Write integration tests in /tests/inventory-integration.test.js

6. Register in app.js:
   const inventoryRoutes = require('../modules/inventory/inventory.routes');
   app.use('/api/v1/inventory-mgmt', inventoryRoutes);
```

---

## ✅ Backward Compatibility

**Legacy Routes Still Work:**
- `/api/v1/order` → still maps to old routes
- Old controllers still export via shim
- No breaking changes to existing clients

**Migration Path:**
1. New clients use `/api/v1/orders` (preferred)
2. Old clients continue using `/api/v1/order`
3. Eventually deprecate legacy routes
4. Easy to track which clients use old API

---

## 📈 Benefits Summary

| Aspect | Before | After |
|--------|--------|-------|
| Response Consistency | ❌ Inconsistent | ✅ Standardized |
| Validation | ❌ Inside controller | ✅ Middleware + Zod |
| Controller Size | ❌ 100+ lines | ✅ 20-30 lines |
| Error Handling | ❌ Scattered | ✅ Centralized |
| Frontend Error Handling | ❌ No error states | ✅ Full state handling |
| Testing | ⚠️ Difficult | ✅ Easy (thin controller) |
| Documentation | ❌ Sparse | ✅ Comprehensive |
| Maintainability | ❌ Hard | ✅ Easy |

---

## 🧪 Running Tests

```bash
# Run all tests
npm test

# Run only order integration tests
npm test -- tests/orders-integration.test.js

# Run with coverage
npm test -- --coverage
```

---

## 📝 Next Steps

1. **Test the changes:**
   - Run existing tests
   - Run new integration tests
   - Test manually with frontend

2. **Migrate other modules** using same pattern:
   - Inventory
   - Menu
   - Customers
   - Merchant
   - Payments

3. **Gradual frontend adoption:**
   - Use new `orderQuery-refactored.ts` hooks
   - Update components to handle loading/error states
   - Wrap features in ErrorBoundary

4. **Documentation:**
   - Update API docs with new endpoints
   - Create migration guide for other modules
   - Document common patterns

---

## 📚 Files Changed/Created

### Backend
- ✅ `src/common/middleware/response.middleware.js` (NEW)
- ✅ `src/common/middleware/validate.middleware.js` (NEW)
- ✅ `src/modules/orders/orders.routes.js` (NEW)
- ✅ `src/modules/orders/controller/order.controller.js` (REFACTORED)
- ✅ `src/modules/orders/validators/order.validators.js` (REFACTORED)
- ✅ `src/app/create-app.js` (UPDATED)
- ✅ `controllers/errorController.js` (UPDATED)
- ✅ `tests/orders-integration.test.js` (NEW)

### Frontend
- ✅ `src/components/ErrorBoundary.tsx` (NEW)
- ✅ `src/api/Queries/orderQuery-refactored.ts` (NEW)
- ✅ `src/features/Order/pages/ActiveOrders-refactored.tsx` (NEW)

**Total: 11 files created/updated**

---

## 💡 Key Takeaways

1. **Middleware handles cross-cutting concerns** (response format, validation)
2. **Controllers are HTTP only** (thin, testable, readable)
3. **Services contain business logic** (complex operations, transactions)
4. **Repositories handle DB queries** (single responsibility)
5. **Validation at the edge** (early exit, consistent errors)
6. **Frontend handles all states** (loading, error, empty, success)
7. **Tests validate contracts** (not implementation details)

---

## 🤔 Q&A

**Q: Why keep legacy routes?**
A: Backward compatibility. Frontend can migrate gradually without breaking production.

**Q: Do we need to migrate all modules?**
A: Yes, for consistency. But prioritize: orders → inventory → menu → rest.

**Q: Can I use both validation methods?**
A: Yes! Legacy assertions still work. But prefer Zod + middleware for new code.

**Q: What if validation fails?**
A: Middleware returns 400 with error details. Controller never sees invalid data.

**Q: How do we handle file uploads?**
A: Move multer before validation (raw data). See `/resizeOrderPaymentPhoto` example.

---

**Questions? Issues? Ready to migrate another module?**
