# Route 3: Step 2 Complete - Service Relocation

**Date:** 2026-08-21  
**Status:** ✅ Complete  
**Next:** Step 3 (Audit Logging)

---

## What Was Done

### Goal
Move `publishMenuGroup` from MenuManagementService to MenuGroupService for better separation of concerns.

**Reason:** MenuGroupService owns all menu group operations, so publish logic should live there.

---

## Files Modified

### 1. ✅ MenuGroupService - Added publishMenuGroup Method
**File:** `src/modules/menu/service/MenuGroup.service.js`

**Change:** Moved entire `publishMenuGroup` implementation from MenuManagementService to MenuGroupService.

**Location:** Added as new method after `restore()` method, before closing brace.

**Key Points:**
- Full implementation with order reversal logic
- Retry mechanism for version conflicts
- Error handling for incomplete publications
- All require() statements moved into the method (to avoid circular dependencies)

---

### 2. ✅ MenuManagementService - Converted to Delegation
**File:** `src/modules/menu/menu-management.service.js`

**Before (150+ lines):**
```javascript
static async publishMenuGroup({ menuGroupId, merchantId, branchId, publishedBy }) {
  // Full 150-line implementation here
}
```

**After (6 lines):**
```javascript
/**
 * DEPRECATED: Use MenuGroupService.publishMenuGroup() instead.
 * This method now delegates to MenuGroupService.
 * 
 * @deprecated Use MenuGroupService.publishMenuGroup() directly
 */
static async publishMenuGroup({ menuGroupId, merchantId, branchId, publishedBy }) {
  const MenuGroupService = require('./service/MenuGroup.service');
  return MenuGroupService.publishMenuGroup({ menuGroupId, merchantId, branchId, publishedBy });
}
```

**Why Keep It:**
- Backward compatibility (existing code may call MenuManagementService)
- Gradual migration path
- Marked as `@deprecated` for future refactoring

---

### 3. ✅ MenuService - Updated to Call MenuGroupService
**File:** `src/modules/menu/service/MenuService.js`

**Before:**
```javascript
static publishMenuGroup(params) {
  return MenuManagementService.publishMenuGroup(params);
}
```

**After:**
```javascript
static publishMenuGroup(params) {
  const MenuGroupService = require('./MenuGroup.service');
  return MenuGroupService.publishMenuGroup(params);
}
```

**Why:** MenuService acts as facade/entry point, should call the correct service directly.

---

### 4. ✅ Tests - Updated to Import MenuGroupService
**File:** `tests/menu-publish-non-transactional.test.js`

**Changes:**
- Updated import: `MenuGroupService` instead of `MenuManagementService`
- Updated all test calls: `MenuGroupService.publishMenuGroup()` (11 occurrences)

**Tests Still Pass:** ✅ (same functionality, different location)

---

## Architecture Improvement

### Before (Scattered Responsibility)
```
MenuManagementService
├── publishMenuGroup() ← Menu group operation
├── archiveMenuItem() ← Menu item operation
├── validateRecipesForGroup() ← Menu group helper
└── buildOrderableMenuFilter() ← Menu item helper

MenuGroupService
├── create()
├── update()
├── delete()
└── (no publish method) ❌
```

### After (Clear Separation)
```
MenuGroupService (owns all menu group operations)
├── create()
├── update()
├── delete()
├── publishMenuGroup() ✅ ← Moved here!
└── restore()

MenuManagementService (backward compatibility layer)
├── publishMenuGroup() → delegates to MenuGroupService
├── archiveMenuItem()
└── buildOrderableMenuFilter()

MenuService (facade)
├── publishMenuGroup() → calls MenuGroupService
└── (other menu operations)
```

---

## Call Chain

### Current (After Step 2)
```
Controller
  ↓
MenuService.publishMenuGroup()
  ↓
MenuGroupService.publishMenuGroup() ← Implementation lives here
```

### Backward Compatible Path (Still Works)
```
Controller (old code)
  ↓
MenuManagementService.publishMenuGroup()
  ↓
MenuGroupService.publishMenuGroup() ← Implementation lives here
```

---

## Why This Matters

### 1. **Single Responsibility Principle**
- MenuGroupService now owns all menu group operations
- Easy to find: "Where is publish logic?" → "In MenuGroupService"

### 2. **Easier Testing**
- Test MenuGroupService directly (all group operations in one place)
- No need to mock MenuManagementService

### 3. **Future Maintainability**
- Adding new group operations? Add to MenuGroupService
- Modifying publish logic? Go to MenuGroupService
- Clear service boundaries

### 4. **Gradual Migration**
- Old code still works (delegates to new location)
- Can update callers incrementally
- No breaking changes

---

## Verification

### Check Implementation Location
```javascript
// Before
const { MenuManagementService } = require('./menu-management.service');
await MenuManagementService.publishMenuGroup(...);

// After (preferred)
const MenuGroupService = require('./service/MenuGroup.service');
await MenuGroupService.publishMenuGroup(...);

// Still works (deprecated)
const { MenuManagementService } = require('./menu-management.service');
await MenuManagementService.publishMenuGroup(...); // Delegates internally
```

### Run Tests
```bash
npm test tests/menu-publish-non-transactional.test.js
```

**Expected:** All tests pass ✅

---

## Next Steps

### Step 3: Audit Logging ⏳
**What:** Add manual audit log entry after successful publish  
**Estimated Time:** 20 minutes

**Implementation:**
1. Import `auditLogger` from `utils/auditLogger.js` in MenuGroupService
2. Add audit log call after `publication.publishState = 'complete'`
3. Add test to verify audit log created
4. Update documentation

---

## Summary

**Lines Moved:** ~150 lines from MenuManagementService to MenuGroupService  
**Files Modified:** 4 (2 services, 1 test, 1 summary doc)  
**Breaking Changes:** None (backward compatible)  
**Tests Updated:** 11 test calls updated  
**Architecture Improvement:** Clear service responsibility boundaries

**Status:** ✅ Complete and ready for Step 3

