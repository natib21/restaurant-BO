# Route 3: Alternative Migration Plan (Without Transactions)

**Date:** 2026-08-21  
**Status:** Alternative approach - No replica set required  
**Prerequisite:** Replica set migration deferred to future

---

## Decision

User has requested to defer replica set configuration to the future. Route 3 migration will proceed **without transaction support** using an alternative consistency strategy.

---

## Trade-offs Acknowledged

### Without Transactions ❌

**Risk:** MenuItem and MenuPublication can become inconsistent if:
- MenuItem.publishStatus updates succeed
- MenuPublication.create() fails (validation, disk space, network error)

**Result:** Menu items marked as "published" but no publication snapshot exists.

### Mitigation Strategy ✅

Instead of transactions, use:
1. **Order reversal** - Create MenuPublication first, update MenuItem second
2. **Idempotency checks** - Detect and recover from partial failures
3. **Audit trail** - Log all operations for forensic recovery
4. **Health check** - Periodic scan for inconsistencies

---

## Revised Step 1: Order Reversal + Idempotency

### Strategy

**Reverse the operation order:**
1. Create MenuPublication first (fails early if there's a problem)
2. Update MenuItem.publishStatus second (now safe, publication exists)

**Why this works:**
- If MenuPublication fails, MenuItem remains `draft` (consistent)
- If MenuItem update fails after MenuPublication succeeds, it's detectable and recoverable

### Implementation

```javascript
static async publishMenuGroup({ menuGroupId, merchantId, branchId, publishedBy }) {
  // Validation (same as before)
  const { group, menus, missing } = await MenuManagementService.validateRecipesForGroup(
    menuGroupId,
    merchantId
  );

  if (missing.length > 0) {
    throw new AppError(`Cannot publish: ${missing.length} item(s) missing active recipes`, 400);
  }

  if (!group.branches.map(b => b.toString()).includes(String(branchId))) {
    throw new AppError('Menu group is not assigned to this branch', 400);
  }

  // ✅ Step 1: Get version (with retry for race condition)
  const MAX_VERSION_RETRIES = 3;
  let attempt = 0;
  let publication = null;

  while (attempt < MAX_VERSION_RETRIES) {
    attempt++;

    try {
      const last = await MenuPublication.findOne({
        merchant: merchantId,
        branch: branchId,
        menuGroup: menuGroupId,
      })
        .sort('-version')
        .select('version')
        .lean();

      const version = (last?.version || 0) + 1;

      // Build snapshot
      const snapshot = {
        menuGroup: {
          _id: group._id,
          name: getMenuGroupName(group, 'en'),
          visibility: group.visibility,
          priority: group.priority,
        },
        items: group.items.map(item => ({
          menu: item.menu,
          sortOrder: item.sortOrder,
          overridePrice: item.overridePrice,
          isHidden: item.isHidden,
        })),
        menus: menus.map(m => ({
          _id: m._id,
          name: getMenuName(m, 'en'),
          publishStatus: 'published',  // Intended state
        })),
      };

      // ✅ Step 2: Create MenuPublication FIRST (fail early)
      publication = await MenuPublication.create({
        merchant: merchantId,
        branch: branchId,
        menuGroup: menuGroupId,
        version,
        publishedBy,
        snapshot,
        recipeValidation: { passed: true, missingRecipes: [] },
        publishState: 'pending',  // ✅ NEW: Track completion status
      });

      logger.info('menu.publication_created', {
        publicationId: String(publication._id),
        menuGroupId: String(menuGroupId),
        branchId: String(branchId),
        version,
        merchantId: String(merchantId),
      });

      break;  // Success, exit retry loop

    } catch (error) {
      // Check for duplicate version (race condition)
      if (error.code === 11000 && error.keyPattern?.version) {
        if (attempt < MAX_VERSION_RETRIES) {
          logger.warn('menu.publish.version_conflict', {
            menuGroupId: String(menuGroupId),
            branchId: String(branchId),
            attempt,
            retrying: true,
          });
          continue;  // Retry with incremented version
        } else {
          throw new AppError(
            'Publish failed due to concurrent modification. Please try again.',
            409
          );
        }
      }

      // Other errors - fail immediately
      throw error;
    }
  }

  // ✅ Step 3: Update MenuItem.publishStatus SECOND (now safe)
  try {
    const updateResult = await Menu.updateMany(
      { _id: { $in: menus.map(m => m._id) }, merchant: merchantId },
      { $set: { publishStatus: 'published' } }
    );

    logger.info('menu.items_published', {
      publicationId: String(publication._id),
      itemCount: updateResult.modifiedCount,
      expectedCount: menus.length,
    });

    // ✅ Step 4: Mark publication as complete
    publication.publishState = 'complete';
    await publication.save();

    logger.info('menu.published', {
      menuGroupId: String(menuGroupId),
      branchId: String(branchId),
      version: publication.version,
      merchantId: String(merchantId),
    });

  } catch (updateError) {
    // ❌ MenuItem update failed - publication exists but incomplete
    logger.error('menu.publish.menuitem_update_failed', {
      error: updateError.message,
      publicationId: String(publication._id),
      menuGroupId: String(menuGroupId),
      branchId: String(branchId),
    });

    // Mark publication as inconsistent for recovery
    publication.publishState = 'incomplete';
    publication.errorDetails = {
      error: updateError.message,
      timestamp: new Date(),
    };
    await publication.save();

    throw new AppError(
      'Publish partially completed. Please contact support or retry.',
      500
    );
  }

  return publication;
}
```

### Schema Change: Add publishState Field

**File:** `models/MenuPublication.js`

```javascript
publishState: {
  type: String,
  enum: ['pending', 'complete', 'incomplete'],
  default: 'pending',
  index: true,
},
errorDetails: {
  error: String,
  timestamp: Date,
},
```

### Recovery Script

**File:** `scripts/recover-incomplete-publications.js`

```javascript
/**
 * Recover incomplete menu publications
 * Run periodically or on-demand to fix MenuItem inconsistencies
 */

const mongoose = require('mongoose');
const MenuPublication = require('../models/MenuPublication');
const Menu = require('../src/modules/menu/model/MenuItem.model');

async function recoverIncompletePublications() {
  const incompletePublications = await MenuPublication.find({
    publishState: { $in: ['pending', 'incomplete'] },
    createdAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) },  // Older than 5 minutes
  });

  for (const pub of incompletePublications) {
    const menuIds = pub.snapshot.menus.map(m => m._id);

    // Check current state
    const unpublishedItems = await Menu.find({
      _id: { $in: menuIds },
      publishStatus: { $ne: 'published' },
    });

    if (unpublishedItems.length === 0) {
      // All items already published, mark as complete
      pub.publishState = 'complete';
      await pub.save();
      console.log(`✅ Recovered publication ${pub._id} (items were already published)`);
    } else {
      // Some items still unpublished, attempt recovery
      await Menu.updateMany(
        { _id: { $in: unpublishedItems.map(m => m._id) } },
        { $set: { publishStatus: 'published' } }
      );

      pub.publishState = 'complete';
      pub.errorDetails = {
        ...pub.errorDetails,
        recoveredAt: new Date(),
        recoveredItemCount: unpublishedItems.length,
      };
      await pub.save();

      console.log(`✅ Recovered publication ${pub._id} (updated ${unpublishedItems.length} items)`);
    }
  }

  console.log(`\nRecovery complete. Processed ${incompletePublications.length} publications.`);
}

module.exports = { recoverIncompletePublications };

// Run if called directly
if (require.main === module) {
  mongoose.connect(process.env.DATABASE || process.env.DATABASE_LOCAL).then(async () => {
    await recoverIncompletePublications();
    await mongoose.disconnect();
    process.exit(0);
  });
}
```

---

## Step 2: Service Relocation (Unchanged)

Move `publishMenuGroup` to MenuGroupService (same as transactional plan).

---

## Step 3: Audit Logging (Unchanged)

Add manual audit log entry (same as transactional plan).

---

## Comparison: Transactional vs Non-Transactional

| Aspect | With Transactions | Without Transactions (This Plan) |
|--------|-------------------|----------------------------------|
| **Consistency** | Atomic (all-or-nothing) | Eventually consistent (with recovery) |
| **Race Condition** | Handled by retry + transaction | Handled by retry (version conflict only) |
| **Failure Recovery** | Automatic rollback | Manual recovery script |
| **Replica Set Required** | ✅ YES | ❌ NO |
| **Implementation Complexity** | Medium | Medium |
| **Operational Overhead** | Low | Medium (periodic recovery script) |
| **Risk Level** | Low | Medium (5-minute window for inconsistency) |

---

## Operational Requirements

### Periodic Recovery (Recommended)

Run recovery script every 15 minutes:

```bash
# Cron job (Linux)
*/15 * * * * node /path/to/scripts/recover-incomplete-publications.js

# Windows Task Scheduler
# Create task: Every 15 minutes, run node scripts/recover-incomplete-publications.js
```

### Monitoring

Add monitoring for `publishState: 'incomplete'`:

```javascript
// In health check endpoint
const incompleteCount = await MenuPublication.countDocuments({
  publishState: 'incomplete',
  createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) },  // Last hour
});

if (incompleteCount > 0) {
  logger.warn('menu.incomplete_publications_detected', { count: incompleteCount });
}
```

---

## Future Migration Path

When replica set becomes available:

1. **Deploy replica set** (MongoDB Atlas or self-hosted)
2. **Verify** with `check-replica-set-status.js`
3. **Implement transaction wrapper** (original Step 1 from transactional plan)
4. **Remove** `publishState` field and recovery script (cleanup)
5. **Test** transaction behavior under load

**Estimated effort:** 2-3 hours (just swap implementations)

---

## Testing Strategy

### Test Cases

1. ✅ **Happy path:** Publish succeeds, both MenuPublication and MenuItem updated
2. ✅ **Version conflict:** Concurrent publishes, verify both succeed with different versions
3. ✅ **MenuPublication create fails:** Verify MenuItem NOT updated (consistent state)
4. ✅ **MenuItem update fails:** Verify publication marked `incomplete`, recovery script fixes it
5. ✅ **Recovery script:** Create incomplete publication manually, run recovery, verify completion

---

## Decision Point

**Choose One:**

### Option A: Implement Non-Transactional Now (This Plan)
- ✅ No replica set required
- ✅ Can deploy immediately
- ⚠️ Requires recovery script + monitoring
- ⚠️ 5-minute inconsistency window possible

### Option B: Wait for Replica Set, Then Implement Transactional
- ✅ Atomic consistency (no recovery needed)
- ✅ Cleaner long-term solution
- ❌ Blocks Route 3 deployment until replica set configured

---

**Recommendation:** Implement Option A now (non-transactional), migrate to transactions later when replica set is available. This unblocks Route 3 progress while maintaining acceptable consistency guarantees.

---

**User Confirmation Required:** Should I proceed with the non-transactional implementation (Option A)?
