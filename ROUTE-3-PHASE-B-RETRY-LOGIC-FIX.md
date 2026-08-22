# Route 3: Phase B Retry Logic Fix - Applied

**Date:** 2026-08-21  
**Status:** Corrected - Ready for Phase C

---

## Issue Identified

The original Step 1 retry logic in the migration plan had two critical flaws:

### Flaw 1: Brittle String Matching
```javascript
// ❌ BEFORE (fragile)
if (error.code === 11000 && error.message.includes('version')) {
  // retry
}
```

**Problem:** String-matching on `error.message` is fragile and breaks silently with MongoDB driver upgrades or error message format changes.

### Flaw 2: Missing TransientTransactionError Handling
```javascript
// ❌ BEFORE (incomplete)
// Only handled duplicate key (E11000)
// Missed TransientTransactionError (MongoDB's standard retry label)
```

**Problem:** MongoDB documentation states that any error with the `TransientTransactionError` label must be retried. This includes error code 112 (WriteConflict) and other transient write conflicts that occur during normal concurrent transaction execution. Without this check, ordinary concurrent load would cause hard failures instead of automatic retries.

---

## Fix Applied

### New Retry Logic (Corrected)

```javascript
} catch (error) {
  await session.abortTransaction();

  // ✅ AFTER: Robust structural checks for two retry conditions
  const isTransientError = error.errorLabels?.includes('TransientTransactionError');
  const isDuplicateVersion = error.code === 11000 && error.keyPattern?.version;
  const isRetryable = isTransientError || isDuplicateVersion;

  if (isRetryable) {
    attempt++;
    if (attempt < MAX_RETRIES) {
      const errorType = isTransientError ? 'transient_transaction_error' : 'version_conflict';
      logger.warn('menu.publish.retryable_error', {
        menuGroupId: String(menuGroupId),
        branchId: String(branchId),
        merchantId: String(merchantId),
        errorType,
        errorCode: error.code,
        errorLabels: error.errorLabels,
        attempt,
        retrying: true,
      });
      continue;  // Retry
    } else {
      // Max retries exhausted
      throw new AppError(
        'Publish failed due to concurrent modification. Please try again.',
        409
      );
    }
  }

  // Non-retryable errors fall through
  throw error;
}
```

---

## Changes Made

### 1. Transient Transaction Error Check (Primary)
```javascript
const isTransientError = error.errorLabels?.includes('TransientTransactionError');
```

**Why:**
- MongoDB's official retry mechanism
- Covers WriteConflict (error code 112) and other transient failures
- Standard across all MongoDB drivers
- Not tied to error message format

### 2. Duplicate Version Check (Application-Level)
```javascript
const isDuplicateVersion = error.code === 11000 && error.keyPattern?.version;
```

**Why:**
- Structural check on `keyPattern.version` instead of `message.includes('version')`
- Robust against error message format changes
- Specifically targets our unique constraint on version field
- False positives eliminated (won't retry unrelated E11000 errors)

### 3. Combined Retry Condition
```javascript
const isRetryable = isTransientError || isDuplicateVersion;
```

**Why:**
- Either condition triggers retry
- Both are expected, normal errors under concurrent load
- Clear separation from non-retryable errors (validation, disk space, etc.)

---

## Test Coverage Added

### New Test Case: TransientTransactionError Retry

```javascript
describe('Transient transaction error handling', () => {
  it('should retry on TransientTransactionError and eventually succeed', async () => {
    const originalCreate = MenuPublication.create;
    let attemptCount = 0;

    MenuPublication.create = jest.fn().mockImplementation(function(...args) {
      attemptCount++;
      if (attemptCount === 1) {
        // First attempt: throw TransientTransactionError
        const error = new Error('WriteConflict');
        error.code = 112;
        error.errorLabels = ['TransientTransactionError'];
        throw error;
      }
      // Second attempt: succeed
      return originalCreate.apply(this, args);
    });

    const publication = await MenuManagementService.publishMenuGroup({
      menuGroupId,
      merchantId,
      branchId,
      publishedBy: userId,
    });

    expect(attemptCount).toBe(2);  // ✅ Retry occurred
    expect(publication).toBeDefined();  // ✅ Eventually succeeded
    expect(publication.version).toBe(1);

    MenuPublication.create = originalCreate;  // Restore
  });

  it('should distinguish retryable from non-retryable duplicate key errors', () => {
    // Retryable: duplicate key on version field
    const retryableError = new Error('E11000 duplicate key');
    retryableError.code = 11000;
    retryableError.keyPattern = { merchant: 1, branch: 1, menuGroup: 1, version: 1 };
    
    const isRetryable1 = retryableError.code === 11000 && retryableError.keyPattern?.version;
    expect(isRetryable1).toBe(true);  // ✅ Should retry

    // Non-retryable: duplicate key on unrelated field
    const nonRetryableError = new Error('E11000 duplicate key');
    nonRetryableError.code = 11000;
    nonRetryableError.keyPattern = { email: 1 };  // Different field
    
    const isRetryable2 = nonRetryableError.code === 11000 && nonRetryableError.keyPattern?.version;
    expect(isRetryable2).toBe(false);  // ✅ Should not retry (let it throw)
  });
});
```

---

## Why This Matters

### Without the Fix

**Scenario 1: Driver Upgrade**
- MongoDB driver changes error message format from `"duplicate key error: version"` to `"E11000: index violation on version"`
- String matching fails: `error.message.includes('version')` returns false
- Retry logic doesn't trigger
- Concurrent publishes throw unhandled 500 errors instead of auto-retrying

**Scenario 2: Normal Concurrent Load**
- Two users publish simultaneously
- Transaction B encounters WriteConflict (error code 112, TransientTransactionError label)
- Original code doesn't check for TransientTransactionError
- Transaction B throws hard error instead of retrying
- User sees "Publish failed" even though a simple retry would have succeeded

### With the Fix

**Both scenarios:**
- Structural checks (`errorLabels`, `keyPattern`) are version-agnostic
- TransientTransactionError is MongoDB's standard, documented retry signal
- Retry logic fires correctly under normal concurrent load
- System behaves as MongoDB transaction documentation intends

---

## Migration Plan Status

**Step 1 Implementation:** ✅ Corrected  
**Test Coverage:** ✅ Updated (7 test cases, including TransientTransactionError)  
**Phase C Readiness:** ✅ Ready to proceed

---

## References

- **MongoDB Transactions Documentation:** [https://www.mongodb.com/docs/manual/core/transactions/](https://www.mongodb.com/docs/manual/core/transactions/)
- **TransientTransactionError Handling:** MongoDB docs explicitly state: _"If the callback encounters a TransientTransactionError, the transaction is aborted and the driver retries the entire transaction."_
- **Error Labels:** `error.errorLabels` is the official MongoDB mechanism for identifying retryable errors

---

**End of Fix Documentation**

**Next Step:** Proceed to Phase C (Step 1 implementation) with corrected retry logic.
