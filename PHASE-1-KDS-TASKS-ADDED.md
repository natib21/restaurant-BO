# Phase 1 KDS Tasks Added to Seed Script

**Date:** August 17, 2026  
**Status:** ✅ COMPLETE

---

## Summary

Added **7 Phase 1 KDS (Kitchen Display System) endpoints** to `scripts/seed-roles-and-tasks.js` for RBAC task seeding.

### New Task Count

**Before:** 181 tasks (156 merchant-scoped, 25 system-wide)  
**After:** 188 tasks (163 merchant-scoped, 25 system-wide)  
**Added:** 7 KDS tasks (all merchant-scoped)

---

## Tasks Added

All Phase 1 KDS endpoints have been added as merchant-scoped tasks (`isMerchant: true`):

### 1. Get Station Tickets (KDS Dashboard)
```javascript
{
  name: 'kitchen.stations.tickets',
  endpoint: '/api/v1/kitchen/stations/:stationId/tickets',
  method: 'GET',
  description: 'Get active tickets for a station (KDS dashboard)',
  isMerchant: true,
  hidden: false
}
```
**Purpose:** Load active tickets for a specific kitchen station dashboard

---

### 2. Get Order Tickets (Order Detail View)
```javascript
{
  name: 'kitchen.orders.tickets',
  endpoint: '/api/v1/kitchen/orders/:orderId/tickets',
  method: 'GET',
  description: 'Get all tickets for an order',
  isMerchant: true,
  hidden: false
}
```
**Purpose:** View all kitchen tickets associated with a specific order

---

### 3. Update Ticket Status (Generic)
```javascript
{
  name: 'kitchen.tickets.updateStatus',
  endpoint: '/api/v1/kitchen/tickets/:ticketId/status',
  method: 'PATCH',
  description: 'Update ticket status (generic)',
  isMerchant: true,
  hidden: false
}
```
**Purpose:** Generic status update endpoint with RBAC validation

---

### 4. Accept Ticket (Explicit Button - Option 1)
```javascript
{
  name: 'kitchen.tickets.accept',
  endpoint: '/api/v1/kitchen/tickets/:ticketId/accept',
  method: 'PATCH',
  description: 'Accept ticket (explicit button - Option 1)',
  isMerchant: true,
  hidden: false
}
```
**Purpose:** Explicitly accept a ticket (preserves actor attribution in audit logs)

---

### 5. Start Ticket
```javascript
{
  name: 'kitchen.tickets.start',
  endpoint: '/api/v1/kitchen/tickets/:ticketId/start',
  method: 'PATCH',
  description: 'Start working on ticket',
  isMerchant: true,
  hidden: false
}
```
**Purpose:** Begin preparation work on an accepted ticket

---

### 6. Mark Ticket Ready
```javascript
{
  name: 'kitchen.tickets.ready',
  endpoint: '/api/v1/kitchen/tickets/:ticketId/ready',
  method: 'PATCH',
  description: 'Mark ticket as ready',
  isMerchant: true,
  hidden: false
}
```
**Purpose:** Mark ticket as ready for pickup/serving (triggers order ready rollup)

---

### 7. Cancel Ticket
```javascript
{
  name: 'kitchen.tickets.cancel',
  endpoint: '/api/v1/kitchen/tickets/:ticketId/cancel',
  method: 'PATCH',
  description: 'Cancel ticket',
  isMerchant: true,
  hidden: false
}
```
**Purpose:** Cancel a ticket (waiter or kitchen can cancel)

---

## Task Naming Convention

All KDS tasks follow the naming pattern: `kitchen.<resource>.<action>`

**Examples:**
- `kitchen.stations.tickets` - Station resource
- `kitchen.orders.tickets` - Order resource
- `kitchen.tickets.accept` - Ticket resource with specific action

---

## Role Assignment

All 7 KDS tasks are **merchant-scoped** (`isMerchant: true`), which means:

✅ **Assigned to:** SUPER-MERCHANT-ADMIN role (automatically via seed script)  
✅ **Accessible by:** Any merchant-level admin role  
✅ **Tenant-isolated:** Enforced at branch level via `req.user.branch`  

❌ **NOT system-wide:** These are not accessible to SUPER-ADMIN by default (unless explicitly added to role or via bypass logic)

---

## RBAC Enforcement

### Route-Level Guards

From `src/modules/kitchen/kitchen.routes.js`:

```javascript
// All routes require authentication
router.use(protect);

// Station tickets - kitchen, admin, superAdmin
router.get('/stations/:stationId/tickets',
  restrictTo('kitchen', 'admin', 'superAdmin'),
  kitchenController.getStationTickets
);

// Order tickets - kitchen, waiter, admin, superAdmin
router.get('/orders/:orderId/tickets',
  restrictTo('kitchen', 'waiter', 'admin', 'superAdmin'),
  kitchenController.getOrderTickets
);

// Accept ticket - kitchen, admin, superAdmin
router.patch('/tickets/:ticketId/accept',
  restrictTo('kitchen', 'admin', 'superAdmin'),
  kitchenController.acceptTicket
);

// ... etc.
```

### Service-Level RBAC

From `src/modules/kitchen/service/KitchenTicketService.js`:

```javascript
// RBAC permission matrix
const TICKET_TRANSITION_PERMISSIONS = {
  'pending->accepted': ['kitchen', 'admin', 'superAdmin'],
  'accepted->in_progress': ['kitchen', 'admin', 'superAdmin'],
  'in_progress->ready': ['kitchen', 'admin', 'superAdmin'],
  'ready->canceled': ['kitchen', 'waiter', 'admin', 'superAdmin'],
  // ... etc.
};
```

**Dual-layer enforcement:**
1. **Route guard** (`restrictTo`) - Checks role name via substring matching
2. **Service guard** (`TICKET_TRANSITION_PERMISSIONS`) - Validates transition is allowed for role category

---

## Testing the Seeded Tasks

### 1. Run the Seed Script

```bash
node scripts/seed-roles-and-tasks.js
```

**Expected output:**
```
✅ Connected to database: MesobDb

=== STEP 1: Create All Tasks ===
Creating 188 tasks...
  ✓ kitchen.stations.tickets (GET /api/v1/kitchen/stations/:stationId/tickets) [isMerchant: true]
  ✓ kitchen.orders.tickets (GET /api/v1/kitchen/orders/:orderId/tickets) [isMerchant: true]
  ✓ kitchen.tickets.updateStatus (PATCH /api/v1/kitchen/tickets/:ticketId/status) [isMerchant: true]
  ✓ kitchen.tickets.accept (PATCH /api/v1/kitchen/tickets/:ticketId/accept) [isMerchant: true]
  ✓ kitchen.tickets.start (PATCH /api/v1/kitchen/tickets/:ticketId/start) [isMerchant: true]
  ✓ kitchen.tickets.ready (PATCH /api/v1/kitchen/tickets/:ticketId/ready) [isMerchant: true]
  ✓ kitchen.tickets.cancel (PATCH /api/v1/kitchen/tickets/:ticketId/cancel) [isMerchant: true]

✅ 188 tasks created/updated
   - Merchant-scoped (isMerchant: true): 163
   - System-wide (isMerchant: false): 25
```

### 2. Verify Tasks in Database

```bash
node scripts/list-all-roles.js
```

Or query directly:

```javascript
const Task = require('./models/taskModel');

// Find KDS tasks
const kdsTasks = await Task.find({ name: /^kitchen\./ }).lean();
console.log('KDS Tasks:', kdsTasks.length);  // Should be 7

// Verify merchant-scoped
kdsTasks.forEach(task => {
  console.log(`${task.name}: isMerchant=${task.isMerchant}`);  // All should be true
});
```

### 3. Verify SUPER-MERCHANT-ADMIN Has Tasks

```javascript
const Role = require('./models/roleModel');

const merchantAdmin = await Role.findOne({ name: 'MERCHANT-ADMIN' })
  .populate('tasks')
  .lean();

const kdsTaskCount = merchantAdmin.tasks.filter(t => 
  t.name.startsWith('kitchen.')
).length;

console.log(`MERCHANT-ADMIN has ${kdsTaskCount} KDS tasks`);  // Should be 7
```

### 4. Test API Access

```bash
# Get auth token for MERCHANT-ADMIN user
TOKEN=$(curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@merchant.com","password":"password"}' \
  | jq -r '.token')

# Test KDS endpoint
curl -X GET http://localhost:3000/api/v1/kitchen/stations/65abc123def456/tickets \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK with ticket list (or empty array)
```

---

## File Changes

### Modified Files

**`scripts/seed-roles-and-tasks.js`**

**Changes:**
1. Added 7 KDS tasks to `ALL_TASKS` array (at end, before closing bracket)
2. Updated header comment: 181 tasks → 188 tasks
3. Updated merchant-scoped count: 156 → 163
4. Added Phase 1 KDS note in header

**Lines Changed:**
- Header comment (lines 1-15): Updated counts
- Task array (lines ~250): Added 7 KDS tasks
- Total additions: ~15 lines

---

## Integration with Phase 1

### Phase 1 Implementation Files

**Routes:** `src/modules/kitchen/kitchen.routes.js`  
**Controllers:** `src/modules/kitchen/controllers/kitchen.controller.js`  
**Service:** `src/modules/kitchen/service/KitchenTicketService.js`  
**Models:** `models/KitchenStation.js`, `models/KitchenTicket.js`

### Route Mounting

From `src/routes/index.js`:

```javascript
// Line 48: Import
const kitchenRoutes = require('../modules/kitchen/kitchen.routes');

// Line 126: Mount
router.use('/api/v1/kitchen', kitchenRoutes);
```

### Task-Based Authorization

The seeded tasks enable **fine-grained RBAC** for custom merchant roles:

**Example:** Create a "Kitchen Manager" role with specific KDS permissions:

```javascript
const Role = require('./models/roleModel');
const Task = require('./models/taskModel');

// Get only the tasks we want
const allowedTaskNames = [
  'kitchen.stations.tickets',  // View dashboard
  'kitchen.tickets.accept',    // Accept tickets
  'kitchen.tickets.start',     // Start tickets
  'kitchen.tickets.ready',     // Mark ready
  // NOT: kitchen.tickets.cancel (no cancel permission)
];

const tasks = await Task.find({ 
  name: { $in: allowedTaskNames } 
});

// Create custom role
await Role.create({
  name: 'KITCHEN-MANAGER',
  description: 'Kitchen manager with limited KDS access',
  isSystemRole: false,
  tasks: tasks.map(t => t._id)
});
```

---

## Next Steps

### 1. Create Custom Roles (Optional)

If you need role-based KDS access control:

```javascript
// Example: Kitchen Staff role
const kitchenStaffTasks = await Task.find({
  name: {
    $in: [
      'kitchen.stations.tickets',
      'kitchen.tickets.accept',
      'kitchen.tickets.start',
      'kitchen.tickets.ready'
    ]
  }
});

await Role.create({
  name: 'KITCHEN-STAFF',
  description: 'Kitchen staff with KDS access',
  tasks: kitchenStaffTasks.map(t => t._id)
});
```

### 2. Assign KDS Roles to Users

```javascript
const User = require('./models/userModel');

// Give kitchen user the KITCHEN-STAFF role
const kitchenRole = await Role.findOne({ name: 'KITCHEN-STAFF' });

await User.updateOne(
  { email: 'kitchen@restaurant.com' },
  { $set: { role: kitchenRole._id } }
);
```

### 3. Test Frontend Integration

Use the tasks to display/hide UI elements based on user permissions:

```javascript
// Frontend: Check if user has permission
const userTasks = currentUser.role.tasks.map(t => t.name);

// Show "Accept Ticket" button only if user has permission
if (userTasks.includes('kitchen.tickets.accept')) {
  showAcceptButton();
}
```

---

## Troubleshooting

### Issue: Tasks not showing up

**Solution:** Re-run the seed script (it's idempotent):

```bash
node scripts/seed-roles-and-tasks.js
```

### Issue: Permission denied when testing endpoints

**Possible causes:**
1. User doesn't have MERCHANT-ADMIN or KITCHEN role
2. Role doesn't have the required tasks assigned
3. User's `role` field not populated

**Debug:**
```javascript
// Check user's role and tasks
const user = await User.findById(userId).populate({
  path: 'role',
  populate: { path: 'tasks' }
});

console.log('Role:', user.role.name);
console.log('Tasks:', user.role.tasks.map(t => t.name));
```

### Issue: "Cannot find module" error

**Solution:** Make sure you're running from the project root:

```bash
cd /path/to/restaurant-BO
node scripts/seed-roles-and-tasks.js
```

---

## Summary

✅ **7 KDS tasks added** to seed script  
✅ **All merchant-scoped** (isMerchant: true)  
✅ **Automatically assigned** to SUPER-MERCHANT-ADMIN  
✅ **RBAC-enforced** at route and service levels  
✅ **Idempotent** seed script (safe to re-run)  
✅ **Ready for production** deployment  

**Total Task Count:** 188 (163 merchant-scoped + 25 system-wide)

---

**Phase 1 KDS Task Seeding:** ✅ COMPLETE
