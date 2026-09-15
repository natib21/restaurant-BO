# Branch-User Assignment API Integration Guide

## Overview
This guide covers the API endpoints for managing branch access assignments for users in the restaurant management system. These endpoints allow administrators to manually assign or remove branch access for staff members.

---

## Authentication
All endpoints require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

### Required Permissions
- User must be authenticated
- User must belong to the same merchant as the target user
- User must have appropriate role permissions (typically MANAGER or SUPER-MERCHANT-ADMIN)

---

## Endpoints

### 1. Assign Branches to User

**Endpoint:** `POST /api/v1/users/:userId/branches`

**Description:** Assign one or more branches to a user. Uses atomic `$addToSet` to prevent duplicates.

#### URL Parameters
- `userId` (required): MongoDB ObjectId of the target user

#### Request Body
```json
{
  "branchId": "507f1f77bcf86cd799439011"
}
```

OR for multiple branches:

```json
{
  "branchIds": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012",
    "507f1f77bcf86cd799439013"
  ]
}
```

#### Validation Rules
- Either `branchId` (string) or `branchIds` (array) must be provided
- All branch IDs must be valid MongoDB ObjectIds
- All branches must exist and belong to your merchant
- Target user must exist and belong to your merchant

#### Success Response (200 OK)
```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439010",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+251911222333",
      "email": "john.doe@example.com",
      "isActive": true,
      "branch": [
        {
          "_id": "507f1f77bcf86cd799439011",
          "name": "Downtown Branch",
          "branchCode": "BR-001",
          "isMain": true,
          "isActive": true
        },
        {
          "_id": "507f1f77bcf86cd799439012",
          "name": "Uptown Branch",
          "branchCode": "BR-002",
          "isMain": false,
          "isActive": true
        }
      ],
      "refreshHint": true,
      "message": "Assigned 2 branch(es) to user John"
    }
  }
}
```

#### Error Responses

**400 Bad Request** - Invalid input
```json
{
  "status": "fail",
  "message": "Either branchId or branchIds must be provided"
}
```

**403 Forbidden** - Cross-merchant assignment attempt
```json
{
  "status": "fail",
  "message": "Cannot assign branches: target user belongs to a different merchant"
}
```

**404 Not Found** - User or branch not found
```json
{
  "status": "fail",
  "message": "Target user not found"
}
```

#### cURL Example
```bash
curl -X POST https://api.yourapp.com/api/v1/users/507f1f77bcf86cd799439010/branches \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "branchIds": [
      "507f1f77bcf86cd799439011",
      "507f1f77bcf86cd799439012"
    ]
  }'
```

---

### 2. Remove Branch from User

**Endpoint:** `DELETE /api/v1/users/:userId/branches/:branchId`

**Description:** Remove a specific branch from a user's access list. Prevents removing all branches (user must have at least one).

#### URL Parameters
- `userId` (required): MongoDB ObjectId of the target user
- `branchId` (required): MongoDB ObjectId of the branch to remove

#### Request Body
None

#### Validation Rules
- User must exist and belong to your merchant
- Branch must exist and belong to your merchant
- Cannot remove last branch (user must retain access to at least one branch)

#### Success Response (200 OK)
```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439010",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+251911222333",
      "email": "john.doe@example.com",
      "isActive": true,
      "branch": [
        {
          "_id": "507f1f77bcf86cd799439011",
          "name": "Downtown Branch",
          "branchCode": "BR-001",
          "isMain": true,
          "isActive": true
        }
      ],
      "refreshHint": true,
      "message": "Removed 1 branch(es) from user John"
    }
  }
}
```

#### Error Responses

**400 Bad Request** - Attempting to remove last branch
```json
{
  "status": "fail",
  "message": "Cannot remove all branches from a user. A user must have access to at least one branch."
}
```

**403 Forbidden** - Cross-merchant operation
```json
{
  "status": "fail",
  "message": "Cannot unassign branches: target user belongs to a different merchant"
}
```

**404 Not Found** - User or branch not found
```json
{
  "status": "fail",
  "message": "Target user not found"
}
```

#### cURL Example
```bash
curl -X DELETE https://api.yourapp.com/api/v1/users/507f1f77bcf86cd799439010/branches/507f1f77bcf86cd799439012 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 3. Get User's Assigned Branches

**Endpoint:** `GET /api/v1/users/:userId/branches`

**Description:** Retrieve all branches currently assigned to a user.

#### URL Parameters
- `userId` (required): MongoDB ObjectId of the target user

#### Request Body
None

#### Success Response (200 OK)
```json
{
  "status": "success",
  "data": {
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+251911222333",
    "email": "john.doe@example.com",
    "branches": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "name": "Downtown Branch",
        "branchCode": "BR-001",
        "isMain": true,
        "isActive": true
      },
      {
        "_id": "507f1f77bcf86cd799439012",
        "name": "Uptown Branch",
        "branchCode": "BR-002",
        "isMain": false,
        "isActive": true
      }
    ],
    "totalBranches": 2
  }
}
```

#### Error Responses

**403 Forbidden** - Cross-merchant access
```json
{
  "status": "fail",
  "message": "Cannot access user: belongs to a different merchant"
}
```

**404 Not Found** - User not found
```json
{
  "status": "fail",
  "message": "User not found"
}
```

#### cURL Example
```bash
curl -X GET https://api.yourapp.com/api/v1/users/507f1f77bcf86cd799439010/branches \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Complete Integration Flow

### Scenario: Admin assigns two branches to a new staff member

#### Step 1: Create the user (existing endpoint)
```bash
POST /api/v1/merchants/users
{
  "firstName": "Jane",
  "lastName": "Smith",
  "phone": "+251911333444",
  "email": "jane.smith@example.com",
  "password": "SecurePass123!",
  "passwordConfirm": "SecurePass123!",
  "roleId": "507f1f77bcf86cd799439020"
}
```

Response:
```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439030",
      "firstName": "Jane",
      "lastName": "Smith",
      "branch": []  // Empty initially
    }
  }
}
```

#### Step 2: Assign branches to the user
```bash
POST /api/v1/users/507f1f77bcf86cd799439030/branches
{
  "branchIds": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012"
  ]
}
```

Response:
```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439030",
      "firstName": "Jane",
      "lastName": "Smith",
      "branch": [
        {
          "_id": "507f1f77bcf86cd799439011",
          "name": "Downtown Branch",
          "branchCode": "BR-001"
        },
        {
          "_id": "507f1f77bcf86cd799439012",
          "name": "Uptown Branch",
          "branchCode": "BR-002"
        }
      ],
      "refreshHint": true,
      "message": "Assigned 2 branch(es) to user Jane"
    }
  }
}
```

#### Step 3: Verify assignment
```bash
GET /api/v1/users/507f1f77bcf86cd799439030/branches
```

Response:
```json
{
  "status": "success",
  "data": {
    "firstName": "Jane",
    "lastName": "Smith",
    "branches": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "name": "Downtown Branch",
        "branchCode": "BR-001",
        "isMain": true,
        "isActive": true
      },
      {
        "_id": "507f1f77bcf86cd799439012",
        "name": "Uptown Branch",
        "branchCode": "BR-002",
        "isMain": false,
        "isActive": true
      }
    ],
    "totalBranches": 2
  }
}
```

#### Step 4: Remove one branch (optional)
```bash
DELETE /api/v1/users/507f1f77bcf86cd799439030/branches/507f1f77bcf86cd799439012
```

Response:
```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439030",
      "firstName": "Jane",
      "branch": [
        {
          "_id": "507f1f77bcf86cd799439011",
          "name": "Downtown Branch",
          "branchCode": "BR-001"
        }
      ],
      "refreshHint": true,
      "message": "Removed 1 branch(es) from user Jane"
    }
  }
}
```

---

## Frontend Implementation Notes

### JWT Staleness After Assignment
When a user's branch array changes, their JWT token becomes **stale** because it still contains the old `branches` array in the payload. The `refreshHint: true` flag in responses signals this condition.

#### Recommended Frontend Handling:

**Option 1: Immediate Re-login (Most Secure)**
```javascript
async function assignBranchesToUser(userId, branchIds) {
  const response = await fetch(`/api/v1/users/${userId}/branches`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${currentToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ branchIds })
  });
  
  const result = await response.json();
  
  if (result.data.user.refreshHint) {
    // Show message to user
    showNotification({
      type: 'warning',
      title: 'Branch Access Updated',
      message: 'Please re-login to refresh your session with new branch access.'
    });
    
    // Optionally force re-login if modifying current user
    if (userId === currentUserId) {
      logout();
      redirectToLogin();
    }
  }
  
  return result;
}
```

**Option 2: Silent Token Refresh (Better UX)**
```javascript
async function assignBranchesToUser(userId, branchIds) {
  const response = await fetch(`/api/v1/users/${userId}/branches`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${currentToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ branchIds })
  });
  
  const result = await response.json();
  
  if (result.data.user.refreshHint && userId === currentUserId) {
    // Silently refresh token by calling /me or re-authenticating
    await refreshUserContext();
  }
  
  return result;
}

async function refreshUserContext() {
  const response = await fetch('/api/v1/auth/me', {
    headers: {
      'Authorization': `Bearer ${currentToken}`
    }
  });
  
  const result = await response.json();
  
  // Update local user context
  updateUserState(result.data.user);
  
  // New token should be in response (if your /me endpoint generates one)
  if (result.token) {
    updateStoredToken(result.token);
  }
}
```

**Option 3: Handle 401 Gracefully**
```javascript
// Global axios interceptor
axios.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      const message = error.response.data.message;
      
      if (message.includes('reassigned to a different branch')) {
        // User's branch array changed mid-session
        showNotification({
          type: 'warning',
          title: 'Session Expired',
          message: 'Your branch access has changed. Please log in again.'
        });
        
        logout();
        redirectToLogin();
      }
    }
    
    return Promise.reject(error);
  }
);
```

---

## Security & Validation

### Merchant Isolation
All endpoints enforce **strict merchant isolation**:
- Target user must belong to the same merchant as the authenticated user
- All branches must belong to the same merchant
- Cross-merchant operations are rejected with 403 Forbidden

### Atomicity
All operations use **MongoDB atomic operators**:
- `$addToSet` prevents duplicate branch assignments
- `$pull` safely removes branches
- No race conditions from concurrent requests

### Minimum Branch Requirement
Users must always have **at least one branch** assigned:
- Prevents "homeless" users with no branch access
- DELETE endpoint rejects operations that would leave user with zero branches
- Create user with default branch OR assign immediately after creation

---

## Error Handling Reference

| Status Code | Scenario | Example Message |
|-------------|----------|-----------------|
| 400 | No branches provided | "No branches provided for assignment" |
| 400 | Invalid branch IDs | "One or more branches are invalid or do not belong to your merchant" |
| 400 | Removing last branch | "Cannot remove all branches from a user. A user must have access to at least one branch." |
| 401 | Missing/invalid JWT | "You are not logged in!" |
| 403 | Cross-merchant operation | "Cannot assign branches: target user belongs to a different merchant" |
| 404 | User not found | "Target user not found" |
| 404 | Branch not found | "One or more branches are invalid or do not belong to your merchant" |
| 500 | Server error | "Internal server error" |

---

## Testing Examples

### Postman Collection Variables
```json
{
  "base_url": "https://api.yourapp.com",
  "jwt_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "target_user_id": "507f1f77bcf86cd799439010",
  "branch_id_1": "507f1f77bcf86cd799439011",
  "branch_id_2": "507f1f77bcf86cd799439012"
}
```

### Automated Test (Jest/Supertest)
```javascript
describe('Branch-User Assignment API', () => {
  let authToken;
  let targetUserId;
  let branchId1, branchId2;

  beforeAll(async () => {
    // Setup: login, create user, create branches
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'Test@1234' });
    
    authToken = loginRes.body.token;
    // ... create test user and branches
  });

  test('Assign multiple branches to user', async () => {
    const response = await request(app)
      .post(`/api/v1/users/${targetUserId}/branches`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        branchIds: [branchId1, branchId2]
      });

    expect(response.status).toBe(200);
    expect(response.body.data.user.branch).toHaveLength(2);
    expect(response.body.data.user.refreshHint).toBe(true);
  });

  test('Prevent removing last branch', async () => {
    // First, ensure user has only one branch
    // ... setup code

    const response = await request(app)
      .delete(`/api/v1/users/${targetUserId}/branches/${branchId1}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Cannot remove all branches');
  });

  test('Reject cross-merchant assignment', async () => {
    // Create user from different merchant
    const otherMerchantUserId = '...';

    const response = await request(app)
      .post(`/api/v1/users/${otherMerchantUserId}/branches`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ branchId: branchId1 });

    expect(response.status).toBe(403);
    expect(response.body.message).toContain('different merchant');
  });
});
```

---

## Common Integration Issues & Solutions

### Issue 1: "Cannot assign branches: target user belongs to a different merchant"
**Cause:** Trying to assign branches to a user from a different merchant  
**Solution:** Ensure both the authenticated user and target user share the same `merchant._id`

### Issue 2: User assigned branches but still gets 401 on next request
**Cause:** JWT token is stale (contains old branch array)  
**Solution:** Implement token refresh flow (see "Frontend Implementation Notes" above)

### Issue 3: "One or more branches are invalid"
**Cause:** Branch IDs don't exist or belong to a different merchant  
**Solution:** Verify branch IDs with `GET /api/v1/branches` before assigning

### Issue 4: "Cannot remove all branches from a user"
**Cause:** Attempting to remove the user's last branch  
**Solution:** Ensure user has at least 2 branches before removing one, or replace instead of remove

---

## Additional Resources

- **User Model Schema:** `models/userModel.js`
- **Branch Model Schema:** `models/branchModel.js`
- **Service Implementation:** `src/modules/branch/service/BranchUserAssignmentService.js`
- **Controller:** `src/modules/branch/controller/BranchUserAssignmentController.js`
- **Routes:** `src/modules/users/users.routes.js`
- **Test Suite:** `tests/branch-user-assignment.test.js`
- **Auto-Assign Design:** `BRANCH-AUTO-ASSIGN-DESIGN.md`

---

## Summary

| Operation | Endpoint | Method | Body |
|-----------|----------|--------|------|
| Assign branches | `/api/v1/users/:userId/branches` | POST | `{ branchId }` or `{ branchIds: [...] }` |
| Remove branch | `/api/v1/users/:userId/branches/:branchId` | DELETE | None |
| Get user's branches | `/api/v1/users/:userId/branches` | GET | None |

**Key Points:**
- All operations require JWT authentication
- Strict merchant isolation enforced
- Atomic operations prevent race conditions
- Users must always have at least one branch
- JWT becomes stale after assignment; frontend should handle refresh
- Auto-assign happens for MANAGER role on branch creation (see separate guide)

For questions or issues, contact the backend team or refer to the test suite for working examples.
