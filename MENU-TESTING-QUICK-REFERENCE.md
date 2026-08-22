# Menu Module - Quick Testing Reference

**Use this guide to quickly test all endpoints manually**

---

## 🚀 Quick Start

### 1. Start Server
```bash
npm start
```

### 2. Get Auth Token
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email","password":"your-password"}'
```

Save the token: `export TOKEN="your-token-here"`

---

## 📝 Test All Endpoints

### MENU ITEMS (6 endpoints)

```bash
# 1. CREATE
curl -X POST http://localhost:3000/api/v1/menu \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":{"en":"Pizza"},"categoryId":"ID","price":15.99,"available":true}'

# 2. LIST ALL
curl http://localhost:3000/api/v1/menu \
  -H "Authorization: Bearer $TOKEN"

# 3. GET ONE
curl http://localhost:3000/api/v1/menu/ITEM_ID \
  -H "Authorization: Bearer $TOKEN"

# 4. UPDATE
curl -X PATCH http://localhost:3000/api/v1/menu/ITEM_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"price":17.99}'

# 5. DELETE
curl -X DELETE http://localhost:3000/api/v1/menu/ITEM_ID \
  -H "Authorization: Bearer $TOKEN"

# 6. TOGGLE AVAILABILITY
curl -X PATCH http://localhost:3000/api/v1/menu/ITEM_ID/toggle-availability \
  -H "Authorization: Bearer $TOKEN"
```

### MENU GROUPS (7 endpoints)

```bash
# 1. CREATE
curl -X POST http://localhost:3000/api/v1/menu-group \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":{"en":"Lunch"},"branches":["ID"],"items":[],"isActive":true}'

# 2. LIST ALL
curl http://localhost:3000/api/v1/menu-group \
  -H "Authorization: Bearer $TOKEN"

# 3. LIST LIGHT
curl http://localhost:3000/api/v1/menu-group/light \
  -H "Authorization: Bearer $TOKEN"

# 4. GET ONE
curl http://localhost:3000/api/v1/menu-group/GROUP_ID \
  -H "Authorization: Bearer $TOKEN"

# 5. UPDATE
curl -X PATCH http://localhost:3000/api/v1/menu-group/GROUP_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isActive":false}'

# 6. DELETE
curl -X DELETE http://localhost:3000/api/v1/menu-group/GROUP_ID \
  -H "Authorization: Bearer $TOKEN"

# 7. ADD ITEM
curl -X PATCH http://localhost:3000/api/v1/menu-group/GROUP_ID/add-item \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"menuItemId":"ITEM_ID","sortOrder":1}'
```

### COMBOS (7 endpoints)

```bash
# 1. CREATE
curl -X POST http://localhost:3000/api/v1/combo \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":{"en":"Deal"},"items":[{"menuItem":"ID","quantity":1,"nameFallback":"Item"}],"comboPrice":12,"isActive":true}'

# 2. LIST ALL
curl http://localhost:3000/api/v1/combo \
  -H "Authorization: Bearer $TOKEN"

# 3. LIST ACTIVE (PUBLIC)
curl http://localhost:3000/api/v1/combo/active

# 4. GET ONE
curl http://localhost:3000/api/v1/combo/COMBO_ID \
  -H "Authorization: Bearer $TOKEN"

# 5. UPDATE
curl -X PATCH http://localhost:3000/api/v1/combo/COMBO_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comboPrice":11}'

# 6. DELETE
curl -X DELETE http://localhost:3000/api/v1/combo/COMBO_ID \
  -H "Authorization: Bearer $TOKEN"

# 7. TOGGLE ACTIVE
curl -X PATCH http://localhost:3000/api/v1/combo/COMBO_ID/toggle-active \
  -H "Authorization: Bearer $TOKEN"
```

---

## ✅ Expected Responses

### Success (200/201)
```json
{
  "status": "success",
  "data": {
    "menu": { ... }
  }
}
```

### Error (400/404)
```json
{
  "status": "fail",
  "message": "Error description"
}
```

---

## 🎯 Quick Checklist

```
Menu Items:
□ Create    □ List    □ Get One
□ Update    □ Delete  □ Toggle

Menu Groups:
□ Create    □ List    □ List Light
□ Get One   □ Update  □ Delete
□ Add Item

Combos:
□ Create    □ List    □ Active
□ Get One   □ Update  □ Delete
□ Toggle
```

**Total: 20 endpoints to test**

---

## 🔍 What to Check

For each endpoint, verify:
- ✅ Returns 200/201 status code
- ✅ Returns correct JSON structure
- ✅ Data is saved in database
- ✅ Multi-tenant isolation works
- ✅ Soft-delete works (deletedAt field)
- ✅ Localization works (en/am fields)

---

## 🐛 Common Issues

**401 Unauthorized:**
→ Token expired or invalid. Login again.

**400 Bad Request:**
→ Check request body format.

**404 Not Found:**
→ Check ID exists and belongs to your merchant.

**500 Internal Server Error:**
→ Check server logs for details.

---

**All 20 endpoints tested?** ✅ You're done!

