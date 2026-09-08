# Environment Configuration: Stuck Table Safety Net

## Required Configuration

Add these environment variables to your `.env` file to enable the stuck table detection and auto-recovery system:

```bash
# ═══════════════════════════════════════════════════════════════════════════
# Stuck Table Detection & Auto-Recovery Scheduler
# ═══════════════════════════════════════════════════════════════════════════

# Enable the scheduler (REQUIRED)
STUCK_TABLE_CRON_ENABLED=true

# How often to check for stuck tables (milliseconds)
# Default: 300000 (5 minutes)
# Examples:
#   60000     = every 1 minute (frequent, for testing)
#   300000    = every 5 minutes (recommended)
#   600000    = every 10 minutes
#   900000    = every 15 minutes
STUCK_TABLE_CRON_INTERVAL_MS=300000
```

## Recommended Settings by Environment

### Development
```bash
STUCK_TABLE_CRON_ENABLED=true
STUCK_TABLE_CRON_INTERVAL_MS=60000  # Check every 1 minute for faster testing
```

### Staging
```bash
STUCK_TABLE_CRON_ENABLED=true
STUCK_TABLE_CRON_INTERVAL_MS=300000  # Check every 5 minutes
```

### Production
```bash
STUCK_TABLE_CRON_ENABLED=true
STUCK_TABLE_CRON_INTERVAL_MS=300000  # Check every 5 minutes (or 600000 for lower DB load)
```

## How to Apply

### Option 1: Add to `.env` file directly

```bash
# Edit your .env file
nano .env

# Add these lines:
STUCK_TABLE_CRON_ENABLED=true
STUCK_TABLE_CRON_INTERVAL_MS=300000

# Save and restart the server
npm run dev
```

### Option 2: Export as environment variables (before starting server)

```bash
export STUCK_TABLE_CRON_ENABLED=true
export STUCK_TABLE_CRON_INTERVAL_MS=300000
npm run dev
```

### Option 3: Docker/systemd (Recommended for Production)

**docker-compose.yml:**
```yaml
environment:
  STUCK_TABLE_CRON_ENABLED: 'true'
  STUCK_TABLE_CRON_INTERVAL_MS: '300000'
```

**systemd service file:**
```ini
[Service]
Environment="STUCK_TABLE_CRON_ENABLED=true"
Environment="STUCK_TABLE_CRON_INTERVAL_MS=300000"
```

## Verification

### Check if scheduler is running

**Method 1: Check logs at startup**
```bash
# Should see:
# [INFO] stuck-tables.scheduler.started { intervalMs: 300000 }
npm run dev 2>&1 | grep "stuck-tables.scheduler"
```

**Method 2: Call health endpoint**
```bash
# Check if scheduler is in globalHealth
curl http://localhost:3000/api/v1/health/ready | jq '.data.stuckTableScheduler'
```

**Expected response:**
```json
{
  "status": "running",
  "enabled": true,
  "intervalMs": 300000
}
```

**Method 3: Manually trigger detection**

```javascript
// In Node REPL or test file:
const { detectAndFixStuckTables } = require('./src/modules/branch/stuck-table.scheduler');
const result = await detectAndFixStuckTables();
console.log(result);
// Expected: { checked: X, fixed: Y, failed: Z }
```

## Testing the Scheduler

### Create a Stuck Table (Test Scenario)

```javascript
// 1. Create a test order
const order = await Order.create({
  merchant: merchantId,
  table: tableId,
  paymentStatus: 'paid',
  status: 'completed',
  isActive: false
});

// 2. Leave table in occupied state
const table = await Table.findById(tableId);
table.status = 'occupied';  // Stuck!
await table.save();

// 3. Run scheduler manually
const { detectAndFixStuckTables } = require('./src/modules/branch/stuck-table.scheduler');
const result = await detectAndFixStuckTables();

console.log(result);
// Expected:
// { checked: 1, fixed: 1, failed: 0 }

// 4. Verify table is now available
const updatedTable = await Table.findById(tableId);
console.log(updatedTable.status);  // Should be 'available'
```

## Monitoring

### Check Stuck Tables via API

```bash
# Get current stuck table status
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v1/branches/health/stuck-tables
```

**Response (no stuck tables):**
```json
{
  "status": "success",
  "message": "✓ All 8 occupied tables are properly tracked",
  "data": {
    "totalOccupied": 8,
    "stuckCount": 0,
    "stuckTables": []
  }
}
```

**Response (with stuck tables):**
```json
{
  "status": "success",
  "message": "⚠️ Found 2 stuck table(s) out of 8 occupied",
  "data": {
    "totalOccupied": 8,
    "stuckCount": 2,
    "stuckTables": [
      {
        "tableId": "65a1b2c3...",
        "tableNumber": 5,
        "orderId": "65a1b2c4..."
      },
      {
        "tableId": "65a1b2c5...",
        "tableNumber": 12,
        "orderId": "65a1b2c6..."
      }
    ]
  }
}
```

### Monitor Logs

```bash
# Watch all stuck-table events
tail -f logs.txt | grep "stuck-tables"

# Count detected stuck tables
grep "stuck-tables.detected" logs.txt | wc -l

# Count successfully fixed stuck tables
grep "stuck-tables.auto_fixed" logs.txt | wc -l

# Count failed retries
grep "stuck-tables.auto_fix_failed" logs.txt | wc -l
```

## Troubleshooting

### Scheduler not starting?

**Check logs:**
```bash
npm run dev 2>&1 | grep -i "stuck"
```

**Common issues:**
- ❌ `STUCK_TABLE_CRON_ENABLED` not set to `'true'` (must be string)
- ❌ Missing `.env` file
- ❌ Wrong interval format (must be milliseconds as integer)

**Solution:**
```bash
# Verify in .env
echo $STUCK_TABLE_CRON_ENABLED  # Should print: true
echo $STUCK_TABLE_CRON_INTERVAL_MS  # Should print: 300000
```

### Scheduler running but not finding stuck tables?

**Check if queries work:**
```javascript
// Find occupied tables
const occupied = await Table.countDocuments({ status: 'occupied' });
console.log('Occupied tables:', occupied);

// Find stuck tables
const stuck = await Table.aggregate([
  { $match: { status: 'occupied', isActive: true } },
  { $lookup: { /* ...query... */ } },
  { $match: { completeOrder: { $ne: [] } } }
]);
console.log('Stuck tables:', stuck.length);
```

### Stuck table found but retry failed?

**Check logs for specific error:**
```bash
grep "stuck-tables.auto_fix_failed" logs.txt | tail -1
```

**Common retry failures:**
- ❌ Permission denied (merchant/branch mismatch)
- ❌ Invalid table transition (already 'available')
- ❌ Network error (try again next cycle)

## Performance Notes

- **Default interval: 5 minutes** — Good balance between responsiveness and DB load
- **For high-volume restaurants:** Use 10-minute interval (`600000`)
- **For testing/dev:** Use 1-minute interval (`60000`)

## Disabling (if needed)

```bash
# In .env
STUCK_TABLE_CRON_ENABLED=false
```

**Note:** If disabled, stuck tables won't auto-recover. Staff must use manual free table endpoint.

