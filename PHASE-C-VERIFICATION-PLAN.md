# Phase C — Verification & Testing Plan

**Date:** 2026-08-19  
**Status:** Ready for Testing  
**Phase:** C.3 - Verification

---

## ✅ IMPLEMENTATION SUMMARY

Phase C has been **COMPLETED**:

- ✅ **Phase C.1** - Investigation complete (found ApiFeatures utility with bugs)
- ✅ **Phase C.2** - Implementation complete:
  - Fixed ApiFeatures utility (3 bugs)
  - Created sendResponse helper
  - Applied ApiFeatures to 6 service methods
  - Standardized 39 endpoints across 4 controllers
- ⏳ **Phase C.3** - Verification (THIS DOCUMENT)

---

## FILES CHANGED

### Utilities (2 files)
1. ✅ `utils/apiFeatures.js` — Fixed 3 bugs, added `search()` method
2. ✅ `utils/sendResponse.js` — **NEW** standardized response helper

### Service Layer (1 file)
3. ✅ `src/modules/menu/service/MenuService.js` — 6 methods updated with ApiFeatures

### Controllers (4 files)
4. ✅ `src/modules/menu/controller/menu.controller.js` — 9/12 endpoints (3 custom excluded)
5. ✅ `src/modules/menu/controller/menu-group.controller.js` — 9/9 endpoints
6. ✅ `src/modules/menu/controller/combo.controller.js` — 10/10 endpoints
7. ✅ `src/modules/menu/controller/branch-menu-group.controller.js` — 8/8 endpoints

**Total:** 39 endpoints standardized

---

## VERIFICATION REQUIREMENTS

### 1️⃣ MERCHANT ISOLATION ⚠️ CRITICAL SECURITY TEST

**Requirement:** Items from Merchant A must NEVER be visible to Merchant B

**Test Cases:**

```bash
# Setup: Create test data for 2 merchants
# - Merchant A: 5 menu items
# - Merchant B: 3 menu items

# Test 1: Merchant A user sees only Merchant A items
curl -H "Authorization: Bearer $MERCHANT_A_JWT" \
  "http://localhost:3000/api/v1/menus"
# Expected: 5 items, all with merchant: MERCHANT_A_ID

# Test 2: Merchant B user sees only Merchant B items
curl -H "Authorization: Bearer $MERCHANT_B_JWT" \
  "http://localhost:3000/api/v1/menus"
# Expected: 3 items, all with merchant: MERCHANT_B_ID

# Test 3: Attempt to access Merchant A item with Merchant B JWT
curl -H "Authorization: Bearer $MERCHANT_B_JWT" \
  "http://localhost:3000/api/v1/menus/MERCHANT_A_ITEM_ID"
# Expected: 404 Not Found

# Test 4: Verify base query scoping (check logs)
# - Start server with DEBUG logs enabled
# - Make request with ?merchant=OTHER_MERCHANT_ID
# - Verify query uses req.user.merchant, NOT req.query.merchant
```

**Critical Validation:**
- Base query in service layer: `{ merchant: merchantId }` from `req.user.merchant`
- NEVER from `req.query.merchant` (client-controlled)

---

### 2️⃣ QUERY PARAMETERS — SEARCH

**Test Endpoints:**
- `GET /api/v1/menus?search=pizza`
- `GET /api/v1/menu-groups?search=breakfast`
- `GET /api/v1/combos?search=deal`

**Test Cases:**

```bash
# Test 1: Basic search (case-insensitive)
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?search=pizza"
# Expected: All items with "pizza" in name/description (case-insensitive)

# Test 2: Partial match
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?search=chee"
# Expected: Items with "cheese", "cheesy", "cheeseburger", etc.

# Test 3: Empty search
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?search="
# Expected: All items (no filter applied)

# Test 4: No matches
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?search=xyzabc123"
# Expected: Empty array, results: 0
```

**Expected Response:**
```json
{
  "status": "success",
  "results": 2,
  "data": {
    "menus": [
      { "name": "Margherita Pizza", ... },
      { "name": "Pepperoni Pizza", ... }
    ]
  }
}
```

---

### 3️⃣ QUERY PARAMETERS — SORT

**Test Cases:**

```bash
# Test 1: Sort ascending by name
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?sort=name"
# Expected: Items sorted A-Z

# Test 2: Sort descending by price
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?sort=-price"
# Expected: Items sorted highest to lowest price

# Test 3: Multi-field sort
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?sort=category,name"
# Expected: Items sorted by category, then name within each category

# Test 4: Default sort (no sort param)
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus"
# Expected: Items sorted by -createdAt (newest first)
```

---

### 4️⃣ QUERY PARAMETERS — FIELD SELECTION

**Test Cases:**

```bash
# Test 1: Select specific fields
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?fields=name,price,category"
# Expected: Only name, price, category in response (+ _id by default)

# Test 2: Multiple fields
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?fields=name,description"
# Expected: Only name, description, _id

# Test 3: No fields param
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus"
# Expected: All fields except __v
```

---

### 5️⃣ QUERY PARAMETERS — PAGINATION

**Test Cases:**

```bash
# Test 1: Page 1, limit 5
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?page=1&limit=5"
# Expected: First 5 items, results: 5

# Test 2: Page 2, limit 5
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?page=2&limit=5"
# Expected: Items 6-10, results: 5

# Test 3: Default pagination
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus"
# Expected: First 100 items (default limit)

# Test 4: Page beyond available data
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?page=999&limit=10"
# Expected: Empty array, results: 0
```

---

### 6️⃣ QUERY PARAMETERS — FILTER

**Test Cases:**

```bash
# Test 1: Simple filter
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?type=food"
# Expected: Only items with type: 'food'

# Test 2: Multiple filters
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?type=food&available=true"
# Expected: Only available food items

# Test 3: Range filter (gte, gt, lte, lt)
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?price[gte]=10&price[lte]=50"
# Expected: Items with price between 10 and 50

# Test 4: Combined filters + search
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus?type=food&search=burger&available=true"
# Expected: Available food items with "burger" in name/description
```

---

### 7️⃣ RESPONSE SHAPES — LIST ENDPOINTS

**Endpoints to Test:**
- `GET /api/v1/menus` → `menus`
- `GET /api/v1/menu-groups` → `menuGroups`
- `GET /api/v1/menu-groups/light` → `menuGroups`
- `GET /api/v1/branch-menu-groups` → `menuGroups`
- `GET /api/v1/combos` → `combos`
- `GET /api/v1/combos/active` → `combos`

**Expected Shape:**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "menus": [...]  // or menuGroups, combos
  }
}
```

**Validation Checklist:**
- [ ] `status` field present and equals "success"
- [ ] `results` field present and equals array length
- [ ] `data` object present
- [ ] Resource key matches endpoint (menus, menuGroups, combos)
- [ ] Resource value is an array

---

### 8️⃣ RESPONSE SHAPES — SINGLE RESOURCE

**Endpoints to Test:**
- `POST /api/v1/menus` → create
- `GET /api/v1/menus/:id` → get one
- `PATCH /api/v1/menus/:id` → update

**Expected Shape:**
```json
{
  "status": "success",
  "data": {
    "menu": { ... }
  }
}
```

**Validation Checklist:**
- [ ] `status` field equals "success"
- [ ] `data` object present
- [ ] Resource key matches (menu, menuGroup, combo)
- [ ] Resource value is an object (not array)
- [ ] No `results` field

---

### 9️⃣ RESPONSE SHAPES — DELETE ENDPOINTS

**Endpoints to Test:**
- `DELETE /api/v1/menus/:id`
- `DELETE /api/v1/menu-groups/:id`
- `DELETE /api/v1/combos/:id`

**Expected Response:**
- Status Code: `204 No Content`
- Body: `{ "status": "success", "data": null }`

**Validation Checklist:**
- [ ] Status code is 204
- [ ] Body contains success status
- [ ] Data field is null

---

### 🔟 RESPONSE SHAPES — ACTION ENDPOINTS

**Endpoints to Test:**
- `PATCH /api/v1/menus/:id/availability` → toggle availability
- `PATCH /api/v1/combos/:id/active` → toggle active status

**Expected Shape:**
```json
{
  "status": "success",
  "message": "Menu item is now available",
  "data": {
    "menu": {
      "id": "...",
      "available": true,
      ...
    }
  }
}
```

**Validation Checklist:**
- [ ] `status` field equals "success"
- [ ] `message` field present with descriptive text
- [ ] `data` object with resource key
- [ ] Updated resource object

---

### 1️⃣1️⃣ BREAKING CHANGE VERIFICATION

**⚠️ Critical: getAllMenu response key changed**

**Endpoint:** `GET /api/v1/menus`

**Before (Old):**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "menu": [...]  // ❌ Singular (OLD)
  }
}
```

**After (New):**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "menus": [...]  // ✅ Plural (NEW)
  }
}
```

**Action Required:**
- [ ] Update frontend code: `response.data.menu` → `response.data.menus`
- [ ] Document this breaking change for frontend team
- [ ] Consider adding API version if needed

---

### 1️⃣2️⃣ CUSTOM ENDPOINTS — NOT CHANGED

**These endpoints were intentionally NOT changed (per Master Plan):**

#### 1. `GET /api/v1/menus/public` (Public Menu)

**Expected Response:** Custom shape with restaurant metadata
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

**Test:**
```bash
curl "http://localhost:3000/api/v1/menus/public?branchId=123"
```

**Validation:**
- [ ] Response includes restaurant name
- [ ] Response includes generatedAt timestamp
- [ ] Response includes totalItems count
- [ ] Response NOT using sendResponse format

---

#### 2. `GET /api/v1/menus/staff` (Staff Menu)

**Expected Response:** Custom shape with role info
```json
{
  "status": "success",
  "role": { ... },
  "data": {
    "restaurant": "...",
    "totalItems": 42,
    "menu": [...]
  }
}
```

**Test:**
```bash
curl -H "Authorization: Bearer $STAFF_JWT" \
  "http://localhost:3000/api/v1/menus/staff"
```

**Validation:**
- [ ] Response includes role information
- [ ] Response includes restaurant name
- [ ] Response NOT using sendResponse format

---

#### 3. `GET /api/v1/menus/active` (Active Menu)

**Expected Response:** Custom shape combining menus + combos
```json
{
  "status": "success",
  "data": {
    "menu": [...],
    "combos": [...],
    "generatedAt": "2026-08-19T..."
  }
}
```

**Test:**
```bash
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus/active"
```

**Validation:**
- [ ] Response includes both menu and combos arrays
- [ ] Response includes generatedAt
- [ ] Response NOT using sendResponse format

---

### 1️⃣3️⃣ RBAC — ROLE-BASED ACCESS CONTROL

**Test:** SUPER_MERCHANT_ADMIN vs Branch User scoping

```bash
# Test 1: SUPER_MERCHANT_ADMIN can see all branches
curl -H "Authorization: Bearer $SUPER_ADMIN_JWT" \
  "http://localhost:3000/api/v1/menus"
# Expected: Items from ALL branches under their merchant

# Test 2: Branch user sees only their branch
curl -H "Authorization: Bearer $BRANCH_USER_JWT" \
  "http://localhost:3000/api/v1/menus"
# Expected: Items only from their assigned branch

# Test 3: SUPER_MERCHANT_ADMIN with explicit branch filter
curl -H "Authorization: Bearer $SUPER_ADMIN_JWT" \
  "http://localhost:3000/api/v1/menus?branchId=BRANCH_X"
# Expected: Items only from BRANCH_X
```

**Validation:**
- [ ] SUPER_MERCHANT_ADMIN can query across branches
- [ ] Branch-scoped users limited to their branch
- [ ] Explicit branchId filter works for SUPER_MERCHANT_ADMIN

---

### 1️⃣4️⃣ IMAGE HANDLING

**Test:** Verify image population still works

```bash
# Test with image population
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/menus/:id"
```

**Validation:**
- [ ] Single image field populated correctly
- [ ] Multiple images array populated correctly
- [ ] Deleted images excluded (isDeleted: false filter)
- [ ] Image URLs formatted correctly

---

## TEST EXECUTION PLAN

### Step 1: Setup Test Environment

```bash
# Start MongoDB
# Start server in development mode
npm run dev

# Create test merchants
node scripts/create-test-merchants.js

# Seed test data
node scripts/seed-menu-test-data.js
```

### Step 2: Generate Test JWTs

```bash
# Login as Merchant A SUPER_ADMIN
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@merchantA.com","password":"test123"}' \
  > merchant_a_jwt.txt

# Login as Merchant B SUPER_ADMIN
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@merchantB.com","password":"test123"}' \
  > merchant_b_jwt.txt

# Login as Branch User (Merchant A)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"branch@merchantA.com","password":"test123"}' \
  > branch_user_jwt.txt
```

### Step 3: Run Test Suite

```bash
# Manual API tests using curl (see test cases above)
# Or create automated test file:

# Run automated tests
npm test tests/menu-phase-c-verification.test.js
```

### Step 4: Verify Logs

```bash
# Check server logs for:
# - No errors during query execution
# - Correct Mongoose queries generated
# - Merchant scoping applied in base query
# - ApiFeatures methods called correctly
```

---

## SUCCESS CRITERIA

### ✅ All Tests Must Pass:

1. **Security:**
   - [ ] Merchant isolation 100% enforced
   - [ ] Base query uses req.user.merchant (NOT req.query)

2. **Query Features:**
   - [ ] Search returns correct results (case-insensitive regex)
   - [ ] Sort works (ascending, descending, multi-field)
   - [ ] Field selection returns only requested fields
   - [ ] Pagination returns correct page/limit
   - [ ] Filter handles range operators (gte, lte, etc.)

3. **Response Shapes:**
   - [ ] All list endpoints use standardized format
   - [ ] All single-resource endpoints use standardized format
   - [ ] All delete endpoints return 204 No Content
   - [ ] All action endpoints include message field

4. **Business Logic:**
   - [ ] RBAC still works (SUPER_MERCHANT_ADMIN vs branch users)
   - [ ] Image handling still works
   - [ ] Custom endpoints (public, staff, active) unchanged

5. **Breaking Changes:**
   - [ ] getAllMenu now returns `data.menus` (plural)
   - [ ] Frontend team notified
   - [ ] Migration guide provided

---

## RISK ASSESSMENT

### High Risk ⚠️
- **Merchant isolation:** Any failure = critical security breach
- **Breaking change:** Frontend must update `data.menu` → `data.menus`

### Medium Risk 🟡
- **RBAC logic:** Ensure branch scoping still works correctly
- **Custom endpoints:** Verify public/staff/active still function

### Low Risk 🟢
- **Query features:** Non-breaking additions, gracefully degrade if unused

---

## ROLLBACK PLAN

If critical issues found during testing:

1. **Revert commits:**
   ```bash
   git revert <commit-hash-of-phase-c>
   ```

2. **Restore old response format:**
   - Change `data.menus` back to `data.menu` in getAllMenu

3. **Remove ApiFeatures:**
   - Restore manual filter/sort/pagination logic

4. **Keep sendResponse:**
   - Can keep sendResponse helper (backward compatible)

---

## NEXT STEPS AFTER VERIFICATION

Once all tests pass:

1. ✅ Mark Phase C as **COMPLETE**
2. 📝 Create frontend migration guide for `data.menu` → `data.menus`
3. 🚀 Deploy to staging environment
4. 📊 Monitor API performance and error rates
5. 🎯 Consider applying same pattern to other modules (Order, Inventory, etc.)

---

## REFERENCES

- **Investigation Report:** `PHASE-C-INVESTIGATION-REPORT.md`
- **Implementation Complete:** `PHASE-C-COMPLETE-ALL-ENDPOINTS-STANDARDIZED.md`
- **Utilities:**
  - `utils/apiFeatures.js`
  - `utils/sendResponse.js`
- **Service:** `src/modules/menu/service/MenuService.js`
- **Controllers:**
  - `src/modules/menu/controller/menu.controller.js`
  - `src/modules/menu/controller/menu-group.controller.js`
  - `src/modules/menu/controller/combo.controller.js`
  - `src/modules/menu/controller/branch-menu-group.controller.js`

---

**Document End**
