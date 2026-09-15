# Branch-User Assignment - Quick Reference

## API Endpoints Summary

### 1. Assign Branches to User
```http
POST /api/v1/users/:userId/branches
Authorization: Bearer <token>
Content-Type: application/json

{
  "branchIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
}
```

**Response:** User object with populated branches + `refreshHint: true`

---

### 2. Remove Branch from User
```http
DELETE /api/v1/users/:userId/branches/:branchId
Authorization: Bearer <token>
```

**Response:** User object with remaining branches + `refreshHint: true`

---

### 3. Get User's Branches
```http
GET /api/v1/users/:userId/branches
Authorization: Bearer <token>
```

**Response:** User info with branches array and total count

---

## Payload Examples

### Single Branch Assignment
```json
{
  "branchId": "507f1f77bcf86cd799439011"
}
```

### Multiple Branch Assignment
```json
{
  "branchIds": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012",
    "507f1f77bcf86cd799439013"
  ]
}
```

---

## Response Format

### Success Response
```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439010",
      "firstName": "John",
      "lastName": "Doe",
      "branch": [
        {
          "_id": "507f1f77bcf86cd799439011",
          "name": "Downtown Branch",
          "branchCode": "BR-001",
          "isMain": true
        }
      ],
      "refreshHint": true,
      "message": "Assigned 1 branch(es) to user John"
    }
  }
}
```

### Error Response
```json
{
  "status": "fail",
  "message": "Cannot assign branches: target user belongs to a different merchant"
}
```

---

## Common Use Cases

### 1. Create User + Assign Branches
```javascript
// Step 1: Create user
const createRes = await fetch('/api/v1/merchants/users', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '+251911222333',
    email: 'jane@example.com',
    password: 'SecurePass123!',
    passwordConfirm: 'SecurePass123!',
    roleId: managerRoleId
  })
});

const { data: { user } } = await createRes.json();

// Step 2: Assign branches
await fetch(`/api/v1/users/${user._id}/branches`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    branchIds: ['branchId1', 'branchId2']
  })
});
```

### 2. Transfer User Between Branches
```javascript
// Remove old branch
await fetch(`/api/v1/users/${userId}/branches/${oldBranchId}`, {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${token}` }
});

// Add new branch
await fetch(`/api/v1/users/${userId}/branches`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ branchId: newBranchId })
});
```

### 3. Check User's Current Branches
```javascript
const response = await fetch(`/api/v1/users/${userId}/branches`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data } = await response.json();
console.log(`User has access to ${data.totalBranches} branches`);
```

---

## Validation Rules

✅ **Allowed:**
- Assign single or multiple branches
- Duplicate assignments (safely ignored via `$addToSet`)
- Remove branch if user has 2+ branches

❌ **Blocked:**
- Cross-merchant assignments (403 Forbidden)
- Invalid branch IDs (400 Bad Request)
- Removing user's last branch (400 Bad Request)
- Assigning non-existent branches (400 Bad Request)

---

## Security Notes

- **Merchant Isolation:** All operations scoped to authenticated user's merchant
- **Atomicity:** Uses MongoDB atomic operators (`$addToSet`, `$pull`)
- **JWT Staleness:** After assignment, user must re-login or refresh token
- **Minimum Requirement:** Users must always have ≥1 branch

---

## Error Codes Quick Reference

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (invalid input, removing last branch) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (cross-merchant operation) |
| 404 | Not found (user or branch doesn't exist) |
| 500 | Server error |

---

## Frontend Handling: JWT Refresh

When `refreshHint: true` is returned, handle token staleness:

```javascript
if (result.data.user.refreshHint && userId === currentUserId) {
  // Option 1: Force re-login
  logout();
  redirectToLogin();
  
  // Option 2: Silent refresh
  await refreshUserContext();
}
```

---

## Testing with cURL

### Assign Branches
```bash
curl -X POST http://localhost:3000/api/v1/users/USER_ID/branches \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"branchIds":["BRANCH_ID_1","BRANCH_ID_2"]}'
```

### Remove Branch
```bash
curl -X DELETE http://localhost:3000/api/v1/users/USER_ID/branches/BRANCH_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get User Branches
```bash
curl -X GET http://localhost:3000/api/v1/users/USER_ID/branches \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Related Documentation

- **Full API Guide:** `docs/BRANCH-USER-ASSIGNMENT-API-GUIDE.md`
- **Auto-Assign Design:** `BRANCH-AUTO-ASSIGN-DESIGN.md`
- **Service Code:** `src/modules/branch/service/BranchUserAssignmentService.js`
- **Controller Code:** `src/modules/branch/controller/BranchUserAssignmentController.js`
- **Test Suite:** `tests/branch-user-assignment.test.js`
