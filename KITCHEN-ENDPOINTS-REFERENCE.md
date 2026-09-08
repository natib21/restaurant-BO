# Kitchen Display System (KDS) - API Endpoints Reference

**Base URL:** `/api/v1/kitchen`

All endpoints require authentication (`protect` middleware).

---

## 📋 ALL TICKETS (Cross-Station View)

### 1. Get All Tickets
```
GET /api/v1/kitchen/tickets
```
**Description:** Get all tickets with optional filters  
**Access:** kitchen, waiter, admin, superAdmin  
**Query Params:**
- `stationId` - Filter by station
- `status` - Filter by status (pending, accepted, in_progress, ready, completed, canceled)
- `branchId` - Filter by branch

**Response:**
```json
{
  "success": true,
  "data": {
    "tickets": [...]
  }
}
```

---

### 2. Get Ticket History
```
GET /api/v1/kitchen/tickets/history
```
**Description:** Get completed tickets (history view)  
**Access:** kitchen, waiter, admin, superAdmin  
**Query Params:**
- `branchId` - Filter by branch
- `stationId` - Filter by station
- `startDate` - Filter from date
- `endDate` - Filter to date
- `page` - Pagination page
- `limit` - Results per page

---

## 🏪 KITCHEN STATIONS MANAGEMENT (CRUD)

### 3. Get All Stations
```
GET /api/v1/kitchen/stations
```
**Description:** Get all kitchen stations for the branch  
**Access:** kitchen, waiter, admin, superAdmin

---

### 4. Create Station
```
POST /api/v1/kitchen/stations
```
**Description:** Create a new kitchen station  
**Access:** admin, superAdmin  
**Body:**
```json
{
  "name": "Grill Station",
  "code": "GRILL",
  "description": "Main grill and BBQ",
  "isActive": true
}
```

---

### 5. Get Station by ID
```
GET /api/v1/kitchen/stations/:id
```
**Description:** Get a single kitchen station (accepts ObjectId or code)  
**Access:** kitchen, waiter, admin, superAdmin  
**Params:**
- `:id` - Station ObjectId or code (e.g., "GRILL")

---

### 6. Update Station
```
PATCH /api/v1/kitchen/stations/:id
```
**Description:** Update a kitchen station  
**Access:** admin, superAdmin  
**Body:**
```json
{
  "name": "Updated Name",
  "description": "New description",
  "isActive": false
}
```

---

### 7. Delete Station
```
DELETE /api/v1/kitchen/stations/:id
```
**Description:** Delete (deactivate) a kitchen station  
**Access:** admin, superAdmin

---

## 🍽️ MENU ITEM → STATION ASSIGNMENT

### 8. Assign Station to Menu Item
```
PATCH /api/v1/kitchen/menu-items/:menuItemId/station
```
**Description:** Assign or remove kitchen station for a menu item  
**Access:** kitchen, admin, superAdmin  
**Body:**
```json
{
  "stationId": "65abc123..." // or null to remove
}
```

---

## 📊 STATION TICKETS (KDS Dashboard)

### 9. Get Station Tickets
```
GET /api/v1/kitchen/stations/:stationId/tickets
```
**Description:** Get active tickets for a station (KDS dashboard)  
**Access:** kitchen, admin, superAdmin  
**Params:**
- `:stationId` - Station ObjectId or code

**Query Params:**
- `status` - Filter by status

---

## 📦 ORDER TICKETS (Order Detail View)

### 10. Get Order Tickets
```
GET /api/v1/kitchen/orders/:orderId/tickets
```
**Description:** Get all tickets for an order  
**Access:** kitchen, waiter, admin, superAdmin  
**Params:**
- `:orderId` - Order ObjectId

---

## 🔄 TICKET STATUS TRANSITIONS

### 11. Update Ticket Status (Generic)
```
PATCH /api/v1/kitchen/tickets/:ticketId/status
```
**Description:** Generic status update  
**Access:** kitchen, admin, superAdmin  
**Body:**
```json
{
  "status": "pending" | "accepted" | "in_progress" | "ready" | "completed" | "canceled",
  "reason": "Optional reason for status change"
}
```

---

### 12. Accept Ticket
```
PATCH /api/v1/kitchen/tickets/:ticketId/accept
```
**Description:** Explicit accept button (not auto-start)  
**Access:** kitchen, admin, superAdmin  
**Transition:** `pending` → `accepted`

---

### 13. Start Ticket
```
PATCH /api/v1/kitchen/tickets/:ticketId/start
```
**Description:** Start working on ticket  
**Access:** kitchen, admin, superAdmin  
**Transition:** `accepted` → `in_progress`

---

### 14. Mark Ticket Ready
```
PATCH /api/v1/kitchen/tickets/:ticketId/ready
```
**Description:** Mark ticket as ready for pickup  
**Access:** kitchen, admin, superAdmin  
**Transition:** `in_progress` → `ready`

---

### 15. Cancel Ticket
```
PATCH /api/v1/kitchen/tickets/:ticketId/cancel
```
**Description:** Cancel ticket  
**Access:** kitchen, waiter, admin, superAdmin  
**Body:**
```json
{
  "reason": "Reason for cancellation"
}
```

---

## 🎯 TICKET ITEM STATUS (Individual Item Updates)

### 16. Update Ticket Item Status
```
PATCH /api/v1/kitchen/tickets/:ticketId/item/:itemId
```
**Description:** Update status of a specific item within a ticket  
**Access:** kitchen, admin, superAdmin  
**Params:**
- `:ticketId` - Ticket ObjectId
- `:itemId` - Item ObjectId (from ticket.items array)

**Body:**
```json
{
  "status": "pending" | "in_progress" | "ready"
}
```

**⚠️ IMPORTANT:** 
- Path is `/item/:itemId` (singular)
- NOT `/items/:itemId/status`

---

## 📝 Common Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    "ticket": {...},
    // or
    "tickets": [...],
    // or
    "station": {...}
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message",
  "errors": [...]
}
```

---

## 🔐 Access Control Summary

| Role | Permissions |
|------|-------------|
| **kitchen** | View tickets, update statuses, manage items |
| **waiter** | View tickets, cancel tickets, view history |
| **admin** | Full access to all operations |
| **superAdmin** | Full access to all operations |

---

## 🚀 Common Workflows

### Workflow 1: Kitchen Staff Processing Ticket
```bash
# 1. Get tickets for your station
GET /api/v1/kitchen/stations/GRILL/tickets

# 2. Accept ticket
PATCH /api/v1/kitchen/tickets/:ticketId/accept

# 3. Start working
PATCH /api/v1/kitchen/tickets/:ticketId/start

# 4. Update individual items as you cook
PATCH /api/v1/kitchen/tickets/:ticketId/item/:itemId
Body: { "status": "in_progress" }

PATCH /api/v1/kitchen/tickets/:ticketId/item/:itemId
Body: { "status": "ready" }

# 5. Mark entire ticket ready
PATCH /api/v1/kitchen/tickets/:ticketId/ready
```

### Workflow 2: Manager Viewing All Tickets
```bash
# Get all active tickets across stations
GET /api/v1/kitchen/tickets

# Filter by status
GET /api/v1/kitchen/tickets?status=in_progress

# View history
GET /api/v1/kitchen/tickets/history?startDate=2026-08-01&endDate=2026-08-22
```

### Workflow 3: Waiter Checking Order Tickets
```bash
# Get all tickets for a specific order
GET /api/v1/kitchen/orders/:orderId/tickets

# Check which items are ready
# (Response shows ticket.items with individual status)
```

---

## ⚠️ Common Errors

### 404 - Endpoint Not Found
**Your Error:**
```
Cannot find /api/v1/kitchen/tickets/6a9185a14ef43aaeddabf9b5/items/6a9185a14ef43aaeddabf9b7/status
```

**Problem:** Wrong path - used `items` (plural) and extra `/status`

**Solution:** Use correct path
```
PATCH /api/v1/kitchen/tickets/:ticketId/item/:itemId
```

### 403 - Forbidden
**Cause:** User doesn't have required role  
**Solution:** Check user has one of: kitchen, waiter, admin, superAdmin

### 404 - Ticket Not Found
**Cause:** Invalid ticketId or ticket belongs to different merchant  
**Solution:** Verify ticketId and ensure merchant isolation is working

---

## 📚 Related Documentation

- **Service:** `src/modules/kitchen/service/KitchenTicketService.js`
- **Controller:** `src/modules/kitchen/controllers/kitchen.controller.js`
- **Routes:** `src/modules/kitchen/kitchen.routes.js`
- **Model:** `models/KitchenTicket.js`
- **RBAC Tasks:** `scripts/seed-roles-and-tasks.js`

---

**Last Updated:** 2026-08-22  
**Total Endpoints:** 16  
**Base Path:** `/api/v1/kitchen`
