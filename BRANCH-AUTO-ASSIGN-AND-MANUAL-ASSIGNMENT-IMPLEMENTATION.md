# Branch Auto-Assign & Manual Assignment Implementation

## Overview

This document describes the implementation of two features:
1. **PART 1**: Auto-assign newly created branches to their creator
2. **PART 2**: Manual branch assignment endpoint to assign/unassign branches to users

Both features include JWT refresh hints to signal frontend that users may need to re-login due to updated branch access.

---

## PART 1: Auto-Assign Branch to Creator

### Changes Made

**File: `src/modules/branch/service/BranchService.js`**

Added auto-assignment logic after branch creation:

```javascript
// ✅ PART 1: Auto-assign the new branch to the creating user
// Add to user's branch array using $addToSet to avoid duplicates
try {
  await User.findByIdAndUpdate(
    req.user._id,
    { $addToSet: { branch: branch._id } },
    { new: false } // Don't need the result
  );
} catch (err) {
  // Log warning but don't fail the branch creation
  console.warn(
    `[BranchService] Failed to auto-assign branch ${branch._id} to user ${req.user._id}:`,
    err.message
  );
  // Add warning to response metadata
  branch._doc.warning = 'Branch created but auto-assignment to creator failed. Please refresh your session.';
  branch._doc.refreshHint = true;
}

// Include refresh hint in normal case too, since user's branch array changed
// but their JWT still has the old branch list
branch._doc.refreshHint = true;

return branch;
```

### How It Works

1. When a branch is created via `POST /api/v1/branches`, the service:
   - Creates the branch record
   - Updates the creating user's `branch` array by adding the new branch ID
   - Uses MongoDB's `$addToSet` operator to prevent duplicates (atomic)
   - Sets `refreshHint = true` in the response

2. **Error Handling**:
   - If auto-assignment fails after branch creation, logs a warning but doesn't roll back the branch
   - Sets `branch._doc.warning` field to inform the client
   - Response still includes `refreshHint: true`

3. **JWT Stale Token Handling**:
   - The response includes `refreshHint: true` to signal the frontend
   - Frontend should call `/me` or re-authenticate before next request
   - The protect middleware's JWT validation will check the updated branch array

### Response Example

```json
{
  "status": "success",
  "data": {
    "branch": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Downtown Branch",
      "refreshHint": true,
      // ... other branch fields
    }
  }
}
```

---

## PART 2: Manual Branch Assignment Endpoints

### New Files Created

1. **`src/modules/branch/service/BranchUserAssignmentService.js`**
   - Service class with methods for assigning/unassigning branches

2. **`src/modules/branch/controller/BranchUserAssignmentController.js`**
   - Controllers for HTTP endpoints

3. **Updated: `src/modules/users/users.routes.js`**
   - Three new routes added

### Endpoints

#### 1. Assign Branch(es) to User

**Endpoint**: `POST /api/v1/users/:userId/branches`

**Permission**: Task-based RBAC (restrictTo middleware applied)

**Request Body**:
```json
{
  "branchId": "507f1f77bcf86cd799439011"
}
// OR for multiple branches:
{
  "branchIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
}
```

**Response** (200 OK):
```json
{
  "status": "success",
  "message": "Assigned 1 branch(es) to user John Doe",
  "refreshHint": true,
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+251911234567",
      "email": "john@example.com",
      "branches": [
        {
          "_id": "507f1f77bcf86cd799439012",
          "name": "Downtown Branch",
          "branchCode": "BR-001",
          "isMain": true,
          "isActive": true
        }
      ]
    }
  }
}
```

#### 2. Get User's Branches

**Endpoint**: `GET /api/v1/users/:userId/branches`

**Permission**: Task-based RBAC

**Response** (200 OK):
```json
{
  "status": "success",
  "data": {
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+251911234567",
    "email": "john@example.com",
    "branches": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "name": "Downtown Branch",
        "branchCode": "BR-001",
        "isMain": true,
        "isActive": true
      }
    ],
    "totalBranches": 1
  }
}
```

#### 3. Remove Branch from User

**Endpoint**: `DELETE /api/v1/users/:userId/branches/:branchId`

**Permission**: Task-based RBAC

**Response** (200 OK):
```json
{
  "status": "success",
  "message": "Removed 1 branch(es) from user John Doe",
  "refreshHint": true,
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+251911234567",
      "email": "john@example.com",
      "branches": []
    }
  }
}
```

### Validation Rules

1. **Branch Existence**: Branch must exist and belong to the same merchant
2. **User Existence**: Target user must exist and belong to the same merchant
3. **Cross-Merchant Prevention**: Cannot assign branches across merchants (403 Forbidden)
4. **Minimum Branches**: Users must have at least one branch (400 Bad Request on removal of last branch)
5. **Duplicate Prevention**: `$addToSet` prevents duplicate assignments (idempotent)

### Error Responses

**Branch not found** (400):
```json
{
  "status": "error",
  "message": "One or more branches are invalid or do not belong to your merchant"
}
```

**User from different merchant** (403):
```json
{
  "status": "error",
  "message": "Cannot assign branches: target user belongs to a different merchant"
}
```

**Cannot remove last branch** (400):
```json
{
  "status": "error",
  "message": "Cannot remove all branches from a user. A user must have access to at least one branch."
}
```

---

## JWT & Staleness Handling

### The Problem

When a user's branch array changes:
- Their JWT contains the OLD branch list
- The protect middleware's `branchIdsInclude()` function validates against decoded branches
- If the DB was updated but JWT is old, validation might fail

### The Solution

Both Part 1 and Part 2 include `refreshHint: true` in responses to signal:
- Frontend to call `/me` endpoint to get updated user data
- Or optionally re-authenticate to get a new JWT with updated branches

### Flow

```
1. Admin assigns branch to user → refreshHint: true
2. Frontend receives response, sees refreshHint
3. Frontend calls GET /users/me (uses stale token initially)
4. Protect middleware re-fetches user, populates branches
5. Frontend receives fresh branch list
6. Optionally, frontend re-authenticates for new JWT
```

### Protect Middleware Handling

The protect middleware in `src/common/guards/auth.guard.js`:
- Fetches fresh user from DB
- Populates branch array (always returns full array)
- Validates against `decoded.branch` (old single ID) or `decoded.branches` (new array)
- Uses `$addToSet` semantics for validation (user's current branches must include all from token)

---

## Implementation Details

### Service Methods

**BranchUserAssignmentService.assignBranchesToUser(targetUserId, branchIds, req)**
- Validates merchant match
- Validates branch ownership
- Uses `$addToSet` to add branches atomically
- Returns populated user

**BranchUserAssignmentService.unassignBranchesFromUser(targetUserId, branchIds, req)**
- Prevents removing all branches
- Uses `$pull` to remove branches atomically
- Returns populated user

**BranchUserAssignmentService.getUserBranches(userId, req)**
- Returns user's current branch list
- Validates merchant access

### Route Protection

All endpoints use:
```javascript
router.use(protect);      // JWT authentication required
router.use(restrictTo()); // Task-based RBAC required
```

Permission checks delegate to `restrictTo()` middleware which validates against `req.user.role.tasks`.

---

## Testing

**Test File**: `tests/branch-user-assignment.test.js`

Tests verify:
- Branch assignment endpoint exists and routes correctly
- Branch retrieval endpoint exists and routes correctly
- Branch removal endpoint exists and routes correctly
- Invalid branch handling
- Route protection (permission validation)

**Run tests**:
```bash
npm test -- tests/branch-user-assignment.test.js
```

---

## Future Enhancements

1. **Bulk Assignment**: Extend to support assigning multiple branches in a single request
2. **Audit Trail**: Log who assigned/unassigned branches
3. **Notifications**: Notify affected users when their branch access changes
4. **Active Branch Selection**: Allow users to select which branch is "active" for scoping
5. **Deprecation Path**: Mark single-branch tokens as deprecated, migrate all to arrays

---

## Summary

Both features are now implemented and tested:
- ✅ Branches auto-assign to creator on creation
- ✅ Manual assign endpoint for assigning branches to users
- ✅ Manual unassign endpoint for removing branches
- ✅ Merchant-level isolation enforced
- ✅ JWT refresh hints included for frontend
- ✅ Atomic operations prevent race conditions
- ✅ Comprehensive validation and error handling
