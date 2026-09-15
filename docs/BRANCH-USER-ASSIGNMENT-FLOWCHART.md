# Branch-User Assignment Flow Diagrams

## 1. Assign Branches Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    POST /api/v1/users/:userId/branches              │
│                                                                      │
│  Payload: { branchId } or { branchIds: [...] }                     │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │  Validate JWT Token        │
         │  Extract merchant context  │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │  Find target user by ID    │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │  User exists?              │
         └────────────┬───────────────┘
                      │
            ┌─────────┴─────────┐
            │                   │
           YES                 NO
            │                   │
            ▼                   ▼
   ┌────────────────┐    ┌──────────────────┐
   │ User.merchant  │    │  404 Not Found   │
   │ == req.merchant│    └──────────────────┘
   └────────┬───────┘
            │
   ┌────────┴─────────┐
   │                  │
  YES                NO
   │                  │
   ▼                  ▼
┌──────────────┐  ┌─────────────────────┐
│ Validate all │  │ 403 Forbidden       │
│ branchIds    │  │ "Different merchant"│
└──────┬───────┘  └─────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ All branches exist?      │
│ All belong to merchant?  │
└──────┬───────────────────┘
       │
   ┌───┴────┐
   │        │
  YES      NO
   │        │
   ▼        ▼
┌──────┐  ┌────────────────────┐
│ Run  │  │ 400 Bad Request    │
│ $add │  │ "Invalid branches" │
│ ToSet│  └────────────────────┘
└──┬───┘
   │
   ▼
┌─────────────────────────────────┐
│ User.findByIdAndUpdate(         │
│   userId,                        │
│   { $addToSet: {                │
│       branch: { $each: ids }    │
│   }},                            │
│   { new: true }                 │
│ )                               │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Populate branches               │
│ Add refreshHint: true           │
│ Add success message             │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ 200 OK                          │
│ {                               │
│   user: { ... },                │
│   refreshHint: true,            │
│   message: "Assigned X branches"│
│ }                               │
└─────────────────────────────────┘
```

---

## 2. Remove Branch Flow

```
┌──────────────────────────────────────────────────────────────────┐
│        DELETE /api/v1/users/:userId/branches/:branchId           │
└─────────────────────┬────────────────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │  Validate JWT Token        │
         │  Extract merchant context  │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │  Find target user by ID    │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │  User exists?              │
         │  Same merchant?            │
         └────────────┬───────────────┘
                      │
            ┌─────────┴─────────┐
            │                   │
           YES                 NO
            │                   │
            ▼                   ▼
   ┌────────────────┐    ┌──────────────────┐
   │ Find branch    │    │  404/403 Error   │
   │ Validate       │    └──────────────────┘
   └────────┬───────┘
            │
            ▼
   ┌────────────────────────────┐
   │ Calculate remaining        │
   │ branches after removal     │
   └────────┬───────────────────┘
            │
            ▼
   ┌────────────────────────────┐
   │ remaining.length > 0?      │
   └────────┬───────────────────┘
            │
   ┌────────┴─────────┐
   │                  │
  YES                NO
   │                  │
   ▼                  ▼
┌──────────┐  ┌─────────────────────────┐
│ Run $pull│  │ 400 Bad Request         │
│          │  │ "Cannot remove all      │
│          │  │  branches from user"    │
└────┬─────┘  └─────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│ User.findByIdAndUpdate(         │
│   userId,                        │
│   { $pull: {                    │
│       branch: { $in: [id] }     │
│   }},                            │
│   { new: true }                 │
│ )                               │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Populate branches               │
│ Add refreshHint: true           │
│ Add success message             │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ 200 OK                          │
│ {                               │
│   user: { ... },                │
│   refreshHint: true,            │
│   message: "Removed 1 branch"   │
│ }                               │
└─────────────────────────────────┘
```

---

## 3. Get User Branches Flow

```
┌──────────────────────────────────────────────────────────┐
│          GET /api/v1/users/:userId/branches              │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │  Validate JWT Token        │
         │  Extract merchant context  │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │  Find user + populate      │
         │  branch references         │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │  User exists?              │
         │  Same merchant?            │
         └────────────┬───────────────┘
                      │
            ┌─────────┴─────────┐
            │                   │
           YES                 NO
            │                   │
            ▼                   ▼
┌─────────────────────┐  ┌──────────────────┐
│ Return user info +  │  │  404/403 Error   │
│ branches array +    │  └──────────────────┘
│ totalBranches count │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────────────────┐
│ 200 OK                          │
│ {                               │
│   firstName,                    │
│   lastName,                     │
│   branches: [...],              │
│   totalBranches: N              │
│ }                               │
└─────────────────────────────────┘
```

---

## 4. Complete Integration Flow (New User Setup)

```
┌──────────────────────────────────────────────────────────────────┐
│                    Admin Creates New Staff User                   │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
            ┌────────────────────────────┐
            │ POST /api/v1/merchants/    │
            │      users                 │
            │                            │
            │ Payload:                   │
            │ - firstName, lastName      │
            │ - phone, email             │
            │ - password                 │
            │ - roleId                   │
            └────────────┬───────────────┘
                         │
                         ▼
            ┌────────────────────────────┐
            │ User Created Successfully  │
            │ Returns: userId            │
            │ branch: [] (empty)         │
            └────────────┬───────────────┘
                         │
                         ▼
            ┌────────────────────────────┐
            │ POST /api/v1/users/        │
            │      {userId}/branches     │
            │                            │
            │ Payload:                   │
            │ { branchIds: [...] }       │
            └────────────┬───────────────┘
                         │
                         ▼
            ┌────────────────────────────┐
            │ Branches Assigned          │
            │ Returns:                   │
            │ - user.branch populated    │
            │ - refreshHint: true        │
            └────────────┬───────────────┘
                         │
                         ▼
            ┌────────────────────────────┐
            │ (Optional) Send            │
            │ onboarding email to user   │
            │ with login instructions    │
            └────────────┬───────────────┘
                         │
                         ▼
            ┌────────────────────────────┐
            │ User logs in               │
            │ JWT includes branches      │
            │ in token payload           │
            └────────────────────────────┘
```

---

## 5. JWT Staleness & Refresh Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              User's Branch Array Changed                         │
│         (via assign/unassign endpoint)                          │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ Response includes:         │
        │ refreshHint: true          │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ Frontend checks:           │
        │ Is modified user ==        │
        │ currently logged-in user?  │
        └────────────┬───────────────┘
                     │
        ┌────────────┴─────────────┐
        │                          │
       YES                        NO
        │                          │
        ▼                          ▼
┌───────────────────┐    ┌─────────────────┐
│ Token is STALE    │    │ No action needed│
│ (contains old     │    │ (modified a     │
│  branch array)    │    │  different user)│
└────────┬──────────┘    └─────────────────┘
         │
         │
         ▼
┌────────────────────────────────────────┐
│  Frontend Chooses Refresh Strategy:    │
└────────┬───────────────────────────────┘
         │
    ┌────┴────────────────┐
    │                     │
    ▼                     ▼
┌─────────────┐    ┌──────────────────┐
│ Option 1:   │    │ Option 2:        │
│ Force       │    │ Silent Refresh   │
│ Re-login    │    │ (Call /me)       │
└──────┬──────┘    └────────┬─────────┘
       │                    │
       ▼                    ▼
┌─────────────┐    ┌──────────────────┐
│ logout()    │    │ GET /api/v1/     │
│ redirect to │    │     auth/me      │
│ login page  │    └────────┬─────────┘
└─────────────┘             │
                            ▼
                   ┌──────────────────┐
                   │ Returns new token│
                   │ with updated     │
                   │ branch array     │
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │ Update stored    │
                   │ token & user ctx │
                   └──────────────────┘
```

---

## 6. Security Validation Flow

```
┌─────────────────────────────────────────────────────────────┐
│              Every Branch Assignment Request                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ 1. JWT Authentication      │
        │    Extract user context    │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ 2. Merchant Isolation      │
        │    target.merchant ==      │
        │    req.user.merchant?      │
        └────────────┬───────────────┘
                     │
            ┌────────┴─────────┐
            │                  │
           YES                NO → 403 Forbidden
            │
            ▼
        ┌────────────────────────────┐
        │ 3. Branch Ownership        │
        │    All branches belong     │
        │    to same merchant?       │
        └────────────┬───────────────┘
                     │
            ┌────────┴─────────┐
            │                  │
           YES                NO → 400 Bad Request
            │
            ▼
        ┌────────────────────────────┐
        │ 4. Minimum Branch Check    │
        │    (DELETE only)           │
        │    User will have ≥1       │
        │    branch after removal?   │
        └────────────┬───────────────┘
                     │
            ┌────────┴─────────┐
            │                  │
           YES                NO → 400 Bad Request
            │
            ▼
        ┌────────────────────────────┐
        │ 5. Execute Operation       │
        │    (Atomic $addToSet/$pull)│
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ 6. Return Success          │
        │    + refreshHint flag      │
        └────────────────────────────┘
```

---

## 7. Error Handling Decision Tree

```
                    ┌───────────────┐
                    │ API Request   │
                    └───────┬───────┘
                            │
                ┌───────────┴─────────────┐
                │                         │
                ▼                         ▼
        ┌───────────────┐        ┌──────────────┐
        │ JWT Present?  │        │ 401 Unauth   │
        └───────┬───────┘        └──────────────┘
                │
        ┌───────┴────────┐
        │                │
       YES              NO → 401 Unauthorized
        │
        ▼
┌─────────────────┐
│ User Exists?    │
└────────┬────────┘
         │
    ┌────┴─────┐
    │          │
   YES        NO → 404 Not Found
    │
    ▼
┌─────────────────────┐
│ Same Merchant?      │
└────────┬────────────┘
         │
    ┌────┴─────┐
    │          │
   YES        NO → 403 Forbidden
    │
    ▼
┌──────────────────────┐
│ Branches Valid?      │
└────────┬─────────────┘
         │
    ┌────┴─────┐
    │          │
   YES        NO → 400 Bad Request
    │
    ▼
┌──────────────────────────┐
│ Operation: DELETE?       │
└────────┬─────────────────┘
         │
    ┌────┴──────┐
    │           │
   YES         NO → Proceed
    │           │
    ▼           │
┌──────────────┐│
│ Would remove ││
│ last branch? ││
└────────┬─────┘│
         │      │
    ┌────┴──┐   │
    │       │   │
   YES     NO   │
    │       │   │
    ▼       └───┘
┌─────────────┐│
│ 400 Bad Req ││
│ "Cannot     ││
│  remove all ││
│  branches"  ││
└─────────────┘│
                ▼
        ┌───────────────┐
        │ 200 Success   │
        └───────────────┘
```

---

## Symbols Key

```
┌──────┐
│ Box  │  = Process/Action
└──────┘

   ▼      = Flow direction

  YES/NO  = Decision branches

┌─────────┐
│ Rounded │ = Terminal (Start/End/Error)
│  Box    │
└─────────┘
```
