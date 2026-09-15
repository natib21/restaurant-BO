# Branch-User Assignment Documentation

Complete documentation for the Branch-User Assignment feature.

---

## 📚 Documentation Index

### 1. **API Integration Guide** (Comprehensive)
**File:** `BRANCH-USER-ASSIGNMENT-API-GUIDE.md`

**Contents:**
- Complete API endpoint documentation
- Request/response formats
- Authentication requirements
- Validation rules
- Error handling reference
- Frontend implementation notes
- JWT staleness handling
- Complete integration flow examples
- Security & validation details
- Testing examples (Postman, Jest)
- Common integration issues & solutions

**Use this when:** You need complete API documentation with all details, examples, and troubleshooting.

---

### 2. **Quick Reference** (TL;DR)
**File:** `BRANCH-USER-ASSIGNMENT-QUICK-REFERENCE.md`

**Contents:**
- One-page API summary
- Quick payload examples
- Response format
- Common use cases (code snippets)
- Validation rules checklist
- Error codes table
- cURL examples

**Use this when:** You need a quick lookup for endpoints, payloads, or error codes.

---

### 3. **Flow Diagrams** (Visual)
**File:** `BRANCH-USER-ASSIGNMENT-FLOWCHART.md`

**Contents:**
- Assign branches flow
- Remove branch flow
- Get user branches flow
- Complete integration flow (new user setup)
- JWT staleness & refresh flow
- Security validation flow
- Error handling decision tree

**Use this when:** You need to understand the logic flow or explain the system to others visually.

---

### 4. **Code Examples** (Multi-Language)
**File:** `BRANCH-USER-ASSIGNMENT-CODE-EXAMPLES.md`

**Contents:**
- JavaScript/Node.js (Fetch API & Axios)
- React (custom hook)
- TypeScript (type-safe client)
- Python (requests library)
- PHP (cURL)
- Go (net/http)

**Use this when:** You need working code examples in your language/framework.

---

## 🚀 Quick Start

### Step 1: Understand the Endpoints

**Three main endpoints:**

1. **Assign branches** → `POST /api/v1/users/:userId/branches`
2. **Remove branch** → `DELETE /api/v1/users/:userId/branches/:branchId`
3. **Get user branches** → `GET /api/v1/users/:userId/branches`

### Step 2: Authenticate

All requests require JWT token:
```
Authorization: Bearer <your-jwt-token>
```

### Step 3: Make Your First Request

```bash
curl -X POST http://localhost:3000/api/v1/users/USER_ID/branches \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"branchIds":["BRANCH_ID_1","BRANCH_ID_2"]}'
```

### Step 4: Handle Response

```json
{
  "status": "success",
  "data": {
    "user": {
      "branch": [...],
      "refreshHint": true,
      "message": "Assigned 2 branch(es) to user"
    }
  }
}
```

If `refreshHint: true`, user should refresh their session (re-login or call `/me`).

---

## 📖 Reading Guide

### For Beginners
1. Start with **Quick Reference** for basic understanding
2. Review **Flow Diagrams** to visualize the process
3. Copy code from **Code Examples** for your language
4. Refer to **API Integration Guide** when you encounter issues

### For Experienced Developers
1. Scan **Quick Reference** for endpoint URLs and payloads
2. Jump to **Code Examples** for your tech stack
3. Use **API Integration Guide** as detailed reference when needed

### For System Architects
1. Study **Flow Diagrams** for architecture understanding
2. Review **API Integration Guide** security section
3. Use diagrams to communicate with team

---

## 🔑 Key Concepts

### 1. Merchant Isolation
All operations are **strictly scoped** to the authenticated user's merchant. Cross-merchant operations are blocked with 403 Forbidden.

### 2. Atomic Operations
- **$addToSet** prevents duplicate branches (atomic, safe)
- **$pull** removes branches (atomic, safe)
- No race conditions from concurrent requests

### 3. Minimum Branch Requirement
Users must **always have at least one branch**. Removing the last branch is blocked with 400 Bad Request.

### 4. JWT Staleness
After assignment/unassignment, the user's JWT token becomes **stale** because it contains the old branch array. Frontend must handle this by:
- Re-login (most secure)
- Silent refresh (better UX)
- Handling 401 gracefully on next request

---

## 🛠️ Implementation Checklist

### Backend Setup
- [x] Service implemented: `BranchUserAssignmentService.js`
- [x] Controller implemented: `BranchUserAssignmentController.js`
- [x] Routes registered: `users.routes.js`
- [x] Tests written: `branch-user-assignment.test.js`
- [x] Auto-assign on branch creation (MANAGER role)

### Frontend Integration
- [ ] API client wrapper created
- [ ] Error handling implemented
- [ ] JWT refresh handling implemented
- [ ] UI for branch assignment built
- [ ] Success/error notifications added

### Testing
- [ ] Unit tests for API client
- [ ] Integration tests for full flow
- [ ] E2E tests for UI
- [ ] Error scenarios tested

---

## 🔗 Related Features

### Auto-Assign (MANAGER Role)
When a MANAGER creates a new branch, they are **automatically assigned** to that branch. See:
- `BRANCH-AUTO-ASSIGN-DESIGN.md` - Design decisions
- `BRANCH-AUTO-ASSIGN-IMPLEMENTATION-SUMMARY.md` - Implementation details

### Multi-Branch User Access
JWT tokens include an array of all branches a user has access to. See:
- `tests/multi-branch-user-access.test.js` - Test examples
- `src/common/guards/auth.guard.js` - JWT validation logic

---

## 📊 API Endpoints Summary Table

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/v1/users/:userId/branches` | POST | Assign branch(es) | Yes |
| `/api/v1/users/:userId/branches/:branchId` | DELETE | Remove branch | Yes |
| `/api/v1/users/:userId/branches` | GET | Get user's branches | Yes |

---

## ❓ Common Questions

### Q: Can I assign a user to branches from different merchants?
**A:** No. All branches must belong to the same merchant as the authenticated user. Cross-merchant operations return 403 Forbidden.

### Q: What happens if I try to remove a user's last branch?
**A:** The request fails with 400 Bad Request. Users must always have at least one branch assigned.

### Q: Do I need to refresh the JWT after assigning branches?
**A:** Yes, if you modified the currently logged-in user's branches. The `refreshHint: true` flag signals this. Otherwise, the next API request will fail with 401 Unauthorized.

### Q: Can I assign the same branch twice?
**A:** Technically yes, but MongoDB's `$addToSet` operator prevents duplicates, so the second assignment is safely ignored.

### Q: What's the difference between manual assignment and auto-assign?
**A:** 
- **Manual assignment:** Admin explicitly assigns branches via API endpoints
- **Auto-assign:** When a MANAGER creates a new branch, they're automatically assigned to it

Both use the same underlying mechanism (`$addToSet` on the User model).

---

## 🐛 Troubleshooting

### Issue: 403 Forbidden on assignment
**Cause:** Target user belongs to a different merchant  
**Solution:** Verify both users share the same `merchant._id`

### Issue: 401 Unauthorized after successful assignment
**Cause:** JWT is stale (contains old branch array)  
**Solution:** Implement JWT refresh or re-login flow (see API Integration Guide)

### Issue: 400 "Cannot remove all branches"
**Cause:** Trying to remove user's last branch  
**Solution:** Ensure user has ≥2 branches before removing one

### Issue: 400 "Invalid branches"
**Cause:** Branch IDs don't exist or belong to different merchant  
**Solution:** Verify branch IDs with `GET /api/v1/branches` first

---

## 📞 Support

For issues, questions, or feature requests:
- **Backend Team:** Check service/controller code
- **Test Suite:** `tests/branch-user-assignment.test.js` has working examples
- **Design Decisions:** `BRANCH-AUTO-ASSIGN-DESIGN.md` explains rationale

---

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01-15 | Initial release with manual assignment endpoints |
| 1.1.0 | 2024-01-20 | Added auto-assign for MANAGER role on branch creation |
| 1.2.0 | 2024-01-25 | Enhanced error messages, added `refreshHint` flag |

---

## 📄 License

Internal documentation for TiruServe Restaurant Management System.
