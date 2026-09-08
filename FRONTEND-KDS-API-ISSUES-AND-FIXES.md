# Frontend KDS API Issues and Fixes

**Date:** August 17, 2026  
**Status:** 🔧 ISSUES IDENTIFIED - FIXES PROVIDED

---

## Critical Issues Found

### Issue 1: ❌ CRITICAL TYPO in Backend Route (Line 23)

**Location:** `src/modules/kitchen/kitchen.routes.js` line 23

**Current (WRONG):**
```javascript
router.get(
  '/clear/:stationId/tickets',  // ❌ TYPO: "clear" should be "stations"
  restrictTo('kitchen', 'admin', 'superAdmin'),
  kitchenController.getStationTickets
);
```

**Should Be:**
```javascript
router.get(
  '/stations/:stationId/tickets',  // ✅ CORRECT
  restrictTo('kitchen', 'admin', 'superAdmin'),
  kitchenController.getStationTickets
);
```

**Impact:**
- Frontend calls to `/v1/kitchen/stations/:stationId/tickets` will return **404 Not Found**
- KDS dashboard will fail to load station tickets

**Fix Required:** Backend route file needs correction

---

### Issue 2: ❌ Missing Endpoints (Frontend calls non-existent APIs)

Your frontend code calls these endpoints that **DO NOT EXIST** in the backend:

#### 2.1 Get All Stations
```typescript
// Frontend (WRONG):
await api.get('/v1/kitchen/stations', { params: { branchId } });
```

**Backend Status:** ❌ **NOT IMPLEMENTED**

**Impact:** `useKitchenStationsQuery` will always fail and fall back to mock data

---

#### 2.2 Get All Tickets (No Station Filter)
```typescript
// Frontend (WRONG):
await api.get('/v1/kitchen/tickets', { 
  params: { branchId, status } 
});
```

**Backend Status:** ❌ **NOT IMPLEMENTED**

**Impact:** Cannot query all tickets across all stations

---

#### 2.3 Get Kitchen Staff
```typescript
// Frontend (WRONG):
await api.get('/v1/kitchen/staff', { 
  params: { branchId } 
});
```

**Backend Status:** ❌ **NOT IMPLEMENTED**

**Impact:** Staff list will always use mock data

---

#### 2.4 Get Kitchen Inventory
```typescript
// Frontend (WRONG):
await api.get('/v1/kitchen/inventory', {
  params: { stationId }
});
```

**Backend Status:** ❌ **NOT IMPLEMENTED**

**Impact:** Inventory tracking will always use mock data

---

#### 2.5 Toggle Ticket Item
```typescript
// Frontend (WRONG):
await api.patch(
  `/v1/kitchen/tickets/${ticketId}/item/${itemId}`,
  { completed }
);
```

**Backend Status:** ❌ **NOT IMPLEMENTED**

**Impact:** Cannot mark individual items as completed

---

#### 2.6 Update Inventory Status
```typescript
// Frontend (WRONG):
await api.patch(
  `/v1/kitchen/inventory/${itemId}/status`,
  { status }
);
```

**Backend Status:** ❌ **NOT IMPLEMENTED**

**Impact:** Cannot mark items as 86'd or low stock

---

#### 2.7 Emergency Stop
```typescript
// Frontend (WRONG):
await api.post('/v1/kitchen/emergency-stop', {
  branchId,
  paused,
  reason
});
```

**Backend Status:** ❌ **NOT IMPLEMENTED**

**Impact:** Emergency stop feature won't work

---

### Issue 3: ✅ Correct Endpoints (These Work)

These frontend calls match the backend correctly:

✅ `GET /v1/kitchen/stations/:stationId/tickets` (after typo fix)  
✅ `GET /v1/kitchen/orders/:orderId/tickets`  
✅ `PATCH /v1/kitchen/tickets/:ticketId/accept`  
✅ `PATCH /v1/kitchen/tickets/:ticketId/start`  
✅ `PATCH /v1/kitchen/tickets/:ticketId/ready`  
✅ `PATCH /v1/kitchen/tickets/:ticketId/cancel`  
✅ `PATCH /v1/kitchen/tickets/:ticketId/status`  

---

## Response Format Issues

### Backend Response Structure

All backend endpoints return this format:

```javascript
{
  status: 'success',
  results: 2,           // For list endpoints
  data: {
    tickets: [...],     // For getStationTickets, getOrderTickets
    ticket: {...},      // For single ticket operations
    message: '...'      // For status transitions
  }
}
```

### Frontend Parsing

Your frontend helper functions handle this correctly:

```typescript
const getApiPayload = (data: any): any => {
  return data?.data ?? data;  // ✅ Correct
};

const getTicketsFromResponse = (data: any): any[] => {
  const payload = getApiPayload(data);
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.tickets)) return payload.tickets;  // ✅ Correct
  return [];
};

const getTicketFromResponse = (data: any): any | null => {
  const payload = getApiPayload(data);
  if (payload?.ticket) return payload.ticket;  // ✅ Correct
  if (payload && payload._id) return payload;
  return null;
};
```

**Status:** ✅ **CORRECT** - No changes needed

---

## Fixes Required

### Fix 1: Backend Route Typo (CRITICAL)

**File:** `src/modules/kitchen/kitchen.routes.js`

**Line 23** - Change from:
```javascript
'/clear/:stationId/tickets'
```

To:
```javascript
'/stations/:stationId/tickets'
```

---

### Fix 2: Frontend API Path Adjustments

Since the backend only implements Phase 1 (ticket operations), your frontend has two options:

#### Option A: Keep Mock Data Fallbacks (Recommended for Now)

Your code already handles this gracefully:

```typescript
// ✅ Already implemented correctly
export const fetchKitchenStations = async (branchId?: string) => {
  try {
    const { data } = await api.get('/v1/kitchen/stations', {...});
    // Try API first
  } catch (error) {
    console.warn('Kitchen stations API unavailable. Using local data.');
  }
  return DEFAULT_KDS_STATIONS;  // Fallback
};
```

**Action Required:** None - this is already correct

---

#### Option B: Disable Unimplemented Features

If you want to avoid confusion, you can disable these queries:

```typescript
// Disable stations query (use mock data only)
export const useKitchenStationsQuery = (branchId?: string) => {
  return useQuery<KdsStation[], AxiosError>({
    queryKey: kitchenKeys.stations(branchId),
    queryFn: () => Promise.resolve(DEFAULT_KDS_STATIONS),  // Skip API call
    staleTime: Infinity,  // Never refetch
  });
};

// Disable staff query
export const useKitchenStaffQuery = (branchId?: string) => {
  return useQuery<KdsStaffMember[], AxiosError>({
    queryKey: kitchenKeys.staff(branchId),
    queryFn: () => Promise.resolve(SEED_KDS_STAFF),
    staleTime: Infinity,
  });
};

// Disable inventory query
export const useKitchenInventoryQuery = (stationId?: string) => {
  return useQuery<KdsInventoryItem[], AxiosError>({
    queryKey: kitchenKeys.inventory(stationId),
    queryFn: () => {
      if (stationId && stationId !== 'all') {
        return Promise.resolve(
          localInventoryStore.filter(item =>
            item.stationId.toLowerCase() === stationId.toLowerCase()
          )
        );
      }
      return Promise.resolve([...localInventoryStore]);
    },
    staleTime: Infinity,
  });
};
```

---

### Fix 3: Normalize Ticket Data Correctly

Your `normalizeKitchenTicket` function needs minor adjustments to match backend response:

**Current Issue:**
```typescript
// Backend returns this structure:
{
  items: [{
    orderItemId: '65abc...',  // Backend field
    menuItem: '65xyz...',      // Backend field (populated object or ID)
    menuItemName: 'Burger',    // Backend field
    quantity: 2,
    notes: 'No onions',
    status: 'pending'
  }]
}

// Your normalization tries to handle both menuItem and itemId
```

**Recommended Fix:**

```typescript
const items = Array.isArray(raw.items)
  ? raw.items.map((item: any, index: number) => {
      const completed = 
        item.completed ?? 
        item.status === 'ready' || 
        item.status === 'completed';

      return {
        _id: item._id || item.orderItemId || `itm_${index}`,
        
        // Backend uses 'orderItemId' (reference to Order.items[i]._id)
        orderItemId: item.orderItemId || item._id,
        
        // Backend uses 'menuItem' (Menu document ID)
        itemId: item.menuItem?._id || item.menuItem || `menu_${index}`,
        menuItem: item.menuItem?._id || item.menuItem,
        
        // Backend uses 'menuItemName' (denormalized)
        name: item.menuItemName || item.name || 'Menu Item',
        menuItemName: item.menuItemName || item.name || 'Menu Item',
        
        quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        notes: item.notes,
        modifiers: item.modifiers || item.modifierNames,
        status: item.status || (completed ? 'ready' : 'pending'),
        completed,
      };
    })
  : [];
```

---

## Testing Checklist

### Backend Fix Verification

After fixing the typo in `kitchen.routes.js`:

```bash
# Test the corrected endpoint
curl -X GET http://localhost:3000/api/v1/kitchen/stations/grill/tickets \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Should return 200 OK (not 404)
```

---

### Frontend Integration Tests

Test these endpoints (they should work after backend typo fix):

```typescript
// ✅ Test station tickets
const tickets = await fetchKitchenTickets('branchId', 'grill');
console.log('Station tickets:', tickets.length);

// ✅ Test order tickets
const orderTickets = await fetchOrderTickets('orderId123');
console.log('Order tickets:', orderTickets.length);

// ✅ Test accept ticket
await useAcceptTicketMutation().mutateAsync('ticketId123');

// ✅ Test start ticket
await useStartTicketMutation().mutateAsync('ticketId123');

// ✅ Test ready ticket
await useReadyTicketMutation().mutateAsync('ticketId123');

// ✅ Test cancel ticket
await useCancelTicketMutation().mutateAsync({
  ticketId: 'ticketId123',
  reason: 'Customer changed order'
});
```

---

### Mock Data Fallback Tests

Test that these gracefully fall back to mock data:

```typescript
// Should return DEFAULT_KDS_STATIONS (5 stations)
const stations = await fetchKitchenStations();

// Should return SEED_KDS_STAFF (7 staff members)
const staff = await fetchKitchenStaff();

// Should return SEED_KDS_INVENTORY (6 items)
const inventory = await fetchKitchenInventory();
```

---

## Summary of Actions Required

### Backend Team (1 Fix)

1. ✅ **Fix typo in `src/modules/kitchen/kitchen.routes.js` line 23**
   - Change `/clear/:stationId/tickets` to `/stations/:stationId/tickets`

### Frontend Team (0 Required, 1 Optional)

1. ✅ **Required:** None - your code already handles missing endpoints gracefully
2. ⚠️ **Optional:** Consider disabling API calls for unimplemented features (stations, staff, inventory) to avoid console warnings

---

## Phase 2 Recommendations

If you need these missing endpoints, they should be added in a future phase:

### Recommended New Endpoints

```javascript
// Station Management
GET    /api/v1/kitchen/stations              // List all stations
POST   /api/v1/kitchen/stations              // Create station
PATCH  /api/v1/kitchen/stations/:id          // Update station
DELETE /api/v1/kitchen/stations/:id          // Delete station

// Ticket Queries
GET    /api/v1/kitchen/tickets               // List all tickets (with filters)

// Item Operations
PATCH  /api/v1/kitchen/tickets/:ticketId/items/:itemId  // Toggle item completion

// Staff Management
GET    /api/v1/kitchen/staff                 // List kitchen staff
POST   /api/v1/kitchen/staff/clock-in        // Clock in staff
POST   /api/v1/kitchen/staff/clock-out       // Clock out staff

// Inventory Management
GET    /api/v1/kitchen/inventory             // List inventory
PATCH  /api/v1/kitchen/inventory/:itemId     // Update inventory item

// Emergency Operations
POST   /api/v1/kitchen/emergency-stop        // Pause/resume kitchen
```

---

## Error Handling Improvements

Your current error handling is good, but consider adding these enhancements:

```typescript
export const fetchKitchenTickets = async (...) => {
  try {
    // API call
  } catch (error) {
    // Add more specific error logging
    if (error.response?.status === 404) {
      console.warn('Endpoint not found. Check backend routes.');
    } else if (error.response?.status === 401) {
      console.warn('Authentication required. Check JWT token.');
    } else if (error.response?.status === 403) {
      console.warn('Permission denied. Check user role.');
    } else {
      console.warn('Kitchen tickets API unavailable:', error.message);
    }
  }
  return localTicketsStore;  // Fallback
};
```

---

## Final Notes

### What Works Now (Phase 1)

✅ Ticket lifecycle operations (accept, start, ready, cancel)  
✅ Station-specific ticket queries  
✅ Order-specific ticket queries  
✅ Generic status updates  
✅ Graceful fallback to mock data  
✅ Real-time WebSocket updates (when backend emits events)  

### What Needs Backend Implementation (Future)

❌ Station CRUD operations  
❌ Staff management  
❌ Inventory tracking  
❌ Individual item completion toggle  
❌ Emergency stop  
❌ Global ticket queries (all stations)  

### Workaround for Now

Your mock data strategy is perfect for development and demo purposes. The fallback logic ensures the frontend never breaks, even if backend endpoints are missing.

---

**Status:** 🎯 **READY FOR FIX**

**Priority:**
1. **CRITICAL:** Fix backend route typo (Line 23) - 2 minutes
2. **OPTIONAL:** Frontend adjustments - Already handled gracefully

Once the typo is fixed, all core KDS ticket operations will work perfectly! 🚀
