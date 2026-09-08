# Stuck Table Safety Net

## Problem

The new post-transaction table-freeing pattern (calling `transitionTableStatus()` after payment transactions commit) can fail silently if:

1. **Network/Database failure** after transaction commits but before `transitionTableStatus()` completes
2. **Process crash** during `transitionTableStatus()` execution
3. **Permission/validation error** in `transitionTableStatus()` that doesn't get retried

Result: **Stuck tables** — table remains `status: 'occupied'` even though the order is `paymentStatus: 'paid'` and `status: 'completed'`. The customer has left, but the table is unusable.

## Solution: Three-Layer Safety Net

### Layer 1: Scheduled Auto-Detection & Retry (Automatic)

**Implementation:** `src/modules/branch/stuck-table.scheduler.js`

- **Runs every 5 minutes** (configurable via `STUCK_TABLE_CRON_INTERVAL_MS`)
- **Finds stuck tables:** occupied tables whose order is paid+completed
- **Auto-retries:** calls `transitionTableStatus()` for each stuck table
- **Logs everything:** success, failure, and diagnostic info

**Configuration:**
```bash
# Enable the scheduler (required)
STUCK_TABLE_CRON_ENABLED=true

# Interval in milliseconds (default: 5 * 60 * 1000 = 5 minutes)
STUCK_TABLE_CRON_INTERVAL_MS=300000
```

**Behavior:**
```
✓ Stuck table found → auto-retry transitionTableStatus()
✓ Retry succeeds → table freed, session closed, logged
✗ Retry fails → logged as warning, surfaces for manual investigation
```

### Layer 2: Staff Dashboard Visibility (Manual)

**Endpoint:** `GET /api/v1/branches/health/stuck-tables`

**Returns:**
```json
{
  "status": "success",
  "message": "⚠️ Found 2 stuck table(s) out of 8 occupied",
  "data": {
    "totalOccupied": 8,
    "stuckCount": 2,
    "stuckTables": [
      {
        "tableId": "65a1b2c3d4e5f6g7h8i9j0k1",
        "tableNumber": 5,
        "orderId": "65a1b2c3d4e5f6g7h8i9j0k2"
      },
      {
        "tableId": "65a1b2c3d4e5f6g7h8i9j0k3",
        "tableNumber": 12,
        "orderId": "65a1b2c3d4e5f6g7h8i9j0k4"
      }
    ]
  }
}
```

**Use case:** Staff dashboard can call this on page load or periodically to:
- Display warning banner: "⚠️ 2 tables are stuck — auto-recovery in progress"
- Show list of affected tables for manual intervention if needed

### Layer 3: Manual Recovery (Emergency)

**Staff endpoint:** `PATCH /api/v1/branches/:id/tables/:tableId/free` (already exists)

If both automatic layers fail:
1. Staff manually marks table as "available" via UI
2. Session closes automatically via `transitionTableStatus()`

---

## Architecture

### Database Query Pattern

```javascript
// Find occupied tables
Tables.find({ status: 'occupied', isActive: true })

// For each table, check if associated order is complete+paid
Orders.findOne({
  table: tableId,
  paymentStatus: 'paid',
  status: 'completed',
  isActive: false
})

// If found → stuck table detected
```

### Retry Logic

```javascript
// In stuck-table.scheduler.js
for (const stuckTable of stuckTables) {
  try {
    await BranchService.transitionTableStatus({
      tableId,
      merchantId,
      branchId,
      toStatus: 'available'  // Triggers session auto-close
    });
    // Success → table freed, session closed
  } catch (error) {
    // Failure → logged, will retry next cycle
  }
}
```

---

## Logging

All stuck table events are logged under `stuck-tables.*`:

```javascript
logger.debug('stuck-tables.check.completed', { found: 0 });
logger.warn('stuck-tables.detected', { tableId, tableNumber, orderId });
logger.info('stuck-tables.auto_fixed', { tableId, tableNumber, orderId });
logger.error('stuck-tables.auto_fix_failed', { tableId, error });
logger.error('stuck-tables.cron.failed', { error });
```

**Filter logs:** `grep "stuck-tables" logs.txt`

---

## Monitoring

### Health Check Endpoint

**For infrastructure monitoring:**

```bash
# Returns health status of all schedulers including stuck-table scheduler
GET /api/v1/health/ready

Response:
{
  "stuckTableScheduler": {
    "status": "running",
    "enabled": true,
    "intervalMs": 300000,
    "lastCheck": "2024-01-15T10:30:45Z"
  }
}
```

### Metrics to Track

1. **Detection Rate:** How many stuck tables per cycle?
2. **Auto-Fix Rate:** What % are auto-fixed vs require manual intervention?
3. **Failure Rate:** Are retries actually succeeding?

---

## Configuration Summary

| Variable | Default | Purpose |
|----------|---------|---------|
| `STUCK_TABLE_CRON_ENABLED` | (required) | Enable/disable scheduler |
| `STUCK_TABLE_CRON_INTERVAL_MS` | `300000` (5 min) | Check frequency |

**Example .env:**
```bash
STUCK_TABLE_CRON_ENABLED=true
STUCK_TABLE_CRON_INTERVAL_MS=300000
```

---

## Testing

### Simulate Stuck Table (Manual)

```javascript
// 1. Mark order as paid+completed
order.paymentStatus = 'paid';
order.status = 'completed';
order.isActive = false;
await order.save();

// 2. Leave table in occupied state
table.status = 'occupied';
await table.save();

// 3. Next scheduler run will detect and fix
// OR manually call:
await detectAndFixStuckTables();
```

### Expected Behavior

```
Before: Table 5 (occupied), Order #123 (paid, completed)
         ↓ [scheduler runs]
After:  Table 5 (available), Order #123 (paid, completed), Session closed
```

---

## Future Improvements

1. **Exponential backoff:** If a table stays stuck after N retries, escalate to staff
2. **Slack/Email alerts:** Notify ops team if stuck table count exceeds threshold
3. **Automatic compensation:** If stuck >1 hour, auto-mark table as 'needs-cleaning' to force staff attention
4. **Metrics dashboard:** Graph stuck-table detection/fix rates over time

---

## Related Code

- **Scheduler:** `src/modules/branch/stuck-table.scheduler.js`
- **Server startup:** `src/server.js` (starts/stops scheduler)
- **Controller:** `src/modules/branch/controller/branch.controller.js` (checkStuckTables endpoint)
- **Routes:** `src/modules/branch/branch.routes.js` (GET /health/stuck-tables)
- **Table freeing:** `src/modules/branch/service/BranchService.js` (transitionTableStatus)

---

## Key Guarantees

✅ **Automatic recovery:** Stuck tables are detected and fixed automatically every 5 minutes
✅ **Staff visibility:** Dashboard can show real-time stuck table count
✅ **Non-blocking:** Scheduler runs independently, doesn't impact request handling
✅ **Graceful shutdown:** Scheduler stops cleanly on process shutdown
✅ **Comprehensive logging:** Every attempt (success/failure) is logged for debugging

