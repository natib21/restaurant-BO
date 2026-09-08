# Mongoose Model.create() with Session - Fix Summary

**Issue:** Error when calling `Model.create()` with multiple documents and a Mongoose session
```
MongooseError: Cannot call `create()` with a session and multiple documents unless `ordered: true` is set
```

**Root Cause:** Mongoose requires the `ordered: true` option when creating multiple documents within a transaction session.

---

## Fixed Locations

### 1. **src/modules/auth/default-roles.helper.js** (Line 372)
```javascript
// BEFORE
const createdRoles = await Role.create(rolesToCreate, { session });

// AFTER
const createdRoles = await Role.create(rolesToCreate, { session, ordered: true });
```
- Creates 3 default roles (MANAGER, WAITER, KITCHEN) during merchant signup
- Called within a transaction during auth signup flow

### 2. **src/modules/kitchen/service/KitchenTicketService.js** (Lines 166, 213)
```javascript
// BEFORE
const ticket = session
  ? await KitchenTicket.create([ticketData], { session }).then(docs => docs[0])
  : await KitchenTicket.create(ticketData);

// AFTER
const ticket = session
  ? await KitchenTicket.create([ticketData], { session, ordered: true }).then(docs => docs[0])
  : await KitchenTicket.create(ticketData);
```
- Creates kitchen tickets within order processing transaction

### 3. **src/modules/order/service/OrderStateMachineService.js** (Line 777)
```javascript
// BEFORE
await OutboxEvent.create([eventData], { session });

// AFTER
await OutboxEvent.create([eventData], { session, ordered: true });
```
- Creates outbox events for order state transitions within a transaction

### 4. **src/modules/subscriptions/repositories/subscription.repository.js** (Lines 16, 151)
```javascript
// BEFORE
return Subscription.create([data], { session }).then(docs => docs[0]);
return AuditLog.create([data], { session }).then(docs => docs[0]);

// AFTER
return Subscription.create([data], { session, ordered: true }).then(docs => docs[0]);
return AuditLog.create([data], { session, ordered: true }).then(docs => docs[0]);
```
- Creates subscription records and audit logs within transactions

### 5. **src/modules/inventory/repository/InventoryRepository.js** (Line 37)
```javascript
// BEFORE
if (session) return StockMovement.create(docs, { session });

// AFTER
if (session) return StockMovement.create(docs, { session, ordered: true });
```
- Creates multiple stock movements during inventory operations

### 6. **src/modules/inventory/repository/inventory.repository.js** (Lines 98, 250)
```javascript
// BEFORE
if (session) {
  return StockMovement.create(docs, { session });
}
return AuditLog.create([data], { session });

// AFTER
if (session) {
  return StockMovement.create(docs, { session, ordered: true });
}
return AuditLog.create([data], { session, ordered: true });
```
- Creates stock movements and audit logs in inventory operations

---

## What `ordered: true` Does

When `ordered: true` is set:
- Operations execute in order
- If an error occurs, remaining operations are skipped
- Useful for multi-document transactions in MongoDB

When `ordered: false`:
- Operations execute in parallel
- All operations attempted regardless of errors

For transactions with sessions, MongoDB requires `ordered: true` to ensure proper transaction semantics.

---

## Files Modified

1. ✅ src/modules/auth/default-roles.helper.js
2. ✅ src/modules/kitchen/service/KitchenTicketService.js
3. ✅ src/modules/order/service/OrderStateMachineService.js
4. ✅ src/modules/subscriptions/repositories/subscription.repository.js
5. ✅ src/modules/inventory/repository/InventoryRepository.js
6. ✅ src/modules/inventory/repository/inventory.repository.js

---

## Verification

✅ **Signup endpoint now working**
- POST `/api/v1/auth/signup` successfully creates:
  - Merchant record
  - Business user with default roles
  - 3 default roles (MANAGER, WAITER, KITCHEN) within transaction
  - All changes committed atomically

**Test Payload:**
```json
{
  "business": "Tiru Restaurant",
  "email": "nathnaelzelalem@gmail.com",
  "firstName": "Nathnael",
  "lastName": "Zelalem",
  "password": "Nathnael@9921",
  "passwordConfirm": "Nathnael@9921",
  "phone": "251923434543"
}
```

**Result:** ✅ 201 Created - Merchant and user successfully registered

---

## Impact

- **Scope:** All transaction-based operations across the application
- **Breaking Changes:** None
- **Data Integrity:** Improved - transactions now properly enforced
- **Performance:** Minimal impact - ordered: true is atomic within sessions

---

## Lesson Learned

When using Mongoose with MongoDB transactions (sessions), always include `ordered: true` when:
- Creating multiple documents in one call: `Model.create([...], { session, ordered: true })`
- Operating within a transaction context

This ensures MongoDB enforces proper atomic semantics.
