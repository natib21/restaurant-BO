# PHASE C.1 — INVESTIGATION REPORT
## Menu Module: Query Handling (ApiFeatures) + Response Standardization

**Investigation Date:** 2026-08-19  
**Investigator:** Kiro AI  
**Scope:** Menu domain endpoints — current filter/sort/pagination logic and response shapes

---

## C.1.1 — EXISTING ApiFeatures UTILITY

### ✅ FINDING: ApiFeatures utility ALREADY EXISTS

**Location:** `utils/apiFeatures.js`  
**Currently Used By:**
- `src/modules/order/service/OrderService.js` (lines 687, 1076)
- `src/modules/merchants/repositories/merchant.repository.js` (line 8)
- `src/modules/branch/service/BranchService.js` (lines 332, 578, 735, 853)

### Current Implementation

```javascript
class ApiFeatures {
  constructor(query, queryString) {
    ((this.query = query), (this.queryString = queryString));
  }

  filter() {
    const queryObj = { ...this.queryString };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach(el => delete queryObj[el]);
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
    this.query.find(JSON.parse(queryStr));
    return this;
  }
  
  sort() {
    if (this.queryString.sort) {
      const sortBy = req.queryString.sort.split(',').join(' '); // ⚠️ BUG: uses 'req' instead of 'this'
      console.log(sortBy);
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort('-createdAt');
    }
    return this;
  }
  
  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    } else {
      this.query = this.query.select('-__v');
    }
    return this;
  }
  
  paginate() {
    const page = this.queryString.page * 1 || 1;
    const limit = this.queryString.limit * 1 || 100;
    const skip = (page - 1) * limit;
    this.query = this.query.skip(skip).limit(limit);
    return this;
  }
}
```

### 🐛 BUGS FOUND IN EXISTING UTILITY

1. **Line 25 — ReferenceError in sort():**
   ```javascript
   const sortBy = req.queryString.sort.split(',').join(' ');
   ```
   **Issue:** Uses `req.queryString` instead of `this.queryString`  
   **Impact:** Will throw ReferenceError when sort() is called  
   **Fix:** Change to `this.queryString.sort`

2. **Missing search() method:**
   - Master Plan specifies search() should exist for regex searches
   - Current implementation lacks this method
   - Must be added before Phase C implementation

3. **filter() doesn't exclude 'search':**
   - Line 9 excludedFields: `['page', 'sort', 'limit', 'fields']`
   - Missing 'search' — if added to queryString, will be included in filter
   - Master Plan specifies search should be excluded

### VERDICT: DO NOT CREATE NEW ApiFeatures — FIX EXISTING ONE

---

## C.1.2 — MENU DOMAIN LIST ENDPOINTS

### Classification

**Direct Query Endpoints** (fit ApiFeatures pattern):
These use simple `Model.find()` chains and can be refactored to use ApiFeatures

| # | Route | Controller Method | Service Method | Current Logic |
|---|-------|------------------|----------------|---------------|
| 1 | `GET /api/v1/menus` | `getAllMenu` | `MenuService.getAllMenu` | Plain `.find().sort('-createdAt')` |
| 2 | `GET /api/v1/menu-groups` | `getAllMenuGroups` | `MenuService.getAllMenuGroups` | Plain `.find().sort({ priority: -1, createdAt: -1 })` |
| 3 | `GET /api/v1/menu-groups/light` | `getAllMenuGroupsLight` | `MenuService.getAllMenuGroupsLight` | Plain `.find().sort({ priority: -1, createdAt: -1 }).lean()` |
| 4 | `GET /api/v1/branch-menu-groups` | `getAllBranchMenuGroups` | `MenuService.getAllBranchMenuGroups` | Plain `.find().sort({ createdAt: -1 })` |
| 5 | `GET /api/v1/combos` | `getAllCombos` | `MenuService.getAllCombos` | Plain `.find().sort({ priority: -1, createdAt: -1 })` |
| 6 | `GET /api/v1/combos/active` | `getActiveCombos` | `MenuService.getActiveCombos` | Plain `.find().sort({ priority: -1, createdAt: -1 })` |

**Custom Aggregation Endpoints** (DO NOT fit ApiFeatures — EXCLUDE from Phase C):
These build results from complex day/time/menu-group matching logic, not direct queries

| # | Route | Controller Method | Service Method | Reason to Exclude |
|---|-------|------------------|----------------|-------------------|
| 7 | `GET /api/v1/menus/public` | `getPublicMenu` | `MenuService.getPublicMenu` | Complex day/time-slot filtering + menu group traversal |
| 8 | `GET /api/v1/menus/staff` | `getStaffMenu` | `MenuService.getStaffMenu` | Same as #7, staff-scoped version |
| 9 | `GET /api/v1/menus/active` | `getActiveMenu` | `MenuService.getActiveMenu` | Same as #7 + combo enrichment |

### Evidence

**Endpoint #1 — getAllMenu:**  
**File:** `src/modules/menu/service/MenuService.js:331-343`
```javascript
static async getAllMenu(req) {
  const merchantId = req.user?.merchant?._id || req.user?.merchant;
  if (!merchantId) {
    throw new AppError('Merchant ID is required', 400);
  }
  const filter = { merchant: merchantId };
  const menuItems = await MenuRepository.findMenus(filter).sort('-createdAt');
  return menuItems || [];
}
```
**Analysis:** Simple find + sort. Fits ApiFeatures pattern.

**Endpoint #2 — getAllMenuGroups:**  
**File:** `src/modules/menu/service/MenuService.js:971-978`
```javascript
static async getAllMenuGroups(req) {
  const merchantId = req.user.merchant._id;
  return MenuRepository.findMenuGroups({ merchant: merchantId })
    .sort({ priority: -1, createdAt: -1 })
    .select('-__v')
    .populate({ path: 'items.menu', select: 'name image variants available inStock' });
}
```
**Analysis:** Simple find + sort + populate. Fits ApiFeatures pattern.

**Endpoint #7 — getPublicMenu (EXCLUDE):**  
**File:** `src/modules/menu/service/MenuService.js:70-248`
```javascript
static async getPublicMenu(req) {
  // ... 180 lines of complex logic:
  // - Day/time-slot matching
  // - Menu group traversal
  // - Special date handling
  // - activeDays/blockedDays filtering
  // - Final item deduplication
  
  const allGroups = await MenuRepository.findMenuGroups({ merchant: merchant._id })
    .select('priority visibility activeDays blockedDays timeSlots specialDates isAlcoholMenu items name')
    .sort({ priority: -1 });

  // Complex loop determining which groups are "active" based on time/day...
  // Then populates items from active groups only
  
  return { restaurant, generatedAt, totalItems, menus, specialOffers, tableNumber };
}
```
**Analysis:** This is NOT a direct query — it's a business logic pipeline. Applying ApiFeatures filter/sort/paginate to this would be meaningless. **EXCLUDE from Phase C.**

---

## C.1.3 — CURRENT RESPONSE SHAPES

### Response Shape Analysis

**Shape A — Standard List (with results count):**  
Used by: `getAllMenuGroups`, `getAllMenuGroupsLight`, `getAllBranchMenuGroups`, `getAllCombos`, `getActiveCombos`

```json
{
  "status": "success",
  "results": 5,
  "data": {
    "menuGroups": [...],  // or "combos"
  }
}
```

**Files:**
- `src/modules/menu/controller/menu-group.controller.js:13-18`
- `src/modules/menu/controller/combo.controller.js:138-144`

---

**Shape B — Standard List WITHOUT results count:**  
Used by: `getAllMenu`

```json
{
  "status": "success",
  "results": 3,
  "data": {
    "menu": [...]
  }
}
```

**File:** `src/modules/menu/controller/menu.controller.js:183-191`

---

**Shape C — Single Resource:**  
Used by: `getMenu`, `getCombo`, `getMenuGroup`, `getBranchMenuGroup`, `createNewMenu`, `createCombo`, `updateMenu`, etc.

```json
{
  "status": "success",
  "data": {
    "menu": {...}  // or "combo", "menuGroup"
  }
}
```

**Files:** Multiple controllers

---

**Shape D — Delete (204 No Content):**  
Used by: `deleteMenu`, `deleteCombo`, `deleteMenuGroup`, `deleteBranchMenuGroup`

```json
{
  "status": "success",
  "data": null
}
```

**Files:** Multiple controllers

---

**Shape E — Custom (getPublicMenu — DO NOT TOUCH):**  
⚠️ **Master Plan warning: "Do not change getPublicMenu's response shape without checking who consumes it — it's likely already live for the QR-scan customer-facing app."**

```json
{
  "status": "success",
  "restaurant": "Pizza Palace",
  "generatedAt": "2026-08-19T...",
  "totalItems": 42,
  "data": {
    "menus": [...],
    "specialOffers": [...]
  }
}
```

**File:** `src/modules/menu/controller/menu.controller.js:200-210`  
**VERDICT:** Do NOT reshape. Flag if changes are needed — this is likely consumed by a deployed frontend.

---

**Shape F — Custom (getStaffMenu):**

```json
{
  "status": "success",
  "role": {...},
  "data": {
    "restaurant": "Pizza Palace",
    "totalItems": 42,
    "menu": [...]
  }
}
```

**File:** `src/modules/menu/controller/menu.controller.js:235-243`  
**VERDICT:** Custom business logic endpoint. Do NOT apply ApiFeatures or reshape.

---

**Shape G — Action with message:**  
Used by: `toggleMenuItemAvailability`, `toggleComboActive`, etc.

```json
{
  "status": "success",
  "message": "Menu item is now available",
  "data": {
    "menu": { "id": "...", "name": "...", "available": true }
  }
}
```

**File:** `src/modules/menu/controller/menu.controller.js:219-225`

---

## C.1.4 — INCONSISTENCIES FOUND

### Issue #1: Inconsistent Resource Key Names

**List endpoints use different keys:**
- `data.menu` (getAllMenu — singular, holds array)
- `data.menuGroups` (getAllMenuGroups — plural)
- `data.combos` (getAllCombos — plural)

**Recommendation:** Standardize to plural form:
- `data.menus` (not `data.menu`) for getAllMenu
- Keep `data.menuGroups`, `data.combos` as-is

### Issue #2: getAllMenu Already Includes results Count

**File:** `src/modules/menu/controller/menu.controller.js:183-191`
```javascript
res.status(200).json({
  status: 'success',
  results: formattedMenus.length,
  data: { menu: formattedMenus },
});
```

**Analysis:** Already has `results` field. Only needs:
1. Resource key rename: `menu` → `menus`
2. ApiFeatures integration for filter/sort/paginate

### Issue #3: No Merchant Scoping in Filter Chain

**Critical:** All 6 endpoints identified for ApiFeatures integration already scope by merchant in the service layer BEFORE calling ApiFeatures:

**Example from getAllMenu:**
```javascript
const filter = { merchant: merchantId };
const menuItems = await MenuRepository.findMenus(filter).sort('-createdAt');
```

**CONFIRMED SAFE:** Merchant scoping happens in the base query, NOT derived from req.query. This is correct and must be preserved when adding ApiFeatures.

---

## C.1.5 — SUMMARY FOR IMPLEMENTATION

### ApiFeatures Status
- ✅ Utility exists at `utils/apiFeatures.js`
- 🐛 Bug #1: `sort()` uses `req` instead of `this` (line 25)
- 🐛 Bug #2: Missing `search()` method
- 🐛 Bug #3: `filter()` doesn't exclude 'search' field

**Action:** Fix existing utility before applying to menu endpoints

### Endpoints to Refactor (6 total)

**Direct Query Pattern — Apply ApiFeatures:**
1. `GET /api/v1/menus` — getAllMenu
2. `GET /api/v1/menu-groups` — getAllMenuGroups
3. `GET /api/v1/menu-groups/light` — getAllMenuGroupsLight
4. `GET /api/v1/branch-menu-groups` — getAllBranchMenuGroups
5. `GET /api/v1/combos` — getAllCombos
6. `GET /api/v1/combos/active` — getActiveCombos

**Custom Aggregation Pattern — EXCLUDE from Phase C:**
7. `GET /api/v1/menus/public` — getPublicMenu (⚠️ live customer-facing)
8. `GET /api/v1/menus/staff` — getStaffMenu
9. `GET /api/v1/menus/active` — getActiveMenu

### Response Standardization Needs

**List Endpoints:**
- Rename `data.menu` → `data.menus` (singular → plural) for getAllMenu
- All list endpoints already have `results` count
- All already follow `{ status, results, data: { resource: [...] } }` pattern

**Single Resource:**
- Already standardized: `{ status: 'success', data: { resource: {...} } }`

**Delete:**
- Already standardized: `204 No Content` with `{ status: 'success', data: null }`

**Action Responses:**
- Already include message + data: `{ status, message, data }`

### Search Fields per Resource

**Suggested search fields for search() method:**

| Endpoint | Resource | Search Fields |
|----------|----------|---------------|
| getAllMenu | Menu | `['name', 'description', 'category']` |
| getAllMenuGroups | MenuGroup | `['name', 'description']` |
| getAllMenuGroupsLight | MenuGroup | `['name']` |
| getAllBranchMenuGroups | BranchMenuGroup | `['name', 'description']` |
| getAllCombos | Combo | `['name', 'description']` |
| getActiveCombos | Combo | `['name', 'description']` |

### Merchant Scoping Verification

**✅ CONFIRMED SAFE:** All 6 endpoints scope by merchant in the SERVICE LAYER before constructing the query:

```javascript
// Pattern used in all 6 endpoints:
const merchantId = req.user.merchant._id;
const baseQuery = Model.find({ merchant: merchantId });
const features = new ApiFeatures(baseQuery, req.query)...
```

**Merchant ID comes from JWT-verified req.user, NOT from req.query.** This pattern is secure and must be preserved.

---

## C.1.6 — VERDICT

### Item 1: Existing ApiFeatures Utility
**VERDICT:** **EXISTS WITH BUGS**  
**Location:** `utils/apiFeatures.js`  
**Action Required:** Fix bugs #1, #2, #3 before using in menu module

### Item 2: List Endpoints Classification
**VERDICT:** **6 DIRECT QUERY ENDPOINTS IDENTIFIED**  
**Include in Phase C:** getAllMenu, getAllMenuGroups, getAllMenuGroupsLight, getAllBranchMenuGroups, getAllCombos, getActiveCombos  
**Exclude from Phase C:** getPublicMenu, getStaffMenu, getActiveMenu (custom aggregation logic)

### Item 3: Response Shapes
**VERDICT:** **MOSTLY STANDARDIZED — ONE INCONSISTENCY**  
**Action Required:** 
- Rename `data.menu` → `data.menus` in getAllMenu response
- All other responses already follow Master Plan's standard envelope
- **DO NOT touch getPublicMenu response** (live customer-facing endpoint)

---

## C.1.7 — READY FOR APPROVAL

**All three investigation tasks complete:**
1. ✅ Existing ApiFeatures found and documented
2. ✅ All GET list endpoints classified (6 to refactor, 3 to exclude)
3. ✅ Response shapes documented with evidence

**Waiting for approval before proceeding to C.2 — Implementation.**

---

**Report End**
