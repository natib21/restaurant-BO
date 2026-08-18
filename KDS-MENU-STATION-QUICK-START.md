# KDS Menu-Station Integration - Quick Start Guide

## ✅ Implementation Complete

**What was implemented:**
Menu Item → Kitchen Station integration for automatic ticket creation

---

## 🚀 Quick Start (3 Steps)

### Step 1: Seed Kitchen Stations
```bash
node scripts/seed-kitchen-stations.js
```
Creates "MAIN" station for all your branches.

### Step 2: Update RBAC Tasks
```bash
node scripts/seed-roles-and-tasks.js
```
Adds the new `kitchen.menuItems.assignStation` task.

### Step 3: Assign Menu Items to Stations
```bash
# For kitchen-prepared items (burgers, fries, etc.):
PATCH /api/v1/kitchen/menu-items/MENU_ITEM_ID/station
{
  "stationId": "YOUR_MAIN_STATION_ID"
}

# For items without kitchen prep (bottled drinks):
PATCH /api/v1/kitchen/menu-items/MENU_ITEM_ID/station
{
  "stationId": null
}
```

---

## 📋 What Happens Now

### Before (No Integration)
```
Order → preparing
❌ No tickets created
```

### After (With Integration)
```
Customer orders:
- Burger (kitchenStation: MAIN)
- Fries (kitchenStation: MAIN)
- Coke (kitchenStation: null)

↓

Order status: pending → confirmed → preparing

↓

System automatically creates:
✅ 1 KitchenTicket for MAIN station
✅ Contains: Burger + Fries
✅ Excludes: Coke (no station)

↓

Kitchen staff sees ticket on MAIN display
```

---

## 🎯 How It Works

### 1. Menu Items Know Their Station
```javascript
// Burger
{
  name: "Cheeseburger",
  price: 10.99,
  kitchenStation: ObjectId("507f...") // ← MAIN station
}

// Coke
{
  name: "Coke",
  price: 2.99,
  kitchenStation: null // ← No station needed
}
```

### 2. Order Created
```javascript
{
  orderNumber: "ORD-1234",
  items: [
    { menuItem: "burger-id", quantity: 1 },
    { menuItem: "coke-id", quantity: 1 }
  ],
  status: "pending"
}
```

### 3. Order Transitions to "Preparing"
```
pending → confirmed → preparing
```

### 4. System Groups Items by Station
```
MAIN station: [Burger]
(no station): [Coke] ← excluded
```

### 5. Ticket Created
```javascript
{
  ticketNumber: "MAIN-42",
  station: "MAIN",
  items: [
    { menuItemName: "Cheeseburger", quantity: 1 }
  ],
  status: "pending"
}
```

---

## 🔧 API Endpoints

### Assign Station to Menu Item
```http
PATCH /api/v1/kitchen/menu-items/:menuItemId/station

Request:
{
  "stationId": "507f1f77bcf86cd799439011"
}

Response:
{
  "status": "success",
  "data": {
    "message": "Kitchen station assigned to menu item",
    "menuItem": {
      "_id": "...",
      "name": "Cheeseburger",
      "kitchenStation": {
        "_id": "507f...",
        "code": "MAIN",
        "name": "Main Kitchen"
      }
    }
  }
}
```

### Remove Station Assignment
```http
PATCH /api/v1/kitchen/menu-items/:menuItemId/station

Request:
{
  "stationId": null
}
```

---

## 📦 Files Changed

| File | Change |
|------|--------|
| `scripts/seed-kitchen-stations.js` | ✅ NEW - Seeder for MAIN station |
| `src/modules/kitchen/kitchen.routes.js` | ✅ Added station assignment route |
| `src/modules/kitchen/controllers/kitchen.controller.js` | ✅ Added `assignMenuItemStation` controller |
| `src/modules/kitchen/service/KitchenTicketService.js` | ✅ Added `assignMenuItemStation` method |
| `scripts/seed-roles-and-tasks.js` | ✅ Added 1 new task |
| `tests/kds-menu-station-integration.test.js` | ✅ NEW - Comprehensive tests |
| `models/menuModel.js` | ✅ No change (field already exists!) |
| `KitchenTicketService.createTicketsForOrder()` | ✅ No change (logic already correct!) |

---

## ✅ Validation Features

The system validates:
- ✅ Station exists
- ✅ Station belongs to same merchant
- ✅ Station belongs to same branch  
- ✅ Station is active
- ✅ User has permission

**Prevents:**
- ❌ Assigning station from another branch
- ❌ Assigning inactive stations
- ❌ Invalid station IDs

---

## 🧪 Test Coverage

Run tests:
```bash
npm test tests/kds-menu-station-integration.test.js
```

**Tests:**
1. ✅ Single station - kitchen items only
2. ✅ No kitchen items (all drinks)
3. ✅ Multiple stations
4. ✅ Invalid station assignment (different branch)
5. ✅ Inactive station assignment
6. ✅ Remove station assignment
7. ✅ Ticket number auto-increment

---

## 🎨 Frontend Integration

### 1. Load Stations
```javascript
const { data: { stations } } = await api.get('/api/v1/kitchen/stations');
```

### 2. Assign Station to Menu Item
```javascript
// In menu edit form
async function assignStation(menuItemId, stationId) {
  await api.patch(`/api/v1/kitchen/menu-items/${menuItemId}/station`, {
    stationId
  });
}
```

### 3. Display Station in Menu List
```javascript
<div className="menu-item">
  <h3>{menuItem.name}</h3>
  <span className="station">
    {menuItem.kitchenStation 
      ? `📍 ${menuItem.kitchenStation.name}`
      : '🚫 No kitchen prep'
    }
  </span>
</div>
```

---

## 🔮 Multiple Stations (Future)

**Current:** 1 station (MAIN)

**Future:** Multiple stations work automatically!

```javascript
// Just create more stations:
POST /api/v1/kitchen/stations
{
  "code": "GRILL",
  "name": "Grill Station"
}

POST /api/v1/kitchen/stations
{
  "code": "SALAD",
  "name": "Salad Station"
}

// Assign menu items:
Burger → GRILL
Salad → SALAD

// Order:
Burger + Salad

// Result: 2 tickets automatically!
GRILL-10: [Burger]
SALAD-5: [Salad]
```

**No code changes needed** - the system is already designed for multiple stations!

---

## 📊 Task Count

**Total Tasks:** 196  
**Merchant-scoped:** 171  
**Phase 1 KDS Tasks:** 15

**Breakdown:**
- 5 Station CRUD (create, read, update, delete, list)
- 1 Station Assignment (assign menu→station)
- 9 Ticket Operations (list, status updates, etc.)

---

## 🐛 Troubleshooting

### No Tickets Created
**Check:**
1. Menu items have `kitchenStation` assigned
2. Order status reached "preparing"
3. Outbox worker is running
4. Check logs for errors

### Wrong Station Assignment
**Fix:**
```bash
PATCH /api/v1/kitchen/menu-items/ITEM_ID/station
{
  "stationId": "CORRECT_STATION_ID"
}
```

### Validation Error
**Common causes:**
- Station belongs to different branch
- Station is inactive
- Invalid station ID

---

## 📚 Full Documentation

- **Quick Start:** This file
- **Complete Guide:** `KDS-COMPLETE-GUIDE.md`
- **Implementation Details:** `KDS-MENU-STATION-INTEGRATION-COMPLETE.md`
- **Station CRUD API:** `KDS-STATION-MANAGEMENT-API.md`

---

## ✅ Summary

**Status:** Ready to use!

**What you get:**
- Automatic ticket creation based on menu stations
- Proper grouping (one ticket per station)
- Items without stations are excluded
- Full validation
- Multiple station support (ready for future)

**Next steps:**
1. Run seeders
2. Assign stations to menu items
3. Create test order
4. Watch tickets appear automatically! 🎉
