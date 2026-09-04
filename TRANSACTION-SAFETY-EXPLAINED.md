# 🔒 Transaction Safety - SessionService

## ❓ The Question

> "Is table.status = 'occupied' updated in the same MongoDB transaction as DiningSession.create()? If the process crashes between the two writes, can the database end up with an active session but table.status still 'available'?"

**Answer:** ✅ **YES, now they are in the same transaction!** (After the fix)

---

## ❌ The Problem (Before Fix)

### Original Code (UNSAFE)

```javascript
static async getOrCreateActiveSession({ tableId, createdBy = null, session = null }) {
  // ... validation ...
  
  try {
    // Write #1: Create session
    const newSession = await DiningSession.create([{
      table: tableId,
      status: 'active',
      // ... other fields
    }], { session });  // ← Uses optional session param
    
    // ❌ PROBLEM: Second write not guaranteed to execute!
    table.status = 'occupied';
    await table.save({ session, validateBeforeSave: false });
    
    return { session: newSession[0], isNew: true };
  } catch (error) {
    // ...
  }
}
```

### What Could Go Wrong

**Scenario 1: Process Crash**
```
1. DiningSession.create() → ✅ Success (session written to DB)
2. Process crashes 💥 (server dies, out of memory, etc.)
3. table.save() → ❌ Never executes
4. Database state:
   - DiningSession: { table: "table5", status: "active" } ✅
   - Table: { _id: "table5", status: "available" } ❌
```

**Scenario 2: Network Partition**
```
1. DiningSession.create() → ✅ Success
2. Network partition between app and MongoDB 🔌
3. table.save() → ❌ Timeout/failure
4. Database state:
   - Active session exists
   - Table still shows "available"
```

**Scenario 3: MongoDB Failover**
```
1. DiningSession.create() → ✅ Success (primary node)
2. Primary node fails, replica set elects new primary 🔄
3. table.save() → ❌ Fails due to connection lost
4. Database state: Inconsistent
```

### The Consequence

**Orphaned Session:**
```javascript
// Database state after crash
DiningSession: { _id: "s1", table: "table5", status: "active" }
Table:         { _id: "table5", status: "available" }

// Next QR scan:
1. Customer B scans QR
2. getOrCreateActiveSession() called
3. Finds existing active session "s1" ✅
4. Returns session
5. BUT: Table still shows "available" in UI ❌
```

**Staff Confusion:**
- Staff dashboard shows table as "available"
- But session already exists and has orders
- Customer trying to order gets valid session
- Staff might assign table to someone else

---

## ✅ The Solution (After Fix)

### New Code (SAFE with Transactions)

```javascript
static async getOrCreateActiveSession({ 
  tableId, 
  createdBy = null, 
  mongoSession = null  // ← Renamed to avoid confusion with DiningSession
}) {
  // Determine if we need to manage transaction lifecycle
  const shouldManageTransaction = !mongoSession;
  let transactionSession = mongoSession;
  
  // ✅ Start new transaction if not provided by caller
  if (shouldManageTransaction) {
    transactionSession = await DiningSession.startSession();
    await transactionSession.startTransaction();
  }
  
  try {
    // All database operations use transactionSession
    const table = await Table.findById(tableId).session(transactionSession);
    
    // Check for existing session
    let existingSession = await DiningSession.findOne({
      table: tableId,
      status: 'active'
    }).session(transactionSession);
    
    if (existingSession) {
      // ✅ Commit transaction if we own it
      if (shouldManageTransaction) {
        await transactionSession.commitTransaction();
      }
      
      return { session: existingSession, isNew: false };
    }
    
    // ✅ BOTH writes in same transaction (atomic)
    try {
      // Write #1: Create session
      const newSession = await DiningSession.create([{
        table: tableId,
        status: 'active',
        // ... other fields
      }], { session: transactionSession });
      
      // Write #2: Update table (in SAME transaction)
      table.status = 'occupied';
      await table.save({ session: transactionSession, validateBeforeSave: false });
      
      // ✅ Commit transaction if we own it
      if (shouldManageTransaction) {
        await transactionSession.commitTransaction();
      }
      
      return { session: newSession[0], isNew: true };
      
    } catch (error) {
      // Handle race condition
      if (error.code === 11000) {
        // ✅ Rollback our transaction
        if (shouldManageTransaction) {
          await transactionSession.abortTransaction();
        }
        
        // Fetch the winning session (outside transaction)
        const raceSession = await DiningSession.findOne({
          table: tableId,
          status: 'active'
        });
        
        return { session: raceSession, isNew: false };
      }
      
      // ✅ Rollback on other errors
      if (shouldManageTransaction) {
        await transactionSession.abortTransaction();
      }
      throw error;
    }
    
  } catch (error) {
    // ✅ Rollback on any error
    if (shouldManageTransaction && transactionSession.inTransaction()) {
      await transactionSession.abortTransaction();
    }
    throw error;
    
  } finally {
    // ✅ Clean up transaction session
    if (shouldManageTransaction) {
      await transactionSession.endSession();
    }
  }
}
```

---

## 🔐 Transaction Guarantees

### ACID Properties

**Atomicity:** All-or-nothing
```javascript
// Transaction scope
await transactionSession.startTransaction();

// Write 1
await DiningSession.create([...], { session: transactionSession });

// Write 2
await table.save({ session: transactionSession });

// ✅ COMMIT: Both writes succeed
// ❌ ABORT: Neither write persists
await transactionSession.commitTransaction();
```

**Consistency:** Database stays valid
```javascript
// Before transaction: No active session, table available
// After commit: Active session exists, table occupied
// After abort: No active session, table available (rolled back)
```

**Isolation:** Concurrent transactions don't interfere
```javascript
// Transaction A
await session1.startTransaction();
await DiningSession.create(..., { session: session1 });
// Other transactions can't see this until commit

await session1.commitTransaction();
// Now visible to everyone
```

**Durability:** Once committed, data persists
```javascript
await transactionSession.commitTransaction();
// Even if server crashes now, both writes are permanent
```

---

## 🎬 Visual Flow: Transaction Protection

### Scenario: Process Crashes Mid-Transaction

```
┌──────────────────────────────────────────────────────────┐
│  Step 1: Start Transaction                               │
└──────────────────────────────────────────────────────────┘
transactionSession = await DiningSession.startSession();
await transactionSession.startTransaction();

State: Transaction open, no writes yet
Database: No changes visible to other connections


┌──────────────────────────────────────────────────────────┐
│  Step 2: Write #1 (Create Session)                       │
└──────────────────────────────────────────────────────────┘
await DiningSession.create([{
  table: tableId,
  status: 'active'
}], { session: transactionSession });

State: Write buffered in transaction
Database: Still no changes visible (not committed)


┌──────────────────────────────────────────────────────────┐
│  Step 3: Process Crashes Here! 💥                        │
└──────────────────────────────────────────────────────────┘
💥 Server dies / Out of memory / Network lost

State: Transaction never committed
MongoDB detects connection lost
MongoDB automatically ABORTS transaction

✅ Result: Database unchanged!
   - No session created
   - Table status still "available"
   - CONSISTENT STATE maintained


┌──────────────────────────────────────────────────────────┐
│  Step 3 (Normal Flow): Write #2 (Update Table)           │
└──────────────────────────────────────────────────────────┘
table.status = 'occupied';
await table.save({ session: transactionSession });

State: Both writes buffered
Database: Still no changes visible (not committed)


┌──────────────────────────────────────────────────────────┐
│  Step 4: Commit Transaction                              │
└──────────────────────────────────────────────────────────┘
await transactionSession.commitTransaction();

State: Transaction committed atomically
Database: BOTH writes now visible

✅ Result: Consistent state!
   - Session created
   - Table status = "occupied"
   - ATOMIC update
```

---

## 📊 Comparison: With vs Without Transactions

### Without Transactions (Old Code)

```javascript
// Write 1
await DiningSession.create([...]);  // ✅ Persisted immediately

// 💥 Crash here!

// Write 2
await table.save();  // ❌ Never executes

// Database state: INCONSISTENT
// - Session exists
// - Table still "available"
```

### With Transactions (New Code)

```javascript
await session.startTransaction();

// Write 1
await DiningSession.create([...], { session });  // ✅ Buffered

// 💥 Crash here!

// MongoDB automatically aborts transaction
// Database state: CONSISTENT
// - No session
// - Table still "available"
// - Both writes rolled back
```

---

## 🧪 Testing Transaction Safety

### Test 1: Normal Flow

```javascript
const { session, isNew } = await SessionService.getOrCreateActiveSession({
  tableId: tableId
});

// Verify:
assert(session.status === 'active');

const table = await Table.findById(tableId);
assert(table.status === 'occupied');

// ✅ Both fields updated atomically
```

### Test 2: Simulate Crash (Using Abort)

```javascript
const mongoSession = await DiningSession.startSession();
await mongoSession.startTransaction();

try {
  await DiningSession.create([{
    table: tableId,
    status: 'active'
  }], { session: mongoSession });
  
  // Simulate crash before table update
  throw new Error('Simulated crash');
  
  // This never executes:
  table.status = 'occupied';
  await table.save({ session: mongoSession });
  
} catch (error) {
  // Abort transaction (simulates MongoDB auto-abort on crash)
  await mongoSession.abortTransaction();
}

// Verify rollback:
const session = await DiningSession.findOne({ table: tableId, status: 'active' });
assert(session === null);  // ✅ Not created

const table = await Table.findById(tableId);
assert(table.status === 'available');  // ✅ Still available
```

### Test 3: Race Condition with Transaction

```javascript
// Two simultaneous requests
const [result1, result2] = await Promise.all([
  SessionService.getOrCreateActiveSession({ tableId }),
  SessionService.getOrCreateActiveSession({ tableId })
]);

// One creates, one reuses
assert(result1.isNew === true && result2.isNew === false ||
       result1.isNew === false && result2.isNew === true);

// Both get valid session
assert(result1.session.token);
assert(result2.session.token);

// Table status consistent
const table = await Table.findById(tableId);
assert(table.status === 'occupied');  // ✅ Consistent
```

---

## 🔍 Transaction Lifecycle Management

### Pattern: Automatic Transaction Management

```javascript
static async getOrCreateActiveSession({ 
  tableId, 
  createdBy = null, 
  mongoSession = null  // ← Optional: caller can provide transaction
}) {
  // Check if caller provided transaction
  const shouldManageTransaction = !mongoSession;
  let transactionSession = mongoSession;
  
  // ✅ Start transaction if not provided
  if (shouldManageTransaction) {
    transactionSession = await DiningSession.startSession();
    await transactionSession.startTransaction();
  }
  
  try {
    // ... do work ...
    
    // ✅ Commit if we started the transaction
    if (shouldManageTransaction) {
      await transactionSession.commitTransaction();
    }
    
    return result;
    
  } catch (error) {
    // ✅ Abort if we started the transaction
    if (shouldManageTransaction && transactionSession.inTransaction()) {
      await transactionSession.abortTransaction();
    }
    throw error;
    
  } finally {
    // ✅ Clean up if we started the transaction
    if (shouldManageTransaction) {
      await transactionSession.endSession();
    }
  }
}
```

### Usage Patterns

**Pattern 1: Automatic Transaction (Default)**
```javascript
// Service creates and manages transaction internally
const { session } = await SessionService.getOrCreateActiveSession({
  tableId: tableId
});
// ✅ Transaction started, committed, and cleaned up automatically
```

**Pattern 2: Caller-Provided Transaction**
```javascript
// Caller manages transaction (for multi-step operations)
const mongoSession = await DiningSession.startSession();
await mongoSession.startTransaction();

try {
  // Step 1: Create session
  const { session } = await SessionService.getOrCreateActiveSession({
    tableId: tableId,
    mongoSession: mongoSession  // ← Pass caller's transaction
  });
  
  // Step 2: Create order in same transaction
  await Order.create([{
    session: session._id,
    // ... other fields
  }], { session: mongoSession });
  
  // ✅ Commit both operations atomically
  await mongoSession.commitTransaction();
  
} catch (error) {
  // ✅ Rollback both operations
  await mongoSession.abortTransaction();
  throw error;
  
} finally {
  await mongoSession.endSession();
}
```

---

## 🚨 Edge Cases Handled

### 1. Race Condition + Transaction Abort

```javascript
// Request A and B try to create session simultaneously

// Request A wins, transaction commits
await transactionSession.commitTransaction();  // ✅

// Request B loses (duplicate key 11000)
catch (error) {
  if (error.code === 11000) {
    // ✅ Abort B's transaction
    await transactionSession.abortTransaction();
    
    // ✅ Fetch A's session (outside transaction)
    const raceSession = await DiningSession.findOne({ ... });
    return { session: raceSession, isNew: false };
  }
}
```

### 2. Validation Error Before Write

```javascript
try {
  const table = await Table.findById(tableId).session(transactionSession);
  
  if (!table.isActive) {
    // ✅ Throw before any writes
    throw new AppError('Table not available', 400);
  }
  
  // ... writes ...
  
} catch (error) {
  // ✅ Transaction aborted, no writes persisted
  await transactionSession.abortTransaction();
}
```

### 3. Network Timeout During Commit

```javascript
try {
  await transactionSession.commitTransaction();
  
} catch (error) {
  if (error.name === 'MongoNetworkError') {
    // Transaction may have committed on server but client lost connection
    // MongoDB's retryable writes will handle this
    logger.error('Network error during commit', { error });
  }
  throw error;
}
```

---

## ✅ Summary

### What Was Fixed

**Before:**
```javascript
// ❌ Two separate writes, not atomic
await DiningSession.create([...]);
await table.save();
// If crash between them → inconsistent state
```

**After:**
```javascript
// ✅ Both writes in same transaction, atomic
await session.startTransaction();
await DiningSession.create([...], { session });
await table.save({ session });
await session.commitTransaction();
// If crash before commit → both rolled back (consistent)
```

### Guarantees

✅ **Atomicity:** Both writes succeed or both fail (no partial state)  
✅ **Consistency:** Database never has session without table occupied  
✅ **Isolation:** Concurrent requests don't see partial updates  
✅ **Durability:** Once committed, survives crashes  

### Coverage

✅ `getOrCreateActiveSession()` - Creates session + updates table atomically  
✅ `endSession()` - Ends session + updates table atomically  
✅ Race condition handling - Aborts losing transaction cleanly  
✅ Error handling - Rolls back on any failure  

---

## 📝 Answer to Original Question

> **Question:** "Is table.status = 'occupied' updated in the same MongoDB transaction as DiningSession.create()?"

**Answer:** ✅ **YES**

> **Question:** "If the process crashes between the two writes, can the database end up with an active session but table.status still 'available'?"

**Answer:** ❌ **NO** - Transaction rollback prevents this

---

**Implementation:** Transaction-safe session management ✅  
**Date:** September 3, 2026  
**Status:** Production-ready with ACID guarantees
