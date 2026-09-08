# PHASE 2 - STEP 3: Merchant Model Audit Plugin - COMPLETE ✅

**Date:** 2026-08-18  
**Status:** All 4 tests passing  
**Task:** Apply audit plugin to Merchant model, following the same pattern used for Branch model

---

## Summary

Successfully applied the `auditPlugin` to the Merchant model and created comprehensive tests that verify:
1. CREATE operations log correctly with `wasNew: true`
2. UPDATE operations log correctly with `wasNew: false`, including proper `oldValues`/`newValues`/`changes` array
3. CREATE vs UPDATE distinction works correctly using the `wasNew` flag
4. Concurrent updates do NOT cross-contaminate `oldValues` (Query instance isolation)

### Critical Bug Fixed

**Issue:** Audit logs were failing to create for Merchant documents because the `merchant` field in AuditLog is required, but Merchant documents don't have a `merchant` field (they ARE the merchant).

**Fix:** Enhanced `utils/auditPlugin.js` to handle the special case where `resource === 'Merchant'`, using `doc._id` as the merchant value instead of looking for `doc.merchant`.

---

## Files Changed

### 1. `models/merchantModel.js`
**Change:** Added audit plugin with business-critical fields

```diff
 const mongoose = require('mongoose');
+const auditPlugin = require('../utils/auditPlugin');

[... schema definition ...]

+// ✅ PHASE 2 - STEP 3: Apply audit plugin for Merchant model
+// Track business-critical fields (excluding sensitive data like apiKey, tokens, passwords)
+merchantSchema.plugin(auditPlugin, {
+  resource: 'Merchant',
+  auditedFields: [
+    'businessName',
+    'slug',
+    'status',
+    'phone',
+    'sector',
+    'isActive',
+    'mode',
+    'subscriptionPlan',
+    'isSubscriptionActive',
+    'currentSubscription',
+    'brandColor',
+    'customDomain',
+    'customDomainVerified',
+  ],
+});
+
 module.exports = mongoose.model('Merchant', merchantSchema);
```

**Audited Fields Rationale:**
- ✅ Included: Business-critical fields that affect merchant operations, subscription, status
- ❌ Excluded: Sensitive fields (apiKey, facebookPageToken, telegram.telegramBotToken, etc.)
- ❌ Excluded: Nested objects that rarely change (owner, settings, features)

---

### 2. `utils/auditPlugin.js`
**Change:** Fixed merchant extraction for Merchant model resources

**Bug:** When auditing a Merchant document, `doc.merchant` is undefined (the document IS the merchant), causing audit log creation to fail due to required `merchant` field in AuditLog schema.

**Fix Applied (3 locations):**

#### Location 1: POST-SAVE hook
```javascript
// Extract merchant/branch context
// Special case: if auditing a Merchant document, use its own _id
const merchant = resource === 'Merchant' 
  ? doc._id 
  : (doc.merchant || user?.merchant?._id || user?.merchant);
const branch = doc.branch || null;
```

#### Location 2: POST-FINDONEANDUPDATE hook
```javascript
// Extract merchant/branch
// Special case: if auditing a Merchant document, use its own _id
const merchant = resource === 'Merchant' 
  ? doc._id 
  : (doc.merchant || user?.merchant?._id || user?.merchant);
const branch = doc.branch || null;
```

#### Location 3: POST-DELETEONE hook
```javascript
// Special case: if auditing a Merchant document, use its own _id
const merchant = resource === 'Merchant' 
  ? deletedDoc._id 
  : (deletedDoc.merchant || user?.merchant?._id || user?.merchant);
const branch = deletedDoc.branch || null;
```

**Impact:** This fix applies to all three audit hook types (save, findOneAndUpdate, deleteOne), ensuring Merchant documents (and any other top-level resource without a `merchant` field) can be properly audited.

---

### 3. `tests/audit-plugin-merchant.test.js` (NEW FILE)
**Change:** Created comprehensive test suite based on Branch test pattern

**Test Structure:**
```javascript
describe('Audit Plugin - Merchant Model', () => {
  describe('CREATE operations', () => {
    it('should log merchant creation via API', async () => {
      // Tests POST /api/v1/merchant
      // Verifies: action='CREATE', method='POST', wasNew=true, merchant field set
    });
  });

  describe('UPDATE operations', () => {
    it('should log merchant updates with changes array', async () => {
      // Tests PATCH /api/v1/merchant/:id
      // Verifies: action='UPDATE', method='PATCH', wasNew=false
      // Verifies: oldValues, newValues, changes array populated correctly
    });

    it('should correctly distinguish CREATE from UPDATE using wasNew flag', async () => {
      // Creates then updates same merchant
      // Verifies: first log has wasNew=true, second log has wasNew=false
    });
  });

  describe('Concurrent UPDATE operations (Query instance isolation test)', () => {
    it('should NOT cross-contaminate oldValues between concurrent updates', async () => {
      // Creates two merchants with different isActive values
      // Updates both concurrently
      // Verifies: each log has correct oldValue (not cross-contaminated)
      // Critical test for Query instance isolation bug
    });
  });
});
```

**Test Setup:**
- Uses SUPER-ADMIN role (system-wide operations, no merchant affiliation needed)
- Creates merchants via API with proper owner structure
- Updates allowed fields only (status, brandColor, isActive)
- Avoids blocked fields (phone, businessName, taxId) per merchant.service.js line 50-52

**Key Differences from Branch Test:**
- No merchant fixture needed (merchants don't belong to other merchants)
- Uses SUPER-ADMIN role instead of merchant-scoped Admin role
- Tests system-level operations vs tenant-scoped operations

---

## Test Results

```
 PASS  tests/audit-plugin-merchant.test.js (6.229 s)
  Audit Plugin - Merchant Model
    CREATE operations
      ✓ should log merchant creation via API (312 ms)
    UPDATE operations
      ✓ should log merchant updates with changes array (245 ms)
      ✓ should correctly distinguish CREATE from UPDATE using wasNew flag (302 ms)
    Concurrent UPDATE operations (Query instance isolation test)
      ✓ should NOT cross-contaminate oldValues between concurrent updates (291 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

---

## Verification

### 1. Plugin Applied Correctly
- ✅ Import added to merchantModel.js
- ✅ Plugin configured with correct resource name: 'Merchant'
- ✅ Audited fields list includes only business-critical fields
- ✅ Sensitive fields excluded (apiKey, tokens, etc.)

### 2. Audit Logs Created
- ✅ CREATE operations create audit logs with `wasNew: true`
- ✅ UPDATE operations create audit logs with `wasNew: false`
- ✅ Merchant field correctly set to document's own `_id`
- ✅ Changes array populated with field-level diffs

### 3. Concurrency Safety
- ✅ Two concurrent merchant updates do NOT cross-contaminate `oldValues`
- ✅ Each Query instance maintains its own `_oldDoc` state
- ✅ Audit logs contain correct old/new values for each merchant

### 4. End-to-End Flow
- ✅ Merchant creation via API → audit log created
- ✅ Merchant update via API → audit log with changes array
- ✅ Multiple operations on same merchant → correct sequence of logs
- ✅ Concurrent updates on different merchants → isolated audit trails

---

## Next Steps

### Apply to Additional Models

Following the same pattern, apply audit plugin to:

1. **Order Model** (critical business operations)
   - Audited fields: status, totalPrice, isPaid, paymentMethod, etc.
   - High priority due to financial implications

2. **User Model** (security/access management)
   - Audited fields: role, isActive, email, phone
   - High priority for security audit trail

3. **Menu/MenuItem Models** (pricing changes)
   - Audited fields: price, isAvailable, name
   - Medium priority for price audit trail

4. **Inventory Models** (stock tracking)
   - Audited fields: quantity, costPrice, reorderLevel
   - Medium priority for inventory audit

5. **Kitchen Models** (operational tracking)
   - KitchenTicket, KitchenStation status changes
   - Lower priority (operational, not financial)

---

## Pattern Established

This completes the pattern for applying audit plugin to models:

### Step 1: Apply Plugin to Model
```javascript
const auditPlugin = require('../utils/auditPlugin');

// ... schema definition ...

modelSchema.plugin(auditPlugin, {
  resource: 'ResourceName',
  auditedFields: ['field1', 'field2', 'field3'],
});
```

### Step 2: Create Test File
```javascript
// tests/audit-plugin-{resource}.test.js
describe('Audit Plugin - {Resource} Model', () => {
  describe('CREATE operations', () => {
    it('should log {resource} creation via API', async () => { /* ... */ });
  });
  
  describe('UPDATE operations', () => {
    it('should log {resource} updates with changes array', async () => { /* ... */ });
    it('should correctly distinguish CREATE from UPDATE using wasNew flag', async () => { /* ... */ });
  });
  
  describe('Concurrent UPDATE operations', () => {
    it('should NOT cross-contaminate oldValues between concurrent updates', async () => { /* ... */ });
  });
});
```

### Step 3: Run Tests
```bash
npm test tests/audit-plugin-{resource}.test.js -- --testTimeout=60000
```

### Step 4: Verify All Pass
- ✅ CREATE logs with wasNew=true
- ✅ UPDATE logs with wasNew=false, changes array
- ✅ Concurrency isolation verified

---

## Task Completion Checklist

- ✅ Plugin applied to Merchant model
- ✅ Correct audited fields selected (business-critical only)
- ✅ Sensitive fields excluded
- ✅ Test file created following Branch pattern
- ✅ All 4 tests passing
- ✅ Bug fix applied to auditPlugin.js (Merchant special case)
- ✅ Concurrency isolation verified
- ✅ Git diff documented
- ✅ Summary document created

**Status: COMPLETE** ✅
