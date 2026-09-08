# AuditLogger Bug - App-Wide Investigation

**Date:** 2026-08-21  
**Priority:** 🔴 **HIGH** - Potential compliance issue  
**Status:** Investigation in progress

---

## Executive Summary

The `utils/auditLogger.js` utility has been broken with incorrect require paths and function names. This affects **ALL audit logging across the application**, not just Route 3. There may be a significant audit trail gap in production.

---

## Bug Details

### What Was Broken

**File:** `utils/auditLogger.js`

**Issue 1 - Wrong require path:**
```javascript
// BROKEN (probably existed before):
const { getRequestContext } = require('../src/common/middleware/request-context');

// FIXED (in Route 3 branch):
const { getContext } = require('./request-context');
```

**Issue 2 - Wrong function name:**
```javascript
// BROKEN:
const context = getRequestContext(); // Function doesn't exist in target module

// FIXED:
const context = getContext(); // Correct function
```

### How It Failed

When `auditLogger()` was called:
1. `require('./request-context')` would work
2. But calling `getRequestContext()` would throw: `TypeError: getRequestContext is not a function`
3. Error caught by try-catch in auditLogger
4. Error logged via `logger.error('audit.write.failed', ...)`
5. **No audit log created** (operation silently continues)

### Impact

**By design**, audit failures don't crash the app:
```javascript
} catch (err) {
  logger.error('audit.write.failed', { ... });
  // Don't crash the app - audit failure shouldn't block business operations
}
```

This means:
- ✅ Application continued to work normally
- ❌ Zero audit logs created for affected operations
- ⚠️ Failures only visible in application logs (if anyone was looking)

---

## Scope Analysis

### Call Sites Found

**1. Route 3 Menu Publishing** (✅ FIXED)
- **File:** `src/modules/menu/service/MenuGroup.service.js`
- **Line:** 698-720
- **Status:** Fixed in Route 3 branch
- **Call signature:**
  ```javascript
  await auditLogger({
    user: publishedBy,
    merchant: merchantId,
    branch: branchId,
    action: 'MENU_PUBLISH',
    resource: 'MenuPublication',
    resourceId: publication._id,
    method: 'POST',
    endpoint: '/api/v1/menu/publish',
    statusCode: 200,
    severity: 'medium',
    outcome: 'success',
    metadata: { ... }
  });
  ```

**2. Report Controller** (❌ LIKELY BROKEN)
- **File:** `src/modules/reports/controller/report.controller.js`
- **Line:** 23 (import), multiple calls (194, 368, 522, 597)
- **Status:** Likely broken (on main branch)
- **Call count:** 4 distinct calls
- **Actions logged:**
  - `REPORT_ACCESS` (profitability report)
  - `REPORT_ACCESS` (sales summary)
  - `REPORT_EXPORT` (export jobs)
  - `REPORT_ACCESS` (another report type)

**3. Potentially Others** (❓ UNKNOWN)
- Search only covered `.js` files in src/ and tests/
- May exist in:
  - Other controllers
  - Other services
  - Middleware
  - Background jobs

### Search Commands Run

```bash
# Initial search (found 4 files)
grep -r "auditLogger" **/*.js

# More targeted search (found 2 implementation files)
grep -r "require(.*auditLogger" **/*.js
```

**Need more comprehensive search:**
```bash
# Search all JS files including subdirectories
grep -r "auditLogger" src/ --include="*.js" -A 5 -B 5

# Search for any audit-related imports
grep -r "audit" src/ --include="*.js" | grep -E "(require|import).*audit"

# Check for direct AuditLog model usage (bypassing auditLogger)
grep -r "AuditLog\\.create" src/ --include="*.js"
```

---

## Production Impact Assessment

### Questions to Answer

1. **When was the bug introduced?**
   - Check git history of `utils/auditLogger.js`
   - Find commit that broke the require path
   - Determine if this ever worked correctly

2. **What is the gap period?**
   - From: Date bug introduced
   - To: Date fix deployed (pending)
   - Duration: ??? days/weeks/months

3. **Are there ANY audit logs in production?**
   - Query production database:
     ```javascript
     db.auditlogs.find().sort({createdAt: -1}).limit(10)
     // Check if recent logs exist at all
     
     db.auditlogs.countDocuments({
       createdAt: { $gte: ISODate("2026-08-01") }
     })
     // Count August logs
     ```

4. **Which operations are affected?**
   - Menu publishing (Route 3) - definitely affected
   - Report access/export - likely affected
   - What else uses auditLogger?

5. **Can the audit trail be reconstructed?**
   - Check application logs for `audit.write.failed` entries
   - Check if enough metadata exists to reconstruct
   - Assess feasibility of backfilling

### Compliance Risk

**IF audit logging is a compliance requirement** (GDPR, SOC 2, HIPAA, PCI-DSS):
- ⚠️ **CRITICAL:** Missing audit trail could be a violation
- 📋 **Required actions:**
  - Document the gap period
  - Assess which regulated operations were affected
  - Notify compliance team/legal
  - File incident report if required by framework
  - Plan remediation (reconstruct trail if possible)

**IF audit logging is "nice to have":**
- ⚠️ **MODERATE:** Lost forensic capability for the gap period
- 📋 **Actions:**
  - Document the issue
  - Fix and deploy ASAP
  - Add monitoring to detect future failures

---

## Root Cause Analysis

### How Did This Happen?

**Hypothesis 1: Refactoring broke it**
- `request-context` module was moved or refactored
- `auditLogger.js` require path wasn't updated
- No tests caught it (audit logging not tested at import time)

**Hypothesis 2: Never worked correctly**
- Code was written with wrong path from start
- Tests mocked auditLogger, so never actually called
- Production failures went unnoticed (silent by design)

**Hypothesis 3: Dependency issue**
- `request-context` module exports changed
- `getRequestContext` was renamed to `getContext`
- `auditLogger.js` not updated to match

### Why Wasn't It Caught?

1. **No import-time errors:**
   - `require('./request-context')` succeeds
   - Only fails when function is called
   - Fails inside try-catch (swallowed)

2. **Tests may have mocked auditLogger:**
   - Tests never execute real auditLogger code
   - Integration tests may not check audit log creation
   - End-to-end tests may not assert on audit records

3. **No monitoring of audit log volume:**
   - No alerts on "zero audit logs in last hour"
   - No dashboard showing audit log counts
   - Failures logged but not monitored

4. **Fail-safe design backfired:**
   - Intentional: "audit failure shouldn't crash app"
   - Consequence: audit failure goes unnoticed
   - Trade-off: availability vs. observability

---

## Immediate Actions Required

### 1. Check Production Audit Logs (NOW)

**Connect to production database:**
```javascript
// MongoDB shell
use MesobDb  // or your production DB name

// Check if ANY recent audit logs exist
db.auditlogs.find().sort({createdAt: -1}).limit(10).pretty()

// Count logs by day for last 30 days
db.auditlogs.aggregate([
  {
    $match: {
      createdAt: { $gte: new Date(Date.now() - 30*24*60*60*1000) }
    }
  },
  {
    $group: {
      _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
      count: { $sum: 1 }
    }
  },
  {
    $sort: { _id: 1 }
  }
])

// Check for specific action types
db.auditlogs.aggregate([
  {
    $match: {
      createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) }
    }
  },
  {
    $group: {
      _id: "$action",
      count: { $sum: 1 }
    }
  },
  {
    $sort: { count: -1 }
  }
])
```

**Expected outcomes:**
- **Best case:** Audit logs ARE being created (different code path works)
- **Moderate case:** Some audit logs exist (some code paths broken, others work)
- **Worst case:** ZERO audit logs for weeks/months (complete audit trail gap)

### 2. Search Application Logs (NOW)

**Look for audit failures:**
```bash
# On production server
grep "audit.write.failed" /var/log/app/*.log | wc -l
# Count how many failures

grep "audit.write.failed" /var/log/app/*.log | head -20
# Sample of failure messages

grep "audit.write.failed" /var/log/app/*.log | grep "getRequestContext is not a function"
# Confirm this is the error
```

**What to look for:**
- Error: `getRequestContext is not a function`
- Error: `Cannot find module './request-context'`
- Stack traces showing auditLogger failures

### 3. Check Git History (NOW)

```bash
# When was auditLogger.js last modified?
git log --follow -p utils/auditLogger.js

# When was request-context module modified?
git log --follow -p src/common/middleware/request-context.middleware.js

# Find commits that touched either file
git log --all --oneline --graph -- utils/auditLogger.js src/common/middleware/request-context.middleware.js
```

**Determine:**
- When was the bug introduced?
- Was there ever a working version?
- Which commits/PRs are affected?

### 4. File High-Priority Bug Ticket (NOW)

**Template:**

```markdown
# AuditLogger Broken App-Wide - Potential Compliance Gap

**Priority:** HIGH  
**Severity:** CRITICAL (if audit trail is compliance requirement)  
**Component:** utils/auditLogger.js  
**Affects:** All branches (main, develop, feature branches)

## Summary
The auditLogger utility has been broken with incorrect require path and function name. This affects ALL audit logging across the application. May result in zero audit logs being created in production.

## Impact
- **Scope:** All operations using auditLogger (menu publishing, report access, etc.)
- **Gap period:** TBD (checking git history)
- **Production status:** TBD (checking production database)
- **Compliance risk:** TBD (depends on regulatory requirements)

## Root Cause
1. Incorrect require path: `require('../src/common/middleware/request-context')` should be `require('./request-context')`
2. Wrong function name: `getRequestContext()` should be `getContext()`

## Fix
Already implemented in Route 3 branch. Needs backport to:
- [ ] main branch
- [ ] develop branch  
- [ ] Any active feature branches
- [ ] Production hotfix (if audit trail is critical)

## Verification Steps
1. Check production audit logs (see investigation doc)
2. Check application logs for audit.write.failed errors
3. Determine gap period from git history
4. Assess compliance impact with legal/compliance team

## Related
- Route 3 implementation (fixed version)
- Investigation doc: AUDITLOGGER-BUG-INVESTIGATION.md
```

### 5. Comprehensive Call Site Search (WITHIN 24 HOURS)

```bash
# Find ALL files that import auditLogger
find src/ -name "*.js" -exec grep -l "auditLogger" {} \;

# For each file, check the call signature
for file in $(find src/ -name "*.js" -exec grep -l "auditLogger" {} \;); do
  echo "=== $file ==="
  grep -A 10 "auditLogger" "$file"
done

# Check if any code bypasses auditLogger and uses AuditLog directly
find src/ -name "*.js" -exec grep -l "AuditLog\.create" {} \;
```

**Document:**
- All files using auditLogger
- How they call it (what parameters)
- Whether they await the result
- Whether they handle errors

---

## Fix Strategy

### Option A: Immediate Hotfix (Recommended)

**For production systems where audit trail is critical:**

1. **Create hotfix branch from production:**
   ```bash
   git checkout production  # or main, depending on workflow
   git checkout -b hotfix/auditlogger-broken
   ```

2. **Apply fix from Route 3:**
   ```bash
   # Copy fixed auditLogger.js
   git checkout route-3-branch -- utils/auditLogger.js
   ```

3. **Test fix:**
   ```bash
   npm test -- auditLogger
   # Or run specific test that exercises audit logging
   ```

4. **Deploy immediately:**
   - Create emergency PR
   - Fast-track review
   - Deploy to production ASAP

5. **Verify in production:**
   ```javascript
   // Check new audit logs are being created
   db.auditlogs.find().sort({createdAt: -1}).limit(5)
   ```

### Option B: Include in Next Release

**For systems where audit trail is nice-to-have:**

1. **Backport fix to main/develop:**
   ```bash
   git checkout develop
   git checkout -b fix/auditlogger-broken
   git cherry-pick <route-3-commit-hash>
   ```

2. **Test in staging:**
   - Deploy to staging environment
   - Verify audit logs being created
   - Check all call sites work correctly

3. **Include in next scheduled release**

### Option C: Wait for Route 3 Merge

**Only if audit trail is not important:**

1. Wait for Route 3 branch to be merged
2. Fix will be included automatically
3. No separate action needed

---

## Long-Term Improvements

### 1. Add Monitoring

**Detect future audit logging failures:**

```javascript
// In auditLogger.js catch block
} catch (err) {
  logger.error('audit.write.failed', {
    error: err.message,
    stack: err.stack,
    userId: user?._id?.toString() || user?.toString(),
    action,
    resource,
    resourceId: resourceId?.toString(),
    endpoint,
    severity: 'CRITICAL',  // ✅ Already present in fixed version
    impact: 'audit_trail_gap',  // ✅ Already present
  });
  
  // NEW: Increment metric for monitoring
  metrics.increment('audit.write.failed', {
    action,
    resource
  });
}
```

**Set up alerting:**
- Alert if audit.write.failed count > 0 in last 5 minutes
- Alert if audit log volume drops to zero for >1 hour
- Dashboard showing audit logs per minute/hour

### 2. Add Integration Tests

**Test audit logging actually works:**

```javascript
// tests/audit-integration.test.js
describe('Audit Logging Integration', () => {
  it('should create audit log when auditLogger called', async () => {
    const testUser = await User.create({ ... });
    
    await auditLogger({
      user: testUser._id,
      merchant: merchantId,
      action: 'TEST_ACTION',
      resource: 'TestResource',
      method: 'GET',
      endpoint: '/api/test',
      statusCode: 200,
    });
    
    const auditLog = await AuditLog.findOne({
      action: 'TEST_ACTION',
      user: testUser._id
    });
    
    expect(auditLog).toBeDefined();
    expect(auditLog.resource).toBe('TestResource');
  });
});
```

### 3. Add Health Check

**Endpoint to verify audit logging works:**

```javascript
// src/routes/health.js
router.get('/health/audit', async (req, res) => {
  try {
    const testAuditId = new mongoose.Types.ObjectId();
    
    await auditLogger({
      user: req.user?._id || null,
      action: 'HEALTH_CHECK',
      resource: 'System',
      resourceId: testAuditId,
      method: 'GET',
      endpoint: '/health/audit',
      statusCode: 200,
      metadata: { timestamp: new Date() }
    });
    
    // Verify it was created
    const created = await AuditLog.findOne({
      action: 'HEALTH_CHECK',
      resourceId: testAuditId
    });
    
    if (!created) {
      throw new Error('Audit log not created');
    }
    
    // Clean up test log
    await AuditLog.deleteOne({ _id: created._id });
    
    res.json({
      status: 'ok',
      auditLogging: 'working',
      timestamp: new Date()
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      auditLogging: 'broken',
      error: error.message,
      timestamp: new Date()
    });
  }
});
```

### 4. Consider Making Audit Failures Visible

**Trade-off:** Current design prioritizes availability over observability.

**Alternative:** Make audit failures visible but non-blocking:

```javascript
const auditLogger = async ({ ... }) => {
  try {
    // ... audit log creation
  } catch (err) {
    logger.error('audit.write.failed', { ... });
    
    // NEW: Return error info instead of swallowing
    return {
      success: false,
      error: err.message
    };
  }
  
  return {
    success: true
  };
};
```

**Callers can then:**
```javascript
const auditResult = await auditLogger({ ... });

if (!auditResult.success) {
  // Log warning but don't fail the operation
  logger.warn('audit_failed_for_operation', {
    operation: 'menu_publish',
    auditError: auditResult.error
  });
}
```

---

## Summary

### What We Know

✅ **Bug confirmed:**
- Wrong require path
- Wrong function name
- Fixed in Route 3 branch

✅ **Scope identified:**
- Menu publishing (Route 3)
- Report controller (4 calls)
- Potentially others (need comprehensive search)

❓ **Unknown (need investigation):**
- When was bug introduced?
- Are there ANY audit logs in production?
- What is the gap period?
- Is this a compliance issue?

### What We Need To Do

**Immediate (within 24 hours):**
1. ✅ Document the bug (this file)
2. ⏳ Check production audit logs
3. ⏳ Check application logs for failures
4. ⏳ Check git history for introduction date
5. ⏳ File high-priority bug ticket
6. ⏳ Comprehensive call site search
7. ⏳ Assess compliance impact

**Short-term (within 1 week):**
1. Backport fix to main/develop branches
2. Deploy hotfix if audit trail is critical
3. Verify fix in production
4. Reconstruct audit trail if possible/necessary

**Long-term:**
1. Add monitoring/alerting for audit failures
2. Add integration tests for audit logging
3. Add health check endpoint
4. Consider making audit failures more visible

### Deployment Decision

**Route 3 audit logging:**
- ✅ Fixed in Route 3 branch
- ✅ Tests passing (15/15)
- ⚠️ Bug exists in main branch (will conflict on merge)

**Recommendation:**
- Fix main branch FIRST (hotfix or immediate backport)
- Then merge Route 3 with confidence
- Avoids regression when Route 3 merges

---

## Next Steps for Developer

1. **Right now:** Run production audit log queries (see "Check Production Audit Logs" section)
2. **Within 1 hour:** Check git history to determine when bug was introduced
3. **Within 4 hours:** File high-priority bug ticket with findings
4. **Within 24 hours:** Complete comprehensive call site search
5. **Within 48 hours:** Decide on fix strategy (hotfix vs. next release)
6. **Within 1 week:** Deploy fix and verify in production
