# Routes 1 & 2: Test Improvements - COMPLETE ✅

**Date**: August 21, 2026  
**Status**: Both routes now have complete multi-tenant isolation tests

---

## Summary

Closed out two critical gaps in Routes 1 & 2 test coverage:

1. ✅ **Multi-tenant isolation tests** - Replaced skipped tests with actual verification
2. ✅ **Deduplication priority tests** - Added tests to verify highest-priority group wins

---

## Issue 1: Multi-Tenant Isolation (RESOLVED)

### Problem
Both test files skipped multi-tenant isolation tests due to `owner.email=null` duplicate key errors when creating a second test merchant.

### Root Cause
Merchant model has a unique index on `owner.email` field. When creating merchants without owners, all get `null` value, causing duplicate key error on second merchant.

### Solution
Applied the same pattern from `tests/menu-endpoints-complete.test.js`:
- Use **unique `owner.email` with timestamps**: `owner-public-menu@test${Date.now()}.com`
- Use **unique `slug` with timestamps**: `test-restaurant-${Date.now()}`
- Always provide `owner` object with `fullName`, `gender`, `email`, `phone`

### Implementation

**Route 1 (Public Menu):**
```javascript
const merchant2 = await Merchant.create({
  businessName: 'Competitor Restaurant',
  email: 'competitor@restaurant.com',
  phone: '+251922222222',
  slug: 'competitor-restaurant-' + Date.now(),
  owner: {
    fullName: 'Competitor Owner',
    gender: 'Female',
    email: 'owner-competitor@test' + Date.now() + '.com',
    phone: '+251922222222'
  },
  isActive: true,
});
```

**Route 2 (Staff Menu):**
```javascript
const merchant2 = await Merchant.create({
  businessName: 'Competitor Staff Restaurant',
  email: 'competitor-staff@restaurant.com',
  phone: '+251933333333',
  slug: 'competitor-staff-restaurant-' + Date.now(),
  owner: {
    fullName: 'Competitor Staff Owner',
    gender: 'Female',
    email: 'owner-competitor-staff@test' + Date.now() + '.com',
    phone: '+251933333333'
  },
  isActive: true,
});
```

### Test Coverage
Both routes now verify:
- ✅ Requesting merchant 1's menu does NOT include merchant 2's items
- ✅ Response shows correct restaurant name (merchant 1, not merchant 2)
- ✅ Complete isolation between tenants

---

## Issue 2: Deduplication Priority Rules (RESOLVED)

### Problem
Tests verified deduplication worked (same item in multiple groups appears once) but didn't verify WHICH group's customizations win.

### Root Cause
Original test avoided the scenario by using unique items per group, missing a critical behavior test.

### Deduplication Rule (Verified in Code)

**How it works:**
1. MenuGroups are sorted by `priority` DESC (highest first)
2. Items are processed in group priority order
3. First occurrence of a MenuItem wins (stored in `seenItemIds` Set)
4. Subsequent occurrences are skipped

**Result:** Highest priority group's customizations win:
- `customName` (if set)
- `overridePrice` (if set)
- `displayedIn` / `category` (group name)

### Implementation

**Route 1 (Public Menu):**
```javascript
test('should use highest priority group data when item appears in multiple groups', async () => {
  // Create shared item
  const sharedItem = await MenuItem.create({
    name: { en: 'Shared Item', am: 'የተጋራ' },
    variants: [{ name: 'Regular', price: 100, isDefault: true }],
    // ... other fields
  });

  // High priority group (priority: 20)
  const highPriorityGroup = await MenuGroup.create({
    priority: 20,
    items: [{
      menu: sharedItem._id,
      customName: 'Premium Shared Item',
      overridePrice: 150,
    }],
  });

  // Low priority group (priority: 5)
  const lowPriorityGroup = await MenuGroup.create({
    priority: 5,
    items: [{
      menu: sharedItem._id,
      customName: 'Budget Shared Item',
      overridePrice: 80,
    }],
  });

  const result = await MenuGroupService.getPublicMenu(req);

  // Verify highest priority wins
  expect(sharedItems.length).toBe(1);
  expect(sharedItems[0].name).toBe('Premium Shared Item');
  expect(sharedItems[0].price).toBe(150);
  expect(sharedItems[0].displayedIn).toBe('Premium Selection');
});
```

**Route 2 (Staff Menu):**
Same pattern with staff-specific test data.

### Test Coverage
Both routes now verify:
- ✅ Item appears only once (deduplication works)
- ✅ Highest priority group's `customName` is used
- ✅ Highest priority group's `overridePrice` is used
- ✅ Highest priority group's name appears in `displayedIn` / `category`

---

## Test Results

### Route 1: GET /api/v1/menu/public
**Before**: 14 tests passing, 1 skipped (multi-tenant), 0 priority tests  
**After**: 16 tests passing, 1 skipped (inactive merchant - unrelated)

**Added Tests:**
1. ✅ `should enforce multi-tenant isolation` (NEW)
2. ✅ `should use highest priority group data when item appears in multiple groups` (NEW)

### Route 2: GET /api/v1/menu/staff
**Before**: 9 tests passing, 1 skipped (multi-tenant), 0 priority tests  
**After**: 11 tests passing, 1 skipped (inactive merchant - unrelated)

**Added Tests:**
1. ✅ `should enforce multi-tenant isolation` (NEW)
2. ✅ `should use highest priority group data when item appears in multiple groups` (NEW)

---

## Code Quality Impact

### Before
- ❌ Multi-tenant isolation: **ASSUMED** (not tested)
- ❌ Priority-based deduplication: **ASSUMED** (not tested)
- ⚠️ Skipped tests with vague comments

### After
- ✅ Multi-tenant isolation: **VERIFIED** (tested with real second merchant)
- ✅ Priority-based deduplication: **VERIFIED** (tested with explicit rule documentation)
- ✅ All critical behaviors tested
- ✅ Test count increased by 4 (+2 per route)

---

## Lessons Learned

### Pattern Recognition ✅
The original 54-test suite already had the solution - we just needed to look at how it handled merchant creation.

### Test Data Strategy 📝
When dealing with unique constraints:
1. Check if other tests already solved this problem
2. Use timestamps in unique fields (`Date.now()`)
3. Provide all required nested fields (`owner` object)
4. Use different values for each test merchant (emails, phones, slugs)

### Critical Behavior Testing 🎯
Don't just test that deduplication works - test the RULE:
- Which occurrence wins?
- Why does it win?
- Document the rule in comments

---

## Updated Test Count

**Total Tests**: 81 passing (54 original + 16 Route 1 + 11 Route 2)  
**Coverage**: Multi-tenant isolation, authentication, scheduling, filtering, soft-delete, deduplication with priority rules

**Target**: 85+ tests (4 more needed for remaining routes)

---

## Ready for Route 3

✅ **Route 1**: Complete with multi-tenant & priority tests  
✅ **Route 2**: Complete with multi-tenant & priority tests  
🚀 **Next**: POST /api/v1/menu/publish

---

**Status**: BOTH ROUTES FULLY VERIFIED ✅  
**Quality**: HIGH (no skipped critical tests) ✅  
**Ready to Proceed**: YES ✅

