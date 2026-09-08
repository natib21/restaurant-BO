# Phase 1 KDS: Frontend API Error Fixes

## Date
2026-08-18

## Problem Summary

Frontend was experiencing 3 types of errors when calling KDS backend APIs:

### Error 1: Station ID Type Mismatch (CRITICAL - FIXED)
```
GET /api/v1/kitchen/stations/cat_01/tickets
→ CastError: Cast to ObjectId failed for value "cat_01"
```

**Root Cause:** Frontend sends station identifiers as **codes** (e.g., `cat_01`, `grill_station`), but backend expected MongoDB **ObjectIds**.

**Frontend Behavior:** Frontend has station codes like:
- `cat_01` (Category 1 station)
- `cat_02` (Category 2 station)
- `grill_station`, `salad_station`, etc.

### Error 2: Missing Stations List Endpoint (FIXED)
```
GET /api/v1/kitchen/stations
→ 404 Cannot find /api/v1/kitchen/stations on this server
```

**Root Cause:** Backend had no endpoint to list all kitchen stations for a branch.

### Error 3: Missing Item-Level Toggle (DEFERRED)
```
PATCH /api/v1/kitchen/tickets/tkt_02/item/itm_02_1
→ 404 Cannot find on this server
```

**Root Cause:** Backend has no item-level completion toggle. **Deferred to future phase** as it's not critical for Phase 1 (station-level workflow).

---

## Solutions Implemented

### Fix 1: Station Code/ID Resolution in `getActiveTickets()`

**File:** `src/modules/kitchen/service/KitchenTicketService.js`

**Changes:**
- Modified `getActiveTickets()` to accept **station code OR ObjectId**
- Added automatic resolution:
  1. If input is not valid ObjectId → treat as station code
  2. Query `KitchenStation` by `code` field (uppercase)
  3. If found, use resolved ObjectId
  4. If not found, throw 404 error

**Code:**
```javascript
static async getActiveTickets(stationIdOrCode, branchId, options = {}) {
  // Resolve station: Try to find by code first, then fall back to ObjectId
  let stationId = stationIdOrCode;

  if (!mongoose.Types.ObjectId.isValid(stationIdOrCode)) {
    const station = await KitchenStation.findOne({
      code: stationIdOrCode.toUpperCase(),
      branch: branchId,
    }).select('_id');

    if (!station) {
      throw new AppError(`Kitchen station not found with code: ${stationIdOrCode}`, 404);
    }

    stationId = station._id;
  } else {
    // Verify ObjectId station exists
    const station = await KitchenStation.findOne({
      _id: stationIdOrCode,
      branch: branchId,
    }).select('_id');

    if (!station) {
      throw new AppError(`Kitchen station not found with ID: ${stationIdOrCode}`, 404);
    }
  }

  const tickets = await KitchenTicket.find({
    station: stationId,
    branch: branchId,
    status: { $in: statuses },
  })
    .populate('station', 'name code color')
    .populate('order', 'orderNumber orderType tableNumber')
    .populate('assignedTo', 'name')
    .sort({ priority: -1, createdAt: 1 })
    .lean();

  return tickets;
}
```

**Benefit:** Frontend can now call:
- `/api/v1/kitchen/stations/cat_01/tickets` ✅
- `/api/v1/kitchen/stations/507f1f77bcf86cd799439011/tickets` ✅ (still works)

---

### Fix 2: Add Stations List Endpoint

**Files Modified:**
1. `src/modules/kitchen/service/KitchenTicketService.js` - Added `getAllStations()` method
2. `src/modules/kitchen/controllers/kitchen.controller.js` - Added `getAllStations` controller
3. `src/modules/kitchen/kitchen.routes.js` - Added `GET /stations` route
4. `scripts/seed-roles-and-tasks.js` - Added `kitchen.stations.list` task

**New Service Method:**
```javascript
static async getAllStations(branchId, options = {}) {
  const { includeInactive = false } = options;

  const query = { branch: branchId };

  if (!includeInactive) {
    query.isActive = true;
  }

  const stations = await KitchenStation.find(query)
    .sort({ displayOrder: 1, name: 1 })
    .lean();

  return stations;
}
```

**New Route:**
```javascript
/**
 * GET /api/v1/kitchen/stations
 * Get all kitchen stations for the branch
 * Access: kitchen, waiter, admin, superAdmin
 */
router.get(
  '/stations',
  restrictTo('kitchen', 'waiter', 'admin', 'superAdmin'),
  kitchenController.getAllStations
);
```

**Response Format:**
```json
{
  "status": "success",
  "results": 3,
  "data": {
    "stations": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "code": "GRILL",
        "name": "Grill Station",
        "description": "Hot food prep",
        "isActive": true,
        "displayOrder": 1,
        "createdAt": "2026-08-18T10:00:00.000Z",
        "updatedAt": "2026-08-18T10:00:00.000Z"
      },
      {
        "_id": "507f1f77bcf86cd799439012",
        "code": "SALAD",
        "name": "Salad Station",
        "description": "Cold food prep",
        "isActive": true,
        "displayOrder": 2,
        "createdAt": "2026-08-18T10:00:00.000Z",
        "updatedAt": "2026-08-18T10:00:00.000Z"
      }
    ]
  }
}
```

**Query Parameters:**
- `includeInactive=true` - Include inactive stations (default: false)

---

## RBAC Task Updates

**File:** `scripts/seed-roles-and-tasks.js`

**Updated Counts:**
- **Total tasks:** 189 → **190**
- **Merchant-scoped:** 164 → **165**
- **Phase 1 KDS tasks:** 8 → **9**

**New Task:**
```javascript
{
  name: 'kitchen.stations.list',
  endpoint: '/api/v1/kitchen/stations',
  method: 'GET',
  description: 'Get all kitchen stations for branch',
  isMerchant: true,
  hidden: false
}
```

**Action Required:**
```bash
node scripts/seed-roles-and-tasks.js
```

---

## Frontend Integration Updates

### Station Lookup Flow (Recommended)

**Step 1:** Frontend calls `GET /api/v1/kitchen/stations` on app load:
```javascript
const stations = await fetch('/api/v1/kitchen/stations', {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json());

// stations.data.stations = [{ _id, code, name, ... }, ...]
```

**Step 2:** Frontend can now use either:
- Station **code** (e.g., `cat_01`) - Human-readable
- Station **ObjectId** (e.g., `507f1f77bcf86cd799439011`) - Database ID

**Step 3:** Call ticket endpoint with either identifier:
```javascript
// Using code (NEW - works now!)
GET /api/v1/kitchen/stations/cat_01/tickets

// Using ObjectId (still works)
GET /api/v1/kitchen/stations/507f1f77bcf86cd799439011/tickets
```

---

## Testing

### Manual Test Cases

**Test 1: Get stations list**
```bash
curl -X GET http://localhost:8000/api/v1/kitchen/stations \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** 200 OK with stations array

**Test 2: Get tickets by station code**
```bash
curl -X GET http://localhost:8000/api/v1/kitchen/stations/GRILL/tickets \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** 200 OK with tickets (or empty array if no tickets)

**Test 3: Get tickets by station code (lowercase)**
```bash
curl -X GET http://localhost:8000/api/v1/kitchen/stations/grill/tickets \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** 200 OK (code converted to uppercase internally)

**Test 4: Invalid station code**
```bash
curl -X GET http://localhost:8000/api/v1/kitchen/stations/INVALID_CODE/tickets \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** 404 "Kitchen station not found with code: INVALID_CODE"

---

## Deferred Features (Future Phases)

### Item-Level Completion Toggle
**Endpoint:** `PATCH /api/v1/kitchen/tickets/:ticketId/items/:itemId`

**Reason for Deferral:** Phase 1 focuses on **station-level workflow**:
- Ticket statuses: pending → accepted → in_progress → ready
- Entire ticket transitions together

**Future Use Case:** Allow kitchen staff to mark individual items as done before the whole ticket is ready (e.g., burger done, but fries still cooking).

**Implementation Complexity:**
- Add `status` field to ticket items array
- Add item-level transition logic
- Update WebSocket events to emit item-level changes
- Add RBAC task

**Not critical for Phase 1 MVP.**

---

## Summary of Changes

| File | Change | Lines |
|------|--------|-------|
| `src/modules/kitchen/service/KitchenTicketService.js` | Modified `getActiveTickets()` to accept code/ID | ~40 |
| `src/modules/kitchen/service/KitchenTicketService.js` | Added `getAllStations()` method | ~18 |
| `src/modules/kitchen/controllers/kitchen.controller.js` | Added `getAllStations` controller | ~18 |
| `src/modules/kitchen/kitchen.routes.js` | Added `GET /stations` route | ~12 |
| `scripts/seed-roles-and-tasks.js` | Added `kitchen.stations.list` task, updated counts | ~3 |

**Total:** 5 files modified, ~91 lines changed

---

## Migration Notes

### Backward Compatibility
✅ **Fully backward compatible** - existing frontend code using ObjectIds still works.

### Database Changes
❌ **No schema changes required** - only service logic updated.

### Required Actions
1. ✅ Code changes deployed
2. ⚠️ **Run seeder:** `node scripts/seed-roles-and-tasks.js`
3. ⚠️ **Restart server** (if not auto-reloading)
4. ✅ Frontend can now use station codes

---

## Status

- ✅ **Error 1 (Station ID mismatch):** FIXED - Accepts code or ObjectId
- ✅ **Error 2 (Missing stations endpoint):** FIXED - Added GET /stations
- ⏸️ **Error 3 (Item-level toggle):** DEFERRED to future phase

**Phase 1 KDS API is now frontend-compatible.**
