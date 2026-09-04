# 🔒 Race Condition Handling - Explained

## 📋 The Problem

When two customers scan the same QR code at **exactly the same time**, both requests try to create a new session:

```
Time: 0ms
┌─────────────┐                    ┌─────────────┐
│  Request A  │                    │  Request B  │
│ (Customer A)│                    │ (Customer B)│
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  getOrCreateActiveSession()     │  getOrCreateActiveSession()
       ├─────────────────────────────────┤
       │                                  │
Time: 1ms - Both check if session exists
       │                                  │
       ├─> DiningSession.findOne()       │
       │   Result: null ❌                │
       │                                  ├─> DiningSession.findOne()
       │                                  │   Result: null ❌
       │                                  │
Time: 2ms - Both try to create session!
       │                                  │
       ├─> DiningSession.create()        │
       │                                  ├─> DiningSession.create()
       │                                  │
       ❓ RACE CONDITION: Who wins?
```

**Without proper handling:** 
- One request succeeds
- Other request crashes with duplicate key error
- Customer B sees error page 💥

**With proper handling:**
- One request creates session (wins)
- Other request catches error and fetches the winning session
- Both customers get valid session ✅

---

## 🛡️ The Solution

### 1️⃣ Partial Unique Index (Prevention Layer)

**File:** `models/DiningSession.js`

```javascript
/**
 * CRITICAL: Only one active session per table
 * This partial unique index ensures at most one session with status='active' per table
 */
diningSessionSchema.index(
  { table: 1 },  // ← Index on table field
  { 
    unique: true,  // ← Enforce uniqueness
    partialFilterExpression: { status: 'active' },  // ← Only for active sessions
    name: 'unique_active_session_per_table'
  }
);
```

**What this does:**
- MongoDB enforces: **Maximum 1 document where `{ table: X, status: 'active' }`**
- If Request B tries to insert duplicate, MongoDB returns **error code 11000**
- Allows multiple `ended` or `cancelled` sessions (not in the index)

**Example:**
```javascript
// ✅ ALLOWED: One active session per table
{ _id: "s1", table: "table5", status: "active" }

// ❌ BLOCKED: Second active session for same table
{ _id: "s2", table: "table5", status: "active" }  // ← Duplicate key error 11000

// ✅ ALLOWED: Ended sessions don't count
{ _id: "s3", table: "table5", status: "ended" }
{ _id: "s4", table: "table5", status: "ended" }
```

---

### 2️⃣ Try-Catch with Re-fetch (Recovery Layer)

**File:** `src/modules/sessions/service/SessionService.js`

**The Complete Race Condition Handler:**

```javascript
static async getOrCreateActiveSession({ tableId, createdBy = null, session = null }) {
  // ... validation code ...
  
  // Step 1: Try to find existing active session
  let existingSession = await DiningSession.findOne({
    table: tableId,
    status: 'active'
  }).session(session);
  
  if (existingSession) {
    // ✅ Session exists, return it (handles most cases)
    return {
      session: existingSession,
      isNew: false
    };
  }
  
  // Step 2: Try to create new session
  try {
    const newSession = await DiningSession.create([{
      table: tableId,
      merchant: table.merchant,
      branch: table.branch,
      token: crypto.randomBytes(32).toString('hex'),
      status: 'active',
      startedAt: new Date(),
      createdBy: createdBy || null,
      metadata: {
        guestCount: null,
        notes: createdBy ? 'Staff-initiated session' : 'QR-initiated session'
      }
    }], { session });
    
    // ✅ SUCCESS: We created the session
    table.status = 'occupied';
    await table.save({ session, validateBeforeSave: false });
    
    logger.info('session.created', {
      sessionId: newSession[0]._id.toString(),
      tableId: tableId.toString(),
      tableNumber: table.tableNumber,
      source: createdBy ? 'staff' : 'qr',
      createdBy: createdBy?.toString()
    });
    
    return {
      session: newSession[0],
      isNew: true
    };
    
  } catch (error) {
    // Step 3: Handle race condition (duplicate key error)
    if (error.code === 11000 && error.keyPattern && error.keyPattern.table) {
      // ✅ Another request won the race and created session
      logger.warn('session.race_condition_detected', {
        tableId: tableId.toString(),
        error: 'Duplicate active session creation attempt'
      });
      
      // Fetch the winning session
      const raceSession = await DiningSession.findOne({
        table: tableId,
        status: 'active'
      }).session(session);
      
      if (raceSession) {
        // ✅ SUCCESS: Return the session created by other request
        logger.info('session.race_condition_resolved', {
          sessionId: raceSession._id.toString(),
          tableId: tableId.toString()
        });
        
        return {
          session: raceSession,
          isNew: false  // ← We didn't create it, other request did
        };
      }
      
      // ❌ This shouldn't happen (session exists but we can't find it)
      throw new AppError('Failed to create or retrieve session', 500);
    }
    
    // ❌ Different error (not race condition), rethrow
    throw error;
  }
}
```

---

## 🎬 Visual Flow: Race Condition Scenario

### Scenario: Requests A and B Scan at Same Time

```
Time: 0ms
┌─────────────────────────────────────────────────────────────┐
│  Request A                      Request B                   │
└─────────────────────────────────────────────────────────────┘

Time: 1ms - Both check for existing session
┌─────────────────────────────────────────────────────────────┐
│  findOne({ table, status: 'active' })                       │
│  Result: null                   Result: null                │
└─────────────────────────────────────────────────────────────┘

Time: 2ms - Both try to create session
┌─────────────────────────────────────────────────────────────┐
│  DiningSession.create()         DiningSession.create()      │
│         │                              │                     │
│         │                              │                     │
│         ▼                              ▼                     │
└─────────────────────────────────────────────────────────────┘

Time: 3ms - MongoDB enforces unique index
┌─────────────────────────────────────────────────────────────┐
│         ✅ SUCCESS                    ❌ ERROR              │
│         Session created              Duplicate key!         │
│         _id: "s1"                    error.code: 11000      │
│         token: "abc123..."           error.keyPattern.table │
└─────────────────────────────────────────────────────────────┘

Time: 4ms - Request B catches error and recovers
┌─────────────────────────────────────────────────────────────┐
│  Request A                      Request B                   │
│  ────────────                   ────────────                │
│  return {                       catch (error) {             │
│    session: newSession,           if (error.code === 11000) │
│    isNew: true                      // Re-fetch session     │
│  }                                }                          │
│                                 }                            │
└─────────────────────────────────────────────────────────────┘

Time: 5ms - Request B fetches winning session
┌─────────────────────────────────────────────────────────────┐
│  Request A                      Request B                   │
│  ────────────                   ────────────                │
│  ✅ Returns:                    findOne({ table, status })  │
│  {                              Result: session "s1" ✅     │
│    session: {                                               │
│      _id: "s1",                 return {                    │
│      token: "abc123..."           session: raceSession,    │
│    },                             isNew: false              │
│    isNew: true                  }                           │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘

Time: 6ms - Both requests succeed!
┌─────────────────────────────────────────────────────────────┐
│  Customer A                     Customer B                  │
│  ────────────                   ────────────                │
│  ✅ Gets session token:         ✅ Gets session token:      │
│     "abc123..."                    "abc123..."              │
│                                                              │
│  Both have SAME session token → Can both order! 🎉          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔍 Error Handling Details

### The Catch Block Checks

**1. Check error code:**
```javascript
if (error.code === 11000) {
  // ✅ This is a duplicate key error
}
```

**2. Verify it's for the `table` field:**
```javascript
if (error.keyPattern && error.keyPattern.table) {
  // ✅ Duplicate is on the table index (not some other field)
}
```

**3. Re-fetch the winning session:**
```javascript
const raceSession = await DiningSession.findOne({
  table: tableId,
  status: 'active'
});
```

**4. Return the session if found:**
```javascript
if (raceSession) {
  return {
    session: raceSession,
    isNew: false  // ← We lost the race, using other's session
  };
}
```

**5. Fail if still not found (shouldn't happen):**
```javascript
throw new AppError('Failed to create or retrieve session', 500);
```

---

## 📊 Possible Outcomes

### Case 1: No Race Condition (99% of cases)
```
Request A → findOne() → null → create() → ✅ Success
Request B → findOne() → session exists → ✅ Return existing
```

### Case 2: Race Condition (1% of cases)
```
Request A → findOne() → null → create() → ✅ Success
Request B → findOne() → null → create() → ❌ Duplicate key
          → catch error → findOne() → ✅ Return Request A's session
```

### Case 3: Three-way Race (very rare)
```
Request A → findOne() → null → create() → ✅ Success
Request B → findOne() → null → create() → ❌ Duplicate → fetch → ✅
Request C → findOne() → null → create() → ❌ Duplicate → fetch → ✅
```

All succeed! All get same session token.

---

## 💡 Why This Works

### 1. **Atomic Operation**
MongoDB's unique index is checked **atomically** during insert:
```javascript
// MongoDB guarantees: only one can succeed
DiningSession.create() // ← Atomic check + insert
```

### 2. **No Distributed Lock Needed**
We don't need Redis locks or distributed transactions because:
- MongoDB index enforcement is atomic
- Catch + re-fetch is simple and reliable
- Race condition is rare (millisecond window)

### 3. **Graceful Degradation**
Even if re-fetch fails (network issue), we throw clear error:
```javascript
throw new AppError('Failed to create or retrieve session', 500);
```
This is logged and can be retried by client.

---

## 🧪 Testing Race Conditions

### Manual Test with Artillery (Load Testing)

```yaml
# artillery-race-test.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 1
      arrivalRate: 100  # ← 100 concurrent requests

scenarios:
  - name: 'Concurrent QR Scans'
    flow:
      - post:
          url: '/api/v1/sessions/start?data=XXX&s=YYY'
```

**Expected result:**
- 100 requests
- 1 creates session (isNew: true)
- 99 get existing session (isNew: false)
- 0 errors 🎉

---

## 🚨 What We Prevent

### ❌ Without Race Handling:
```javascript
// Request A
DiningSession.create() // ✅ Success

// Request B (simultaneous)
DiningSession.create() // 💥 CRASH: Duplicate key error
```

**Customer B sees:**
```
500 Internal Server Error
Duplicate key error: table_1 already exists
```

### ✅ With Race Handling:
```javascript
// Request A
DiningSession.create() // ✅ Success

// Request B (simultaneous)
try {
  DiningSession.create() // ❌ Duplicate
} catch (error) {
  const session = await findOne() // ✅ Fetch Request A's session
  return session // ✅ Success
}
```

**Customer B sees:**
```json
{
  "sessionToken": "abc123...",
  "isNewSession": false,
  "message": "Welcome back! You can continue ordering."
}
```

---

## 📝 Summary

### The Two-Layer Defense

**Layer 1: Partial Unique Index (Prevention)**
```javascript
{ table: 1 }, 
{ 
  unique: true, 
  partialFilterExpression: { status: 'active' } 
}
```
- Enforced by MongoDB at database level
- Atomic check during insert
- Prevents duplicate active sessions

**Layer 2: Try-Catch + Re-fetch (Recovery)**
```javascript
try {
  create() // ✅ Win race
} catch (error) {
  if (error.code === 11000) {
    fetch() // ✅ Lose race, use winner's session
  }
}
```
- Catches duplicate key errors gracefully
- Re-fetches the winning session
- Both requests succeed

---

## ✅ Confirmation

**Index Definition:**
```javascript
diningSessionSchema.index(
  { table: 1 },
  { 
    unique: true, 
    partialFilterExpression: { status: 'active' },
    name: 'unique_active_session_per_table'
  }
);
```
✅ Confirmed: `{ table: 1 }` unique with `partialFilterExpression: { status: 'active' }`

**Race Handling:**
```javascript
} catch (error) {
  if (error.code === 11000 && error.keyPattern && error.keyPattern.table) {
    const raceSession = await DiningSession.findOne({
      table: tableId,
      status: 'active'
    });
    
    if (raceSession) {
      return { session: raceSession, isNew: false };
    }
  }
  throw error;
}
```
✅ Confirmed: Catches duplicate key (11000), re-fetches winning session, returns gracefully

---

**Result:** Multiple simultaneous QR scans succeed without crashes or duplicate sessions! 🎉
