# Ticket Item Status Update Endpoint - ADDED ✅

## Issue
Frontend was trying to call endpoint that didn't exist:
```
PATCH /api/v1/kitchen/tickets/:ticketId/item/:itemId
Status: 404 Not Found
```

## Solution Applied

### 1. Added Service Method ✅
**File:** `src/modules/kitchen/service/KitchenTicketService.js`

Added `updateTicketItemStatus()` method:
- Updates status of individual items within a ticket
- Valid statuses: `pending`, `in_progress`, `ready`
- Automatically updates ticket-level status based on all items
- Updates timestamps (`startedAt`, `completedAt`)
- Emits Socket.IO event for real-time KDS updates

**Logic:**
```javascript
// Item status update
item.status = newStatus;
if (newStatus === 'in_progress') item.startedAt = new Date();
if (newStatus === 'ready') item.completedAt = new Date();

// Auto-update ticket status
- All items ready → ticket status = 'ready'
- Any item in_progress → ticket status = 'in_progress'
- All items pending → ticket status = 'pending'
```

### 2. Added Controller Method ✅
**File:** `src/modules/kitchen/controllers/kitchen.controller.js`

Added `updateTicketItemStatus()` handler:
- Validates request body has `status`
- Extracts actor info from `req.user`
- Calls service method
- Returns updated ticket

### 3. Added Route ✅
**File:** `src/modules/kitchen/kitchen.routes.js`

```javascript
router.patch(
  '/tickets/:ticketId/item/:itemId',
  restrictTo('kitchen', 'admin', 'superAdmin'),
  kitchenController.updateTicketItemStatus
);
```

**Access Control:**
- `kitchen` role: ✅ (KDS staff)
- `admin` role: ✅
- `superAdmin` role: ✅
- Other roles: ❌

### 4. Added RBAC Task ✅
**File:** `scripts/seed-roles-and-tasks.js`

Added task:
```javascript
{
  name: 'kitchen.tickets.updateItemStatus',
  endpoint: '/api/v1/kitchen/tickets/:ticketId/item/:itemId',
  method: 'PATCH',
  description: 'Update status of specific item within ticket',
  isMerchant: true,
  hidden: false
}
```

**Updated totals:**
- Total tasks: 216 → **217**
- Merchant-scoped: 191 → **192**
- KDS tasks: 15 → **16**

## API Usage

### Request
```http
PATCH /api/v1/kitchen/tickets/6a8ff59bfe7a6f6fdf183737/item/6a8ff59bfe7a6f6fdf183738
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "in_progress"
}
```

### Response
```json
{
  "status": "success",
  "data": {
    "ticket": {
      "_id": "6a8ff59bfe7a6f6fdf183737",
      "ticketNumber": "MAINKITCHEN-10",
      "status": "in_progress",
      "items": [
        {
          "_id": "6a8ff59bfe7a6f6fdf183738",
          "menuItemName": "Grilled Chicken Breast",
          "quantity": 1,
          "status": "in_progress",
          "startedAt": "2026-08-27T11:30:00.000Z",
          "completedAt": null
        }
      ],
      "order": "6a8ff59bfe7a6f6fdf183730",
      "station": "6a8edcef63250432ef967b1b"
    }
  }
}
```

## Valid Status Transitions

### Item-Level Statuses
- `pending` → First status when ticket created
- `in_progress` → Kitchen staff started working on item
- `ready` → Item completed and ready to serve

### Ticket-Level Status (Auto-computed)
The ticket status is automatically updated based on ALL items:

| Item States | Ticket Status |
|-------------|---------------|
| All pending | `pending` |
| Any in_progress | `in_progress` |
| All ready | `ready` |

## Frontend Integration

### KDS Item Status Update
```typescript
async function updateTicketItemStatus(
  ticketId: string,
  itemId: string,
  status: 'pending' | 'in_progress' | 'ready'
) {
  const response = await fetch(
    `/api/v1/kitchen/tickets/${ticketId}/item/${itemId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to update item status: ${response.statusText}`);
  }

  return response.json();
}
```

### Real-time Updates (Socket.IO)
```typescript
// Listen for item status updates
socket.on('ticket:item-updated', (data) => {
  console.log('Item updated:', data);
  // data = {
  //   ticketId: "...",
  //   itemId: "...",
  //   status: "in_progress",
  //   ticketStatus: "in_progress"
  // }
  
  // Update UI to reflect new status
  updateTicketUI(data.ticketId, data.ticketStatus);
  updateItemUI(data.ticketId, data.itemId, data.status);
});
```

## Use Cases

### 1. Mark Item as Started
Kitchen staff clicks "Start" on an item:
```javascript
await updateTicketItemStatus(ticketId, itemId, 'in_progress');
```

### 2. Mark Item as Ready
Kitchen staff clicks "Done" on an item:
```javascript
await updateTicketItemStatus(ticketId, itemId, 'ready');
```

### 3. Revert Item to Pending
If mistake was made, revert to pending:
```javascript
await updateTicketItemStatus(ticketId, itemId, 'pending');
```

## Files Modified

1. **`src/modules/kitchen/service/KitchenTicketService.js`**
   - Added `updateTicketItemStatus()` method

2. **`src/modules/kitchen/controllers/kitchen.controller.js`**
   - Added `updateTicketItemStatus()` handler

3. **`src/modules/kitchen/kitchen.routes.js`**
   - Added route for ticket item status update

4. **`scripts/seed-roles-and-tasks.js`**
   - Added RBAC task `kitchen.tickets.updateItemStatus`
   - Updated total count: 216 → 217 tasks

## Testing

### Manual Test
1. Create an order → ticket created
2. Get ticket ID and item ID from KDS
3. Call the endpoint:
```bash
curl -X PATCH \
  http://localhost:8000/api/v1/kitchen/tickets/TICKET_ID/item/ITEM_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}'
```

### Expected Behavior
- ✅ Item status updated to `in_progress`
- ✅ Item `startedAt` timestamp set
- ✅ Ticket status changes to `in_progress`
- ✅ Socket.IO event `ticket:item-updated` emitted
- ✅ Audit log created

## Notes

⚠️ **Item vs Ticket Status**: 
- **Items** have their own status within a ticket
- **Ticket** status is automatically computed from all items
- Don't confuse ticket-level status with item-level status

⚠️ **Terminal States**:
- Once a ticket is `canceled` or `completed`, items cannot be updated
- Validate ticket status before allowing item updates

✅ **Real-time Updates**:
- All KDS displays listening to the station room will receive updates
- No need to poll - updates are pushed via WebSocket

## Related Endpoints

### Ticket-Level Operations
- `PATCH /api/v1/kitchen/tickets/:ticketId/status` - Update entire ticket
- `PATCH /api/v1/kitchen/tickets/:ticketId/start` - Start ticket
- `PATCH /api/v1/kitchen/tickets/:ticketId/ready` - Mark ticket ready
- `PATCH /api/v1/kitchen/tickets/:ticketId/accept` - Accept ticket

### Item-Level Operations (NEW)
- `PATCH /api/v1/kitchen/tickets/:ticketId/item/:itemId` - Update item status
