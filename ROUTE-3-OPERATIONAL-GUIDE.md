# Route 3: Menu Publishing - Operational Guide

**Purpose:** Quick reference for operations team on monitoring and troubleshooting menu publishing  
**Last Updated:** 2026-08-21

---

## Normal Operation

### Successful Publish
1. User clicks "Publish" in menu management UI
2. Backend creates MenuPublication (version increments)
3. Backend updates MenuItem.publishStatus → `published`
4. MenuPublication.publishState → `complete`
5. QR code / public menu shows new version

**Expected Logs:**
```
menu.publication_created { publicationId, menuGroupId, branchId, version }
menu.items_published { publicationId, itemCount, expectedCount }
menu.published { menuGroupId, branchId, version }
```

---

## Monitoring

### Health Check Queries

**Check for incomplete publications (last hour):**
```javascript
db.menupublications.countDocuments({
  publishState: { $in: ['pending', 'incomplete'] },
  createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) }
})
```

**Expected:** 0 (if recovery script is running every 15 minutes)  
**Alert Threshold:** > 5 in last hour

**Check version conflicts (last hour):**
```bash
# Search logs for version conflict retries
grep "menu.publish.version_conflict" logs/app.log | tail -20
```

**Expected:** Rare (< 1 per day under normal load)  
**Alert Threshold:** > 10 per hour (indicates high concurrency or slow database)

---

## Recovery Script

### Purpose
Fixes incomplete publications where MenuItem update failed after MenuPublication succeeded.

### Schedule
**Recommended:** Every 15 minutes

### Setup (Linux/macOS)
```bash
# Edit crontab
crontab -e

# Add this line
*/15 * * * * cd /path/to/restaurant-BO && node scripts/recover-incomplete-publications.js >> logs/recovery.log 2>&1
```

### Setup (Windows Task Scheduler)
1. Open Task Scheduler
2. Create Basic Task: "Menu Publication Recovery"
3. Trigger: Daily, repeat every 15 minutes for duration of 1 day
4. Action: Start a program
   - Program: `node`
   - Arguments: `scripts/recover-incomplete-publications.js`
   - Start in: `C:\path\to\restaurant-BO`

### Manual Execution
```bash
# From project root
node scripts/recover-incomplete-publications.js
```

**Expected Output:**
```
✅ Connected to MongoDB
✅ Recovery complete:
   - Processed: 0 publications
   - Recovered: 0 publications
   - Already complete: 0 publications
   - Duration: 123ms
✅ Disconnected from MongoDB
```

---

## Troubleshooting

### Issue: "Publish failed due to concurrent modification"

**Symptom:**  
User sees error after clicking publish (409 status code)

**Cause:**  
Multiple users trying to publish same menu group simultaneously, retry limit exceeded

**Log Signature:**
```
menu.publish.version_conflict { attempt: 3, retrying: false }
```

**Resolution:**
- User should retry (usually succeeds on second attempt)
- If persistent: Check database performance (slow writes cause more conflicts)

**Prevention:**
- Disable "Publish" button after click (UI change)
- Increase MAX_VERSION_RETRIES if conflicts are frequent

---

### Issue: "Publish partially completed"

**Symptom:**  
User sees error, but MenuPublication exists in database

**Cause:**  
MenuItem.updateMany() failed after MenuPublication created (network timeout, database error)

**Log Signature:**
```
menu.publication_created { ... }
menu.publish.menuitem_update_failed { error: "...", publicationId: "..." }
```

**Immediate Impact:**
- MenuPublication exists with version N
- MenuItems still show `publishStatus: 'draft'`
- Publication marked `publishState: 'incomplete'`

**Auto-Resolution:**
- Recovery script will fix within 5-15 minutes
- Items will be updated to `published`
- Publication marked `complete` with recovery metadata

**Manual Fix (if urgent):**
```bash
node scripts/recover-incomplete-publications.js
```

**Verify Fix:**
```javascript
// Check publication state
db.menupublications.findOne({ _id: ObjectId("...") })
// Should have: publishState: 'complete', errorDetails.recoveredAt

// Check menu items
db.menus.find({ _id: { $in: [...] } }, { publishStatus: 1 })
// Should all be: publishStatus: 'published'
```

---

### Issue: Items missing active recipes

**Symptom:**  
User sees "Cannot publish: X item(s) missing active recipes" error

**Cause:**  
Menu items in group don't have active recipes assigned

**Resolution:**
1. Identify missing items:
   ```javascript
   // From error response
   { "missing": [ { "menuItemId": "...", "name": "Burger" } ] }
   ```
2. Staff must create/activate recipes for those items
3. Then retry publish

**Not a Bug:**  
This is intentional validation (prevents publishing unprepared items)

---

### Issue: Recovery script not running

**Symptom:**  
Incomplete publications persist for > 30 minutes

**Check:**
```bash
# Linux/macOS - check cron logs
grep "recover-incomplete-publications" /var/log/syslog

# Windows - check Task Scheduler history
# Task Scheduler → Menu Publication Recovery → History tab
```

**Fix:**
1. Verify cron/task schedule is active
2. Check script can connect to database (DATABASE env var set)
3. Run manually to verify script works
4. Check logs for errors in recovery.log

---

## Database Queries

### Find all publications for a menu group
```javascript
db.menupublications.find({
  merchant: ObjectId("..."),
  branch: ObjectId("..."),
  menuGroup: ObjectId("...")
}).sort({ version: -1 })
```

### Find incomplete publications (needs recovery)
```javascript
db.menupublications.find({
  publishState: { $in: ['pending', 'incomplete'] },
  createdAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) }
})
```

### Check MenuItem publish status for a group
```javascript
// First get menu group
const group = db.menugroups.findOne({ _id: ObjectId("...") })

// Then check items
db.menus.find({
  _id: { $in: group.items.map(i => i.menu) }
}, { name: 1, publishStatus: 1 })
```

### Find publications by version
```javascript
db.menupublications.findOne({
  merchant: ObjectId("..."),
  branch: ObjectId("..."),
  menuGroup: ObjectId("..."),
  version: 5
})
```

---

## Rollback Procedure

### Scenario: Need to unpublish a menu group

**Note:** Unpublish feature not yet implemented (see `ROUTE-3-PUBLISH-INVESTIGATION.md` Section 13)

**Workaround:**
```javascript
// Manually set items back to draft
db.menus.updateMany(
  { _id: { $in: [...menuItemIds] } },
  { $set: { publishStatus: 'draft' } }
)

// Archive the publication (don't delete - needed for audit trail)
db.menupublications.updateOne(
  { _id: ObjectId("...") },
  { $set: { status: 'archived' } }
)
```

---

## Performance Considerations

### Version Lookup Performance
- **Index Used:** `{ merchant: 1, branch: 1, menuGroup: 1, version: 1 }`
- **Expected Query Time:** < 5ms
- **Alert If:** > 50ms consistently

### MenuItem Bulk Update Performance
- **Operation:** `updateMany` on 10-50 items typically
- **Expected Time:** < 100ms
- **Alert If:** > 500ms consistently

### Recovery Script Performance
- **Expected Duration:** < 500ms (with 0-5 incomplete publications)
- **Alert If:** > 5 seconds consistently

---

## Logs to Monitor

### Success Indicators
- `menu.published` - Full operation succeeded
- `recovery.completed` - Recovery script ran successfully

### Warning Indicators
- `menu.publish.version_conflict` - Retry triggered (should be rare)
- `menu.incomplete_publications_detected` - Recovery needed

### Error Indicators
- `menu.publish.menuitem_update_failed` - Partial failure (auto-recovers)
- `recovery.failed` - Recovery script crashed (needs investigation)

---

## Future: Transaction-Based Implementation

**When replica set is available:**

1. MongoDB transactions will replace order-reversal approach
2. `publishState` field becomes unnecessary
3. Recovery script can be removed
4. Atomic consistency guaranteed (no recovery window)

**Migration Path:**  
See `ROUTE-3-NON-TRANSACTIONAL-PLAN.md` Section "Future Migration Path"

**Estimated Effort:** 2-3 hours

---

## Support Contacts

**For Publish Failures:**
- Check logs first (see Troubleshooting section)
- Run recovery script manually if urgent
- Escalate if recovery script fails

**For Recipe Validation Errors:**
- Direct to menu management team
- Not a technical issue (content issue)

**For Concurrent Modification Errors:**
- User should retry
- If persistent: Check database performance
- Consider increasing retry limit

---

**Last Review:** 2026-08-21  
**Next Review:** After Step 3 (Audit Logging) complete

