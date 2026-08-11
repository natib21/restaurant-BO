# Inventory & Subscriptions Modules: Migration Guide

## Overview

Two critical modules have been refactored into clean, layered, production-ready architectures:

1. **Inventory Module** (`src/modules/inventory/`) - Stock management with ACID transaction support
2. **Subscriptions Module** (`src/modules/subscriptions/`) - SaaS billing & feature gating

Both modules follow **NestJS-inspired layered architecture** with:
- **Controllers** — HTTP request/response handling only
- **Services** — Pure business logic (no Express dependencies)
- **Repositories** — Direct MongoDB access (thin wrappers)
- **DTOs/Validators** — Zod schemas for validation

---

## Inventory Module

### Purpose
Manages restaurant inventory stock, movements (adjustments, sales, waste), and provides transactional support for order fulfillment.

### File Structure

```
src/modules/inventory/
├── controller/
│   └── inventory.controller.js        # HTTP handlers
├── service/
│   └── inventory.service.js           # Business logic (ACID-friendly)
├── repository/
│   └── inventory.repository.js        # MongoDB access + session support
├── validators/
│   └── inventory.validator.js         # Zod schemas
└── index.js                           # Module exports
```

### Key Features

#### 1. **Stock Adjustment (`POST /adjust`)**
```javascript
const { InventoryService } = require('src/modules/inventory');

await InventoryService.adjustStock(
  merchantId,
  ingredientId,
  quantity,
  'in',           // type: 'in', 'out', 'waste', 'adjustment'
  'Purchase from supplier',  // reason
  'PO-2024-001',  // reference
  performedBy,
  5000            // cost
);
```

#### 2. **Stock Deduction for Orders (CRITICAL)**
```javascript
// Called from OrderService during order creation
const result = await InventoryService.deductStockItems(
  merchantId,
  items: [
    { ingredientId: '...', quantity: 2 },
    { ingredientId: '...', quantity: 0.5 }
  ],
  orderId,
  performedBy,
  { session }     // MongoDB session for ACID transaction
);

if (!result.success) {
  // Handle stock shortage
  console.log('Shortages:', result.shortages);
}
```

#### 3. **Pre-Order Validation**
```javascript
const validation = await InventoryService.validateStockAvailability(
  [{ ingredientId, quantity }, ...],
  { session }
);

if (!validation.available) {
  throw new Error('Insufficient stock');
}
```

#### 4. **Batch Operations**
```javascript
const results = await InventoryService.batchAdjustStock(
  merchantId,
  [
    { ingredientId: '...', quantity: 5, type: 'in', cost: 1000 },
    { ingredientId: '...', quantity: 2, type: 'waste', reason: 'Spoiled' }
  ],
  performedBy
);
```

### Zod Validators

```javascript
const {
  adjustStockSchema,
  batchAdjustStockSchema,
  deductStockSchema,
  getStockMovementsSchema,
  setStockThresholdsSchema
} = require('src/modules/inventory/validators/inventory.validator');
```

### API Endpoints

```
POST   /api/v1/inventory/adjust              # Adjust single ingredient
POST   /api/v1/inventory/batch-adjust        # Batch adjustments
GET    /api/v1/inventory/low-stock           # Low stock alerts
GET    /api/v1/inventory/stock-movements     # Audit log
PATCH  /api/v1/inventory/:id/thresholds      # Set min/max stock
POST   /api/v1/inventory/validate-order      # Pre-order validation
GET    /api/v1/inventory/valuation           # Total inventory value
```

### ACID Transaction Support

All service methods accept optional `session` parameter for MongoDB ACID transactions:

```javascript
// In OrderService:
const session = await db.startSession();
session.startTransaction();

try {
  // Deduct inventory
  const result = await InventoryService.deductStockItems(
    merchantId, items, orderId, performedBy,
    { session }  // ← Pass session here
  );

  // Create order
  const order = await OrderService.createOrder(..., { session });

  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  await session.endSession();
}
```

---

## Subscriptions Module

### Purpose
Manages merchant subscription tiers (basic, pro, enterprise), payment processing via configurable payment providers, and feature access gating.

### File Structure

```
src/modules/subscriptions/
├── controllers/
│   └── subscription.controller.js     # HTTP handlers
├── services/
│   └── subscription.service.js        # Business logic
├── repositories/
│   └── subscription.repository.js     # MongoDB access
├── dto/
│   └── subscription.dto.js            # Zod schemas + feature matrix
├── subscriptions.routes.js            # Router definition
└── index.js                           # Module exports
```

### Key Features

#### 1. **Subscription Lifecycle**

**Initiate Payment:**
```javascript
const { SubscriptionService } = require('src/modules/subscriptions');

const result = await SubscriptionService.initiateSubscription(
  merchantId,
  'pro',           // plan: 'basic' | 'pro' | 'enterprise'
  3,               // durationMonths
  merchantData     // { email, phone, businessName }
);

// Returns: { tx_ref, checkout_url, session }
```

**Verify Payment:**
```javascript
const subscription = await SubscriptionService.verifySubscription(tx_ref);
// Updates subscription to 'active' and activates merchant
```

**Get Status:**
```javascript
const status = await SubscriptionService.getSubscriptionStatus(merchantId);
// Returns: { plan, status, endDate, isActive, daysRemaining }
```

#### 2. **Feature Access Gating**

```javascript
// Check if merchant has access to feature
const { hasAccess, reason } = await SubscriptionService.checkFeatureAccess(
  merchantId,
  'inventory'  // feature name
);

if (!hasAccess) {
  throw new Error(`Feature not available: ${reason}`);
}
```

**Feature Matrix:**

```javascript
{
  basic: {
    tables: 5,
    menus: 1,
    staff: 3,
    inventory: false,
    analytics: false
  },
  pro: {
    tables: 20,
    menus: 5,
    staff: 10,
    inventory: true,
    analytics: true
  },
  enterprise: {
    tables: 'unlimited',
    menus: 'unlimited',
    inventory: true,
    analytics: true,
    dedicatedSupport: true
  }
}
```

#### 3. **Webhook Handling (Payment Provider)**

```javascript
// Automatically called when a configured provider sends payment updates
POST /api/v1/subscriptions/webhook/:provider
Headers:
  x-<provider>-signature: sha256=...
  x-<provider>-event-id: webhook_event_123

// Service handles:
// - Provider-specific signature verification
// - Event deduplication (prevents double-activation)
// - Subscription status updates
// - Merchant activation
```

#### 4. **Subscription Renewal**

```javascript
const renewal = await SubscriptionService.renewSubscription(
  merchantId,
  3  // durationMonths
);
```

### Zod DTOs

```javascript
const {
  initiateSubscriptionSchema,
  verifySubscriptionSchema,
  checkFeatureAccessSchema,
  featureAccessMatrix,
  planPricingConfig
} = require('src/modules/subscriptions/dto/subscription.dto');
```

### API Endpoints

```
POST   /api/v1/subscriptions/initiate        # Start payment
POST   /api/v1/subscriptions/verify          # Verify & activate
GET    /api/v1/subscriptions/status          # Check current status
POST   /api/v1/subscriptions/check-feature   # Feature access check
POST   /api/v1/subscriptions/renew           # Renew subscription
POST   /api/v1/subscriptions/webhook/:provider # Payment provider webhook handler
GET    /api/v1/subscriptions/expiring-soon   # Admin: expiring subs
GET    /api/v1/subscriptions/stats           # Admin: statistics
```

---

## Integration with Orders Module

### CRITICAL: ACID Transaction for Order + Inventory

The inventory module is designed to integrate seamlessly with order creation:

```javascript
// In OrderService.createOrder():

const Inventory = require('src/modules/inventory').InventoryService;
const orderSession = await db.startSession();
orderSession.startTransaction();

try {
  // 1. Validate & deduct inventory
  const stockResult = await Inventory.deductStockItems(
    merchantId,
    orderItems,
    orderId,
    userId,
    { session: orderSession }  // Pass session
  );

  if (!stockResult.success) {
    throw new Error(`Cannot fulfill order: ${stockResult.shortages}`);
  }

  // 2. Create order document
  const order = await Order.create([orderData], { session: orderSession });

  // 3. Commit transaction (all-or-nothing)
  await orderSession.commitTransaction();
  
  return order[0];
} catch (error) {
  await orderSession.abortTransaction();
  throw error;
} finally {
  await orderSession.endSession();
}
```

### Feature Gating for Orders

```javascript
// In OrderService:

async function placeOrder(merchantId, orderData) {
  const Subscription = require('src/modules/subscriptions').SubscriptionService;
  
  // Check if merchant's plan supports orders
  const { hasAccess } = await Subscription.checkFeatureAccess(
    merchantId,
    'orders'
  );
  
  if (!hasAccess) {
    throw new Error('Your subscription plan does not support orders');
  }

  // Proceed with order creation...
}
```

---

## Migration Checklist

### Inventory Module
- [x] Create Repository with session support
- [x] Create Service with ACID-friendly methods
- [x] Create Zod validators for all operations
- [x] Create Controller with HTTP wrappers
- [x] Add transactional method `deductStockItems()`
- [x] Pre-order validation method
- [x] Module index with exports

### Subscriptions Module
- [x] Create Repository with merchant linking
- [x] Create Service with payment flow
- [x] Create DTOs + feature matrix
- [x] Create Controller with all endpoints
- [x] Implement webhook signature verification
- [x] Webhook idempotency handling
- [x] Create module router
- [x] Module index with exports

### Integration
- [ ] Update OrderService to use Inventory.deductStockItems()
- [ ] Add feature gating to order endpoints
- [ ] Update subscriptions router in app.js
- [ ] Update inventory router (or use modular routes)
- [ ] Add error handling for stock shortages
- [ ] Add error handling for subscription requirements
- [ ] Write integration tests

---

## Environment Variables

```bash
# Payment provider configuration (in config.env)
PAYMENT_PROVIDER=manual
CHAPA_API_KEY=your_api_key
CHAPA_WEBHOOK_SECRET=your_webhook_secret
CHAPA_API_BASE_URL=https://api.chapa.co

# Subscription Plans (optional, can be in DTOs)
PLAN_BASIC_PRICE=1
PLAN_PRO_PRICE=1
PLAN_ENTERPRISE_PRICE=1
```

---

## Testing Strategy

### Inventory Unit Tests
```javascript
describe('InventoryService', () => {
  test('deductStockItems succeeds with available stock', async () => {
    const result = await InventoryService.deductStockItems(
      merchantId, items, orderId, userId, { session }
    );
    expect(result.success).toBe(true);
  });

  test('deductStockItems fails with insufficient stock', async () => {
    const result = await InventoryService.deductStockItems(...);
    expect(result.success).toBe(false);
    expect(result.shortages).toHaveLength(1);
  });
});
```

### Subscriptions Integration Tests
```javascript
describe('SubscriptionService Webhook', () => {
  test('processes PAYMENT_COMPLETED event', async () => {
    const result = await SubscriptionService.handleWebhookEvent(payload);
    expect(result.status).toBe('processed');
    expect(result.merchantActivated).toBe(true);
  });

  test('ignores duplicate events', async () => {
    const result1 = await SubscriptionService.handleWebhookEvent(payload, eventId);
    const result2 = await SubscriptionService.handleWebhookEvent(payload, eventId);
    expect(result2.status).toBe('duplicate');
  });
});
```

---

## Error Handling

### Inventory Errors
- `Insufficient stock` — Can't fulfill order
- `Ingredient not found` — Invalid ingredient ID
- `Failed to update stock` — Database error

### Subscription Errors
- `Invalid plan` — Unknown plan tier
- `Payment not completed` — Still pending
- `No active subscription` — Required for feature access
- `Invalid signature` — Webhook authentication failed

---

## Backward Compatibility

✅ **Inventory Module:**
- Legacy `controllers/inventoryController.js` → deleted
- Legacy `services/InventoryService.js` → shim remains for compatibility
- New module at `src/modules/inventory/`

✅ **Subscriptions Module:**
- Legacy `controllers/subscriptionController.js` → delete after migration
- New module at `src/modules/subscriptions/`

---

## Performance Considerations

1. **Inventory Deduction:** O(n) where n = number of items in order
   - Validates all items first (batch query)
   - Then deducts each item (atomic updates)
   - Single MongoDB session = single transaction

2. **Subscription Status:** O(1)
   - Single query by merchant + status index
   - Cached in merchant document if needed

3. **Feature Access:** O(1)
   - In-memory feature matrix lookup
   - No database calls

---

## Next Steps

1. **Update app.js:**
   ```javascript
   const { subscriptionRoutes } = require('src/modules/subscriptions');
   app.use('/api/v1/subscriptions', subscriptionRoutes);
   ```

2. **Update OrderService:**
   - Import `InventoryService`
   - Call `deductStockItems()` with session

3. **Add feature gating:**
   - Import `SubscriptionService`
   - Call `checkFeatureAccess()` before operations

4. **Run tests:**
   - Integration tests for order + inventory flow
   - Webhook signature verification tests
   - Feature access matrix tests

5. **Deploy & Monitor:**
   - Monitor payment provider webhook processing
   - Track inventory transaction completion rates
   - Alert on stock shortage events

---

**Refactoring Status:** ✅ Complete | Modules Ready for Integration

