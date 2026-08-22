# Route 3: POST /api/v1/menu/publish - Phase A Investigation Report

**Generated:** 2026-08-21
**Status:** Complete - Ready for Review

---

## Executive Summary

The publish endpoint exists and is fully implemented with the following characteristics:
- **Immediate publish only** (no scheduling mechanism)
- **Versioned snapshot model** (immutable MenuPublication records)
- **Recipe validation** enforced before publish
- **Branch-scoped publishing** (one MenuGroup can be published separately per branch)
- **No branch-groups dependency** (clean architecture, only uses `branches` array on MenuGroup)
- **One-way state transition** (draft → published; unpublish not implemented)
- **Audit logging incomplete** (MenuPublication model lacks audit plugin)

---

## 1. Current Publishing Logic Location

### Full Call Chain

```
POST /api/v1/menu/publish
  ↓
src/modules/menu/router/menus.routes.js
  ├─ Middleware: requireCapability(CAPABILITIES.MENU_MANAGE)
  ↓
src/modules/menu/controller/menu.controller.js::publishMenuGroup (Line 388)
  ↓
src/modules/menu/service/MenuService.js::publishMenuGroup (Line 56)
  ↓
src/modules/menu/menu-management.service.js::publishMenuGroup (Line 56)
  ├─ Validates recipes (Line 57)
  ├─ Creates versioned snapshot (Line 80)
  ├─ Updates MenuItem.publishStatus to 'published' (Line 78)
  └─ Creates MenuPublication record (Line 104)
```

### Files Involved

| Layer | File | Purpose |
|-------|------|---------|
| Route | `src/modules/menu/router/menus.routes.js` | Endpoint definition, RBAC guard |
| Controller | `src/modules/menu/controller/menu.controller.js` | Request handling, response formatting |
| Service (thin) | `src/modules/menu/service/MenuService.js` | Delegation layer |
| Service (core) | `src/modules/menu/menu-management.service.js` | Business logic, validation, transaction |
| Model | `models/MenuPublication.js` | Versioned snapshot storage |
| Model | `src/modules/menu/model/MenuItem.model.js` | Menu item state (`publishStatus` field) |
| Model | `src/modules/menu/model/MenuGroup.model.js` | Grouping logic, branch assignments |

---

## 2. State Transition Analysis

### Menu Item States

**Field:** `publishStatus` (MenuItem.model.js, Line 207)

**Possible Values:**
- `draft` (default)
- `published`
- `archived`

### State Transition Map

```
draft ──────publish()──────> published
                                  │
                                  │ archive()
                                  ↓
                              archived
```

**Key Findings:**
- ✅ **Draft → Published**: Implemented via `publishMenuGroup()`
- ✅ **Published → Archived**: Implemented via `archiveMenuItem()` (menu-management.service.js, Line 123)
- ❌ **Published → Draft (Unpublish)**: NOT IMPLEMENTED (despite `MENU_UNPUBLISH` audit action existing in auditLogModel.js)
- ❌ **Archived → Published**: NOT IMPLEMENTED (no re-publish logic)

### Pre-Publish Validations

**Recipe Validation** (menu-management.service.js::validateRecipesForGroup, Line 22):
1. Menu group must exist and belong to merchant
2. All non-hidden menu items in the group must have an active Recipe record
3. Fails with 400 error if any items lack recipes

**Branch Assignment Validation** (Line 71):
- Menu group's `branches` array must include the target `branchId`
- Fails with 400 error if branch not assigned

**No Other Validations:**
- ❌ No check if menu group is empty
- ❌ No check if menu items are available (though validation checks `available: true` in database query)
- ❌ No check for duplicate publications (versioning handles this automatically)

### Side Effects on Publish

1. **MenuItem.publishStatus Update** (Line 78):
   ```javascript
   await Menu.updateMany(
     { _id: { $in: menus.map(m => m._id) }, merchant: merchantId },
     { $set: { publishStatus: 'published' } }
   );
   ```
   - All menu items in the group transition from `draft` → `published`
   - **CRITICAL**: This is a bulk update with no transaction wrapper

2. **MenuPublication Record Created** (Line 104):
   - Immutable snapshot with version number
   - Includes MenuGroup metadata + all item references
   - Uses localized names (English only via `getMenuName(m, 'en')`)

3. **Logger Event** (Line 113):
   ```javascript
   logger.info('menu.published', { menuGroupId, branchId, version, merchantId });
   ```
   - Structured logging to application logger

4. **No Other Side Effects:**
   - ❌ No cache invalidation
   - ❌ No WebSocket notifications
   - ❌ No email/notification to staff
   - ❌ No outbox event for async processing

---

## 3. Scheduling Logic Review

### Finding: NO SCHEDULING IMPLEMENTED

**Evidence:**
- No `scheduledPublishDate` or `scheduledUnpublishDate` fields in any models
- No cron jobs or background workers found
- `grep -r "scheduledPublish\|cron.*publish\|schedule.*publish"` returned zero results

**MenuGroup Scheduling Fields:**
MenuGroup has visibility scheduling (Line 92-114 of MenuGroup.model.js):
- `visibility: 'always' | 'scheduled' | 'hidden'`
- `activeDays: ['sunday', 'monday', ...]`
- `blockedDays: [...]`
- `timeSlots: [{ start: "09:00", end: "23:00" }]`
- `specialDates: [{ date, recurringYearly }]`

**BUT**: These control *when a menu group is visible to customers*, NOT when it gets published. Publishing is always immediate.

**Conclusion:** Publishing is synchronous and immediate. There is no deferred/scheduled publishing mechanism.

---

## 4. Branch-Groups Interaction

### Finding: NO BRANCH-GROUPS DEPENDENCY ✅

**Evidence:**
- `grep -r "branch-group\|branchGroup\|BranchGroup"` returned zero results
- MenuGroup model uses a simple `branches: [ObjectId]` array (MenuGroup.model.js, Line 133)
- Publish logic only validates that `branchId` is in the MenuGroup's `branches` array (menu-management.service.js, Line 71)

**Architecture:**
```
MenuGroup
  ├─ branches: [Branch._id, Branch._id, ...]  // Simple array, no grouping
  └─ items: [{ menu: MenuItem._id, sortOrder, overridePrice, ... }]

MenuPublication
  ├─ menuGroup: MenuGroup._id
  ├─ branch: Branch._id                       // Single branch per publication
  └─ snapshot: { menuGroup, items, menus }   // Immutable versioned snapshot
```

**Publish Scoping:**
- Each publication is tied to **one** branch
- Same MenuGroup can be published separately to multiple branches (different versions allowed)
- No legacy "branch-groups" concept involved

**Conclusion:** Clean architecture, no branch-groups technical debt in publish flow.

---

## 5. Permission and RBAC

### Capability Required

**Guard:** `requireCapability(CAPABILITIES.MENU_MANAGE)` (menus.routes.js, Line 63)

**Definition:** `src/common/capabilities/capabilities.js`
```javascript
MENU_MANAGE: 'MENU_MANAGE',
```

### Access Control Logic

**Who Can Publish?**
- Any user with a role that has the `MENU_MANAGE` capability
- Typical roles: SUPER-ADMIN, SUPER-MERCHANT-ADMIN, MERCHANT-ADMIN, BRANCH-MANAGER (if granted)

**Merchant Scoping:**
- `merchantId` is extracted from request context via `getMerchantId(req)`
- All queries are scoped to `merchant: merchantId`
- Cross-merchant publishing is impossible (enforced at database query level)

**Branch Scoping:**
- Publish requires `branchId` in request body
- No explicit check if user has permission to publish to that specific branch
- **POTENTIAL GAP**: A user with `MENU_MANAGE` at merchant level can publish to ANY branch in that merchant, even if they're a branch-specific user

**Recommendation for Phase B:**
- Validate that `req.user` has access to the target `branchId` (if branch-scoped users exist)
- Or document as acceptable behavior (merchant-level permission applies to all branches)

---

## 6. Audit and Compliance

### Current Audit Status

**MenuPublication Model:**
- ❌ **NO audit plugin** applied
- The model does NOT use `auditPlugin` (models/MenuPublication.js has no plugin registration)
- Publish events are NOT captured in the audit log table

**MenuItem Model:**
- ✅ **HAS audit plugin** (MenuItem.model.js, Line 362)
- `publishStatus` IS an audited field (Line 363)
- State transitions (draft → published → archived) ARE captured

**Application Logger:**
- ✅ Structured log event: `logger.info('menu.published', { ... })` (menu-management.service.js, Line 113)
- Captures: `menuGroupId`, `branchId`, `version`, `merchantId`

### What Should Be Audited?

**Currently Missing:**
1. **Who** published (captured in MenuPublication.publishedBy, but not in audit log)
2. **When** it was published (captured in MenuPublication.publishedAt, but not in audit log)
3. **What changed** (version increments, but no diff of what items were added/removed)
4. **Context metadata** (user IP, session ID, request ID) - only available if audit log is used

**Audit Action Exists But Unused:**
- `auditLogModel.js` defines `MENU_PUBLISH` and `MENU_UNPUBLISH` actions (Line 83-84)
- These actions are NEVER referenced anywhere in the codebase
- They appear to be placeholders for future implementation

### Recommendation for Phase B

**Option A: Add Audit Plugin to MenuPublication Model**
```javascript
menuPublicationSchema.plugin(auditPlugin, {
  resource: 'MenuPublication',
  auditedFields: ['status', 'version', 'publishedBy'],
});
```

**Option B: Manual Audit Log Entry**
```javascript
await auditLogger.log({
  action: 'MENU_PUBLISH',
  resource: 'MenuPublication',
  resourceId: publication._id,
  merchantId,
  userId: publishedBy,
  metadata: { menuGroupId, branchId, version },
});
```

**Recommendation:** Option B is better for publish events (discrete action), Option A for ongoing changes (status transitions).

---

## 7. Versioning and Snapshot Logic

### How Versioning Works

**Version Calculation** (menu-management.service.js, Line 73):
```javascript
const last = await MenuPublication.findOne({
  merchant: merchantId,
  branch: branchId,
  menuGroup: menuGroupId,
})
  .sort('-version')
  .select('version')
  .lean();

const version = (last?.version || 0) + 1;
```

**Key Behaviors:**
- Versions are **per (merchant, branch, menuGroup) tuple**
- Each publication increments version by 1
- No gaps in version sequence (atomic increment)

**Snapshot Contents** (Line 80):
```javascript
const snapshot = {
  menuGroup: {
    _id: group._id,
    name: getMenuGroupName(group, 'en'),
    visibility: group.visibility,
    priority: group.priority,
  },
  items: group.items.map(item => ({
    menu: item.menu,
    sortOrder: item.sortOrder,
    overridePrice: item.overridePrice,
    isHidden: item.isHidden,
  })),
  menus: menus.map(m => ({
    _id: m._id,
    name: getMenuName(m, 'en'),
    publishStatus: 'published',
  })),
};
```

**What's Captured:**
- Menu group metadata (name, visibility, priority)
- Item list with overrides (sortOrder, overridePrice, isHidden)
- Menu item basic info (id, name, publishStatus)

**What's NOT Captured:**
- Full menu item details (price, description, images, ingredients, etc.)
- Category information
- Recipe details

**Why This Matters:**
- Snapshots are lightweight references, not full denormalized copies
- Active orders reference live MenuItem records, NOT snapshots
- Snapshots are for "public menu browsing" (QR code display), not order processing

---

## 8. Transaction Safety

### Current Implementation: NO EXPLICIT TRANSACTIONS ⚠️

**Critical Issue:**
The publish operation has 3 database writes with NO transaction wrapper:

1. **Update MenuItem.publishStatus** (Line 78)
   ```javascript
   await Menu.updateMany({ ... }, { $set: { publishStatus: 'published' } });
   ```

2. **Create MenuPublication** (Line 104)
   ```javascript
   const publication = await MenuPublication.create({ ... });
   ```

3. **Logger Write** (Line 113) - Non-transactional but acceptable

**Failure Scenarios:**

| Failure Point | Result | Impact |
|---------------|--------|--------|
| After Step 1, before Step 2 | Menu items marked published, but no MenuPublication record | ❌ Items appear published but no snapshot exists. Public menu may break. |
| Step 2 fails (e.g., unique constraint violation) | Partial state | ❌ Items are published, but snapshot creation failed. Inconsistent state. |

**Rollback Behavior:**
- ❌ No rollback implemented
- If MenuPublication creation fails, MenuItem.publishStatus remains 'published' (incorrect state)

### Recommendation for Phase B

**Wrap in MongoDB Session Transaction:**
```javascript
const session = await mongoose.startSession();
session.startTransaction();

try {
  await Menu.updateMany(
    { _id: { $in: menus.map(m => m._id) }, merchant: merchantId },
    { $set: { publishStatus: 'published' } },
    { session }
  );

  const publication = await MenuPublication.create([{
    merchant: merchantId,
    branch: branchId,
    menuGroup: menuGroupId,
    version,
    publishedBy,
    snapshot,
    recipeValidation: { passed: true, missingRecipes: [] },
  }], { session });

  await session.commitTransaction();
  return publication[0];
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

**Priority:** HIGH - Data consistency risk exists in current implementation.

---

## 9. Localization Handling

### Current Behavior

**Snapshot Uses English Only:**
```javascript
name: getMenuGroupName(group, 'en'),  // Line 83
name: getMenuName(m, 'en'),           // Line 95
```

**Why?**
- Snapshots are immutable versioned records
- Storing all languages would increase snapshot size
- Runtime localization likely happens when *reading* the snapshot for display

**Localized Name Helpers:**
- `utils/localization-helper.js` provides `getMenuGroupName(group, locale)` and `getMenuName(menu, locale)`
- Supports `en` and `am` (Amharic)

**Impact on Route 3 Migration:**
- MenuService layer should preserve this behavior (snapshot English, runtime localization)
- No need to change localization logic unless product requires snapshot multilingual support

---

## 10. Integration with Order System

### How Orders Reference Menus

**Finding:** Active orders reference **live MenuItem records**, NOT MenuPublication snapshots.

**Evidence:**
```javascript
// menu-management.service.js, Line 139
static buildOrderableMenuFilter(merchantId) {
  return {
    merchant: merchantId,
    available: true,
    $or: [
      { publishStatus: 'published' },
      { publishStatus: { $exists: false } }  // Legacy items without publishStatus
    ],
  };
}

// menu-management.service.js, Line 149
static assertMenuItemOrderable(menuItem) {
  if (!menuItem) throw new AppError('Menu item not found or unavailable', 400);
  if (!isOrderablePublishStatus(menuItem.publishStatus)) {
    throw new AppError('Menu item is not published for ordering', 400);
  }
}
```

**Behavior:**
- Orders check `MenuItem.publishStatus === 'published'`
- Orders do NOT care about MenuPublication snapshots
- Snapshots are for "public menu display" (QR browsing), not ordering

**Impact on Route 3 Migration:**
- Publish logic must correctly update `MenuItem.publishStatus`
- If MenuItem update fails, orders would still see old items (consistency risk)
- Transaction safety (Section 8) is critical for order integrity

---

## 11. Sort Order and Tie-Breaking

### MenuGroup Priority Field

**Field:** `priority: Number` (MenuGroup.model.js, Line 153)
- Default: 0
- Higher number = shown first
- Used for sorting menu groups in public/staff menu views

**Current Sorting in Routes 1 & 2:**
```javascript
// getPublicMenu and getStaffMenu (MenuGroup.service.js)
.sort({ priority: -1, _id: 1 })  // ✅ Tie-breaker applied
```

**Does Route 3 Sort MenuGroups?**
- ❌ NO - Route 3 publishes a single MenuGroup by ID
- Route 3 does NOT query multiple MenuGroups
- Therefore, the tie-breaking issue from Routes 1 & 2 does NOT apply to Route 3

**Does Route 3 Sort Menu Items?**
- Snapshot includes `sortOrder` field for items (Line 89):
  ```javascript
  items: group.items.map(item => ({
    sortOrder: item.sortOrder,
    ...
  }))
  ```
- But publish logic does NOT sort the items array
- Sorting happens when *reading* the snapshot (client-side or in Routes 1/2)

**Conclusion:** Route 3 does NOT need tie-breaking logic. It publishes data as-is; sorting happens downstream.

---

## 12. Error Handling and Edge Cases

### Identified Edge Cases

| Scenario | Current Behavior | Correct? |
|----------|------------------|----------|
| **MenuGroup has zero items** | Publishes empty snapshot | ⚠️ Should this be allowed? |
| **All items are `isHidden: true`** | Publishes with all items hidden | ⚠️ Effectively empty menu |
| **Branch has multiple published versions** | Creates new version, old versions remain | ✅ Correct (immutable history) |
| **Concurrent publish requests** | Race condition on version number | ❌ Unique index prevents duplicate, but error handling unclear |
| **MenuItem.publishStatus already 'published'** | Re-publishes (updates status again) | ✅ Idempotent, no issue |
| **MenuItem is `available: false`** | Validation query filters by `available: true`, so item excluded | ✅ Correct |
| **MenuItem is soft-deleted (`deletedAt` set)** | Not checked explicitly | ❌ Potential issue if deleted item is in group |
| **User lacks `MENU_MANAGE` capability** | 403 Forbidden (RBAC middleware) | ✅ Correct |
| **MenuGroup doesn't exist** | 404 error from validation | ✅ Correct |
| **MenuGroup belongs to different merchant** | Validation query scoped by merchant, returns 404 | ✅ Correct (secure) |
| **Branch not assigned to MenuGroup** | 400 error: "Menu group is not assigned to this branch" | ✅ Correct |
| **Recipe missing for an item** | 400 error: "Cannot publish: X item(s) missing active recipes" | ✅ Correct |

### Error Messages Review

**Current Messages:**
- "Menu group not found" (404) - Clear
- "Cannot publish: X item(s) missing active recipes" (400) - Good, includes count
- "Menu group is not assigned to this branch" (400) - Clear

**Missing Context:**
- Error messages don't include which specific menu items lack recipes (only count)
- Could improve UX by listing item names in error response

**Recommendation:** Enhancement, not blocker. Current errors are adequate.

---

## 13. Comparison with Routes 1 & 2

### Architectural Consistency

| Aspect | Routes 1 & 2 (GET) | Route 3 (POST) | Consistent? |
|--------|-------------------|----------------|-------------|
| **Service Layer** | MenuGroupService | MenuService → MenuManagementService | ❌ Different layers |
| **Controller** | menu.controller.js (getPublicMenu, getStaffMenu) | menu.controller.js (publishMenuGroup) | ✅ Same file |
| **Route File** | menus.routes.js | menus.routes.js | ✅ Same file |
| **RBAC** | Public: table session guard; Staff: JWT + capability | JWT + `MENU_MANAGE` capability | ⚠️ Tighter control (correct) |
| **Merchant Scoping** | `getMerchantId(req)` | `getMerchantId(req)` | ✅ Consistent |
| **Response Format** | `res.json({ status, data })` | `sendResponse(res, 201, 'publication', data)` | ⚠️ Different helpers |
| **Error Handling** | `catchAsync` wrapper | `catchAsync` wrapper | ✅ Consistent |

### Service Layer Discrepancy

**Routes 1 & 2:** Use `MenuGroupService` (new architecture)
**Route 3:** Uses `MenuService` (thin wrapper) → `MenuManagementService` (older service)

**Why This Matters:**
- Routes 1 & 2 were recently migrated to the new service layer
- Route 3 still uses the legacy `MenuManagementService`
- For consistency, Route 3 should be refactored to use MenuGroupService (or publish logic should move there)

**Recommendation for Phase B:**
- Move `publishMenuGroup` logic into `MenuGroupService`
- Keep `MenuManagementService` for backward compatibility (just delegate to MenuGroupService)
- Ensures all menu group operations go through the same service layer

---

## 14. Open Questions & Ambiguities

### 1. Should Empty Menu Groups Be Publishable?

**Current Behavior:** Yes (no validation prevents it)

**Scenario:** MenuGroup with `items: []` can be published

**Product Decision Needed?**
- If allowed: Document as intentional (e.g., "Coming Soon" menu category)
- If disallowed: Add validation: `if (group.items.length === 0) throw new AppError(...)`

**Recommendation:** Flag for product owner review (low priority)

---

### 2. What Happens to Active Orders If a Menu Is Unpublished?

**Current Behavior:** Unpublish is NOT IMPLEMENTED

**Scenario:** If implemented in future:
- Orders reference live MenuItem records
- If MenuItem.publishStatus changes to 'draft', orders could fail validation

**Options:**
1. **Disallow unpublish if active orders exist** (safest)
2. **Allow unpublish but preserve MenuItem.publishStatus for order history** (complex)
3. **Mark MenuPublication as archived instead of changing MenuItem state** (current archiveMenuItem approach)

**Recommendation:** Document that unpublish is out of scope for Route 3 migration. If product requests it, create separate decision document.

---

### 3. Should Publishing Trigger Notifications?

**Current Behavior:** No notifications, no WebSocket, no emails

**Use Cases:**
- Notify staff that new menu is live
- Notify customers (if subscribed) about menu updates

**Recommendation:** Out of scope for Route 3 migration (preserve existing behavior). If needed, add as post-publish hook in Phase C.

---

### 4. Should Publish Clear Existing Branch Caches?

**Current Behavior:** No cache invalidation logic detected

**Impact:** If frontend/CDN caches menu data, publish may not be reflected immediately

**Recommendation:**
- Check if caching layer exists (Redis, CDN)
- If yes, add cache invalidation in Phase C
- If no, not applicable

---

### 5. Branch-Scoped User Permission Gap

**Current Behavior:** Any user with `MENU_MANAGE` capability can publish to ANY branch in their merchant

**Scenario:**
- Branch Manager for Branch A has `MENU_MANAGE` capability
- They can publish to Branch B (unintended?)

**Options:**
1. **Accept current behavior** (merchant-level permission applies to all branches)
2. **Add branch-scoped permission check** (more granular RBAC)

**Recommendation:** Clarify with product owner. If branch-scoped users exist, add validation in Phase B.

---

### 6. Should Soft-Deleted Menu Items Be Blocked from Publish?

**Current Behavior:** No explicit check for `deletedAt != null` on menu items

**Risk:** If a MenuItem is soft-deleted but still in MenuGroup.items array, it could be included in snapshot

**Recommendation:** Add validation in Phase B:
```javascript
const menus = await Menu.find({
  _id: { $in: menuIds },
  merchant: merchantId,
  available: true,
  deletedAt: null,  // ✅ Explicitly exclude soft-deleted items
});
```

---

## 15. Dependencies and Blocking Issues

### No Blocking Issues Found ✅

**Dependencies:**
- ✅ MenuGroup model is stable
- ✅ MenuItem model is stable
- ✅ MenuPublication model is stable
- ✅ Recipe model exists and is used
- ✅ FileAsset model exists (for images)
- ✅ Audit plugin exists (just not applied to MenuPublication)
- ✅ RBAC system is functional

**No Breaking Changes Required:**
- Existing data structure is compatible with new service layer
- No schema migrations needed
- No API contract changes

---

## 16. Performance Considerations

### Bulk Updates

**Current Implementation:**
```javascript
await Menu.updateMany(
  { _id: { $in: menus.map(m => m._id) }, merchant: merchantId },
  { $set: { publishStatus: 'published' } }
);
```

**Performance Profile:**
- Single bulk update (good)
- Indexed query on `_id` and `merchant` (good)
- Audit plugin triggers for EACH updated document (could be slow if many items)

**Recommendation:** Monitor performance if MenuGroup has >100 items. Current implementation is acceptable for typical use cases.

### Snapshot Size

**Current Snapshot:**
- Lightweight (only metadata + item references)
- Does NOT denormalize full MenuItem documents

**Recommendation:** No changes needed. Snapshot design is efficient.

---

## 17. Testing Coverage Gaps

### Current Test Status (Assumed)

**No Route 3-specific tests found in codebase** (grep did not show menu-publish tests)

**Required Test Coverage:**
1. ✅ Happy path: Publish with valid data
2. ✅ Validation: Missing recipes
3. ✅ Validation: Invalid branch assignment
4. ✅ Validation: Menu group not found
5. ✅ Authorization: User lacks MENU_MANAGE capability
6. ✅ Authorization: Cross-merchant attempt
7. ✅ Versioning: Multiple publishes increment correctly
8. ✅ Concurrency: Duplicate version rejected (unique index)
9. ❌ Transaction rollback: MenuItem updated but MenuPublication fails
10. ❌ Soft-deleted items excluded from publish
11. ❌ Empty menu group handling
12. ❌ All-hidden items scenario
13. ❌ Audit log verification (if added in Phase B)

**Recommendation:** Write comprehensive test suite in Phase D covering all scenarios above.

---

## 18. Summary of Findings

### What Works Well ✅

1. **Clean architecture** - No branch-groups legacy debt
2. **Versioned snapshots** - Immutable, traceable publication history
3. **Recipe validation** - Prevents incomplete menus from going live
4. **RBAC enforcement** - Capability-based access control
5. **Merchant scoping** - Cross-tenant data leakage impossible
6. **Lightweight snapshots** - Efficient storage, fast queries

### Critical Issues ❌

1. **No transaction safety** - MenuItem and MenuPublication updates not atomic
2. **No audit logging** - Publish events not captured in audit log
3. **Unpublish not implemented** - Despite audit action existing
4. **Branch-scoped permissions unclear** - Merchant-level users can publish to any branch
5. **Soft-deleted items not explicitly excluded** - Potential edge case bug

### Enhancements for Phase B 🔧

1. **Wrap publish in transaction** - Ensure atomicity
2. **Add audit logging** - Manual audit entry or plugin
3. **Validate soft-deleted exclusion** - Add `deletedAt: null` check
4. **Move to MenuGroupService** - Consistency with Routes 1 & 2
5. **Clarify branch-scoped permissions** - Product decision needed
6. **Add cache invalidation hook** - If caching layer exists

### No Product Decisions Needed (Yet) ✅

- No tie-breaking issue (Route 3 doesn't sort)
- No scheduling ambiguity (immediate publish only)
- No order impact ambiguity (unpublish not implemented)

---

## 19. Recommendation for Phase B

### Proceed to Migration with Following Approach:

**Step 1: Refactor Service Layer**
- Move `publishMenuGroup` logic from `MenuManagementService` to `MenuGroupService`
- Preserve existing logic, just relocate for consistency

**Step 2: Add Transaction Safety**
- Wrap MenuItem update + MenuPublication create in MongoDB session transaction
- Add explicit rollback on failure

**Step 3: Add Audit Logging**
- Manual audit log entry after successful publish (use `MENU_PUBLISH` action)

**Step 4: Add Missing Validations**
- Exclude soft-deleted items (`deletedAt: null`)
- Optional: Validate non-empty menu group (product decision)

**Step 5: Write Comprehensive Tests**
- Cover all scenarios from Section 17

**Step 6: Update Documentation**
- Add Route 3 to FRONTEND-MENU-API-MIGRATION-GUIDE.md
- Document publish workflow in API reference

---

## 20. Migration Complexity Assessment

**Complexity:** MEDIUM

**Reasons:**
- ✅ No legacy branch-groups to untangle
- ✅ No scheduling mechanism to preserve
- ✅ No unpublish logic to migrate
- ❌ Transaction safety requires careful implementation
- ❌ Service layer refactor needed for consistency
- ❌ Audit logging addition requires testing

**Estimated Effort:**
- Phase B (Migration Plan): 1 hour
- Phase C (Implementation): 4-6 hours
- Phase D (Testing): 3-4 hours
- Phase E (Documentation): 1-2 hours
- **Total:** ~10-13 hours

---

## Appendices

### A. Request/Response Contract

**Request Body:**
```json
{
  "menuGroupId": "507f1f77bcf86cd799439011",
  "branchId": "507f191e810c19729de860ea"
}
```

**Response (201 Created):**
```json
{
  "status": "success",
  "data": {
    "publication": {
      "_id": "507f1f77bcf86cd799439012",
      "merchant": "507f1f77bcf86cd799439013",
      "branch": "507f191e810c19729de860ea",
      "menuGroup": "507f1f77bcf86cd799439011",
      "version": 3,
      "status": "published",
      "publishedBy": "507f1f77bcf86cd799439014",
      "publishedAt": "2026-08-21T10:30:00.000Z",
      "snapshot": {
        "menuGroup": { "_id": "...", "name": "Lunch Menu", "visibility": "always", "priority": 10 },
        "items": [ { "menu": "...", "sortOrder": 1, "overridePrice": null, "isHidden": false } ],
        "menus": [ { "_id": "...", "name": "Caesar Salad", "publishStatus": "published" } ]
      },
      "recipeValidation": {
        "passed": true,
        "missingRecipes": []
      }
    }
  }
}
```

**Error Responses:**
- `400`: Recipe validation failed, branch not assigned, etc.
- `403`: User lacks MENU_MANAGE capability
- `404`: Menu group not found

### B. Database Schema References

**MenuPublication:**
- Unique index: `(merchant, branch, menuGroup, version)`
- Lookup index: `(merchant, branch, status, version DESC)`

**MenuItem:**
- Index: `(merchant, publishStatus, available)`
- Index: `(merchant, available, deletedAt)`

**MenuGroup:**
- Index: `(branches, priority DESC)`
- Index: `(merchant, branches, deletedAt)`

---

**End of Phase A Investigation Report**

**Next Steps:**
1. Review this report with product owner (if any ambiguities need resolution)
2. Proceed to Phase B: Migration Plan
3. Do NOT begin implementation until migration plan is approved
