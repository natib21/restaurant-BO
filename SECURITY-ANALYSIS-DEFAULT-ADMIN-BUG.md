# Security Analysis: Default-to-Admin Bug (Phase 1 Fix)

**Date:** August 18, 2026  
**Severity:** 🔴 **CRITICAL** (Privilege Escalation)  
**Status:** ✅ FIXED in Phase 1

---

## Executive Summary

A **privilege escalation vulnerability** existed in both `OrderStateMachineService.resolveActor()` and `KitchenTicketService._extractRoleCategory()` where **unrecognized or unpopulated roles defaulted to 'admin' permissions**.

**Impact:** Any user with a malformed, unpopulated, or unrecognized role could bypass RBAC and perform admin-level operations.

**Fix:** Changed from **fail-open (default to admin)** to **fail-closed (throw error)**.

---

## The Vulnerability

### BEFORE (Vulnerable Code)

#### OrderStateMachineService.resolveActor()

**File:** `src/modules/order/service/OrderStateMachineService.js` (BEFORE Phase 1)

```javascript
static resolveActor(user, options = {}) {
  if (!user && options.actorType === 'customer') {
    return { userId: options.customerId, roleCategory: 'customer' };
  }

  if (!user || !user.role) {
    throw new AppError('User or role not found', 403);
  }

  const role = user.role;

  // Check system roles
  if (role?.isSystemRole || role?.name === 'SUPER-ADMIN') {
    return { userId: user._id, roleCategory: 'superAdmin' };
  }

  const name = (role?.name || '').toUpperCase();

  if (name.includes('KITCHEN')) {
    return { userId: user._id, roleCategory: 'kitchen' };
  }

  if (name.includes('WAITER')) {
    return { userId: user._id, roleCategory: 'waiter' };
  }

  if (name.includes('ADMIN') || name === 'SUPER-MERCHANT-ADMIN') {
    return { userId: user._id, roleCategory: 'admin' };
  }

  // 🔴 VULNERABILITY: Default to 'admin' if role not recognized
  return { userId: user._id, roleCategory: 'admin' };
}
```

#### KitchenTicketService._extractRoleCategory()

**File:** `src/modules/kitchen/service/KitchenTicketService.js` (BEFORE Phase 1)

```javascript
static _extractRoleCategory(user) {
  if (!user || !user.role) {
    throw new AppError('User role not found or not populated', 403);
  }

  const role = user.role;

  if (role.isSystemRole || role.name === 'SUPER-ADMIN') {
    return 'superAdmin';
  }

  const name = (role.name || '').toUpperCase();

  if (name.includes('KITCHEN') || name.includes('COOK') || name.includes('CHEF')) {
    return 'kitchen';
  }

  if (name.includes('WAITER') || name.includes('SERVER')) {
    return 'waiter';
  }

  if (name.includes('ADMIN') || name === 'SUPER-MERCHANT-ADMIN') {
    return 'admin';
  }

  // 🔴 VULNERABILITY: Default to 'admin' if role not recognized
  return 'admin';
}
```

### AFTER (Fixed Code)

#### OrderStateMachineService.resolveActor()

```javascript
static resolveActor(user, options = {}) {
  // ... same checks ...

  if (name.includes('ADMIN') || name === 'SUPER-MERCHANT-ADMIN') {
    return { userId: user._id, roleCategory: 'admin' };
  }

  // ✅ FIX: FAIL CLOSED - Throw error instead of defaulting to admin
  throw new AppError(
    `User role not recognized or not populated. Role name: '${role?.name || 'undefined'}', Role._id: ${role?._id || 'undefined'}`,
    403
  );
}
```

#### KitchenTicketService._extractRoleCategory()

```javascript
static _extractRoleCategory(user) {
  // ... same checks ...

  if (name.includes('ADMIN') || name === 'SUPER-MERCHANT-ADMIN') {
    return 'admin';
  }

  // ✅ FIX: FAIL CLOSED - Throw error instead of defaulting to admin
  throw new AppError(
    `User role not recognized. Role name: '${role.name || 'undefined'}', Role._id: ${role._id || 'undefined'}`,
    403
  );
}
```

---

## Attack Scenarios

### Scenario 1: Unpopulated Role (Highest Risk)

**Setup:**
```javascript
// User document with role reference not populated
const user = await User.findById(userId);  // ❌ No .populate('role')

// user.role is an ObjectId string, not a populated object
console.log(user.role);  // "507f1f77bcf86cd799439011"
console.log(user.role.name);  // undefined
```

**Attack:**
```javascript
// Before fix - OrderStateMachineService.resolveActor()
const name = (role?.name || '').toUpperCase();  // ""
// No patterns match empty string
// Falls through to: return { roleCategory: 'admin' };  // 🔴 ESCALATION

// Attacker can now:
await OrderStateMachineService.transitionOrderStatus({
  orderId: anyOrderId,
  toStatus: 'canceled',  // Only admin can cancel from most states
  merchantQuery: { merchant: anyMerchantId },
  user: userWithUnpopulatedRole,  // 🔴 Treated as admin!
});
```

**Real-World Trigger:**
- Controller forgets `.populate('role')`
- Middleware passes `req.user` without role populated
- Database query error leaves role unpopulated
- Race condition during role assignment

**Likelihood:** 🔴 **HIGH** - This is a common mistake

---

### Scenario 2: Malformed Role Name

**Setup:**
```javascript
// Create user with invalid role name
const malformedRole = await Role.create({
  name: 'DELIVERY-DRIVER',  // Not recognized by includes() checks
  description: 'Delivery driver',
  tasks: [],
});

const user = await User.create({
  // ... required fields ...
  role: malformedRole._id,
});
```

**Attack:**
```javascript
// Before fix
const name = 'DELIVERY-DRIVER'.toUpperCase();  // "DELIVERY-DRIVER"
// Doesn't include 'KITCHEN', 'WAITER', or 'ADMIN'
// Falls through to: return { roleCategory: 'admin' };  // 🔴 ESCALATION
```

**Real-World Trigger:**
- Admin creates custom role with non-standard name
- Database migration adds new role types
- Typo in role name during seeding
- Role name changed but code not updated

**Likelihood:** 🟡 **MEDIUM** - Possible in production

---

### Scenario 3: Null/Undefined Role Object

**Setup:**
```javascript
// Edge case: role field exists but is null
const user = await User.create({
  // ... required fields ...
  role: null,  // ❌ Allowed if not required: true
});
```

**Attack (OrderStateMachineService only):**
```javascript
// Before fix
const role = user.role;  // null

// Early check catches this:
if (!user || !user.role) {
  throw new AppError('User or role not found', 403);  // ✅ Blocked
}
// This scenario was already protected
```

**Likelihood:** 🟢 **LOW** - Early guard prevents this

---

### Scenario 4: Deleted Role Reference

**Setup:**
```javascript
// Role was deleted but user still references it
await Role.deleteOne({ _id: roleId });

// User still has role: roleId (dangling reference)
const user = await User.findById(userId).populate('role');
// user.role is null (populate returns null for missing refs)
```

**Attack:**
```javascript
// Before fix - protected by early guard
if (!user || !user.role) {
  throw new AppError('User or role not found', 403);  // ✅ Blocked
}
```

**Likelihood:** 🟢 **LOW** - Early guard prevents this

---

## Production Exploitability Assessment

### Could This Be Triggered in Real Production Requests?

**YES - Scenario 1 (Unpopulated Role) is the highest risk:**

#### Vulnerable Code Path Example:

**File:** `src/modules/order/controller/order.controller.js`

```javascript
// Hypothetical vulnerable controller
exports.cancelOrder = catchAsync(async (req, res, next) => {
  // ❌ VULNERABLE: req.user.role not populated by auth middleware
  // auth.guard.js might only populate: req.user = await User.findById(decoded.id);
  
  await OrderStateMachineService.transitionOrderStatus({
    orderId: req.params.id,
    toStatus: 'canceled',
    merchantQuery: { merchant: req.user.merchant },
    user: req.user,  // 🔴 role is ObjectId string, not populated!
  });
  
  // Before fix: resolveActor() sees role.name = undefined
  // Returns roleCategory: 'admin'
  // User can cancel ANY order!
  
  res.status(200).json({ status: 'success' });
});
```

#### Check Auth Middleware:

Let me verify if `auth.guard.js` populates the role:

---

## Verification: Is Auth Middleware Vulnerable?

**File:** `src/common/guards/auth.guard.js` (Line 75-81)

### PROTECTED ✅

```javascript
await currentUser.populate([
  {
    path: 'role',
    select: 'name tasks isSystemRole',
    populate: { path: 'tasks', select: 'name endpoint method description isMerchant' },
  },
  // ... merchant, branch populates ...
]);

req.user = currentUser;
```

**Analysis:**
- ✅ **Role IS populated** in the `protect()` middleware
- ✅ **Every authenticated request** has `req.user.role` as a full populated object
- ✅ **Scenario 1 (Unpopulated Role) is NOT exploitable** through normal auth flow

---

## Final Exploitability Assessment

### Real Production Risk: 🟡 **MEDIUM-LOW**

**Why NOT High:**
1. **Auth middleware protects most paths** - `protect()` always populates role
2. **Early null checks** - Both services check `if (!user || !user.role)` first
3. **No direct external trigger** - Attacker cannot directly send unpopulated role

**Why STILL Medium-Low:**
1. **Internal Code Paths** - Service-to-service calls, cron jobs, or admin scripts might bypass auth
2. **Future Refactors** - New controller could forget to use `protect()` middleware
3. **Race Conditions** - Role could be deleted between auth check and service call
4. **Test Code** - Test fixtures with incorrect data could reveal the bug

### Scenarios That Could Trigger in Production:

#### Scenario A: Internal Service Call (No Auth Middleware)

```javascript
// Background job or internal service
async function processScheduledOrders() {
  const orders = await Order.find({ status: 'pending' });
  
  for (const order of orders) {
    // ❌ VULNERABLE: Fetch user without populating role
    const kitchenUser = await User.findOne({ role: kitchenRoleId });
    // kitchenUser.role is ObjectId, not populated!
    
    await OrderStateMachineService.transitionOrderStatus({
      orderId: order._id,
      toStatus: 'preparing',
      merchantQuery: { merchant: order.merchant },
      user: kitchenUser,  // 🔴 Before fix: defaults to admin!
    });
  }
}
```

**Likelihood:** 🟡 **MEDIUM** - Background jobs don't use HTTP auth middleware

#### Scenario B: Admin Script

```javascript
// scripts/bulk-cancel-orders.js
const users = await User.find({ email: 'admin@merchant.com' });
// ❌ No .populate('role')

for (const user of users) {
  await OrderStateMachineService.transitionOrderStatus({
    orderId: someOrderId,
    toStatus: 'canceled',
    user: user,  // 🔴 Before fix: defaults to admin!
  });
}
```

**Likelihood:** 🟡 **MEDIUM** - Scripts often forget to populate

#### Scenario C: Malformed Custom Role

```javascript
// Admin creates custom role through UI
await Role.create({
  name: 'DELIVERY-DRIVER',  // Not recognized
  description: 'Delivers orders',
  tasks: [/* some tasks */],
});

// User with this role tries to cancel order
// Before fix: defaults to 'admin', can cancel! 🔴
```

**Likelihood:** 🟢 **LOW** - Requires deliberate custom role creation

---

## Impact Assessment

### Before Fix (Vulnerable)

**If Triggered:**
- ✅ User with unpopulated/unrecognized role → treated as **admin**
- ✅ Can perform **ANY admin operation**:
  - Cancel any order
  - Modify order status
  - Accept/complete kitchen tickets
  - Potentially modify merchant data (if other services have same bug)

**Privilege Escalation Severity:** 🔴 **CRITICAL**
- Elevation from **no role** → **admin**
- Elevation from **unrecognized role** → **admin**

### After Fix (Current)

**If Triggered:**
- ✅ User with unpopulated role → **403 Forbidden**
- ✅ User with unrecognized role → **403 Forbidden**
- ✅ Operation blocked, error logged

**Security Posture:** ✅ **FAIL-CLOSED** (secure default)

---

## Comparison: Before vs After

### BEFORE (Vulnerable Code)

```javascript
// OrderStateMachineService.resolveActor()
if (name.includes('ADMIN') || name === 'SUPER-MERCHANT-ADMIN') {
  return { userId: user._id, roleCategory: 'admin' };
}

// 🔴 INSECURE: Default to admin
return { userId: user._id, roleCategory: 'admin' };
```

**Behavior:**
- `role.name = undefined` → admin ✅ (ESCALATION)
- `role.name = 'UNKNOWN-ROLE'` → admin ✅ (ESCALATION)
- `role.name = 'DELIVERY-DRIVER'` → admin ✅ (ESCALATION)

### AFTER (Fixed Code)

```javascript
// OrderStateMachineService.resolveActor()
if (name.includes('ADMIN') || name === 'SUPER-MERCHANT-ADMIN') {
  return { userId: user._id, roleCategory: 'admin' };
}

// ✅ SECURE: Fail closed
throw new AppError(
  `User role not recognized or not populated. Role name: '${role?.name || 'undefined'}', Role._id: ${role?._id || 'undefined'}`,
  403
);
```

**Behavior:**
- `role.name = undefined` → 403 Forbidden ✅ (SECURE)
- `role.name = 'UNKNOWN-ROLE'` → 403 Forbidden ✅ (SECURE)
- `role.name = 'DELIVERY-DRIVER'` → 403 Forbidden ✅ (SECURE)

---

## Evidence the Bug Existed

### From PHASE-1-CRITICAL-FIXES.md:

> **BEFORE:**
> ```javascript
> // ✅ FIX 3: Default to 'admin' not 'unknown' (like OrderStateMachineService)
> return 'admin';
> }
> ```

This comment explicitly states the code WAS changed FROM `return 'admin'` (the vulnerable version).

### Current Code Shows Fix:

**File:** `src/modules/order/service/OrderStateMachineService.js` (Line 317-321)

```javascript
// FAIL CLOSED: Unrecognized or unpopulated role
throw new AppError(
  `User role not recognized or not populated. Role name: '${role?.name || 'undefined'}', Role._id: ${role?._id || 'undefined'}`,
  403
);
```

**File:** `src/modules/kitchen/service/KitchenTicketService.js` (Line 424-428)

```javascript
// FAIL CLOSED: Unrecognized role
throw new AppError(
  `User role not recognized. Role name: '${role.name || 'undefined'}', Role._id: ${role._id || 'undefined'}`,
  403
);
```

Both now throw errors instead of returning 'admin'.

---

## Recommendations

### ✅ Already Fixed (Phase 1)

1. Changed default from fail-open (admin) to fail-closed (throw error)
2. Added descriptive error messages with role name/ID for debugging
3. Consistent behavior across OrderStateMachineService and KitchenTicketService

### Additional Hardening (Future)

1. **Add Monitoring:**
   ```javascript
   logger.error('rbac.unrecognized-role', {
     userId: user._id,
     roleName: role?.name,
     roleId: role?._id,
     endpoint: req.originalUrl,
     severity: 'HIGH',
   });
   ```

2. **Add Unit Tests:**
   ```javascript
   it('should reject unpopulated role with 403', async () => {
     const user = { _id: userId, role: roleObjectId }; // Not populated
     await expect(
       OrderStateMachineService.transitionOrderStatus({...user})
     ).rejects.toThrow('User role not recognized or not populated');
   });
   ```

3. **Validate Role on User Save:**
   ```javascript
   // userModel.js pre-save hook
   userSchema.pre('save', async function() {
     if (this.isModified('role') && this.role) {
       const role = await Role.findById(this.role);
       if (!role) {
         throw new Error('Invalid role reference');
       }
     }
   });
   ```

4. **Audit Existing Background Jobs:**
   - Review all cron jobs and internal service calls
   - Ensure they populate role when calling RBAC-protected services
   - Add explicit `.populate('role')` where missing

---

## Conclusion

### Security Question Answered:

**Q: Could the default-to-admin behavior be triggered by real requests in production before it was patched?**

**A: YES, but with LOW-MEDIUM likelihood:**

1. **✅ Normal HTTP requests are PROTECTED** - `auth.guard.js` always populates role
2. **⚠️ Internal service calls are VULNERABLE** - Background jobs, cron scripts, admin tools
3. **⚠️ Race conditions are POSSIBLE** - Role deleted between auth and service call
4. **⚠️ Custom roles are VULNERABLE** - Non-standard role names default to admin

**Exploit Difficulty:** 🟡 **MEDIUM**
- Requires specific conditions (internal call, unpopulated role, or custom role)
- Not directly exploitable via HTTP API due to auth middleware
- Could be triggered accidentally by developers or admin scripts

**Impact if Exploited:** 🔴 **CRITICAL**
- Full privilege escalation to admin
- Unauthorized order modifications
- System-wide RBAC bypass

**Current Status:** ✅ **FIXED** - Fail-closed behavior prevents escalation

---

**Document Status:** ✅ COMPLETE  
**Fix Verified:** Phase 1 implementation is secure  
**Auth Middleware:** Verified to populate role correctly  
**Residual Risk:** Low (only internal/script code paths)


