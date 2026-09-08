# Menu API Query Reference

**Quick reference guide for querying Menu domain endpoints**

---

## 📋 Endpoints with Query Support

All list endpoints support advanced query features:

1. `GET /api/v1/menus` — All menu items
2. `GET /api/v1/menu-groups` — All menu groups
3. `GET /api/v1/menu-groups/light` — Lightweight menu groups
4. `GET /api/v1/branch-menu-groups` — Branch menu groups
5. `GET /api/v1/combos` — All combos
6. `GET /api/v1/combos/active` — Active combos only

---

## 🔍 Query Parameters

### 1. Search (`?search=`)

**Case-insensitive regex search**

```bash
# Search menu items by name, description, or category
GET /api/v1/menus?search=pizza

# Search menu groups
GET /api/v1/menu-groups?search=breakfast

# Search combos
GET /api/v1/combos?search=deal
```

**Search Fields by Endpoint:**
- **Menus:** name, description, category
- **Menu Groups:** name, description
- **Combos:** name, description

**Example Response:**
```json
{
  "status": "success",
  "results": 2,
  "data": {
    "menus": [
      { "name": "Margherita Pizza", ... },
      { "name": "Pepperoni Pizza", ... }
    ]
  }
}
```

---

### 2. Filter (`?field=value`)

**Exact match filtering**

```bash
# Filter by single field
GET /api/v1/menus?type=food

# Filter by multiple fields
GET /api/v1/menus?type=food&available=true

# Filter by nested field
GET /api/v1/menus?image.isDeleted=false
```

**Range Operators:**
```bash
# Greater than or equal (gte)
GET /api/v1/menus?price[gte]=10

# Less than or equal (lte)
GET /api/v1/menus?price[lte]=50

# Combined range
GET /api/v1/menus?price[gte]=10&price[lte]=50

# Greater than (gt)
GET /api/v1/menus?popularity[gt]=100

# Less than (lt)
GET /api/v1/menus?stock[lt]=5
```

**Common Filters:**
- `type=food` or `type=drink`
- `available=true` or `available=false`
- `isActive=true` or `isActive=false`
- `category=appetizers`

---

### 3. Sort (`?sort=`)

**Sort results by field(s)**

```bash
# Sort ascending (A-Z, low to high)
GET /api/v1/menus?sort=name

# Sort descending (Z-A, high to low)
GET /api/v1/menus?sort=-price

# Multi-field sort (category first, then name)
GET /api/v1/menus?sort=category,name

# Descending multi-field
GET /api/v1/menus?sort=-createdAt,-price
```

**Common Sort Fields:**
- `name` — Alphabetical
- `price` — Price
- `createdAt` — Creation date
- `updatedAt` — Last modified
- `priority` — Custom priority
- `sold` — Number sold (combos)

**Default Sort:**
If no `?sort=` specified, results are sorted by `-createdAt` (newest first)

---

### 4. Field Selection (`?fields=`)

**Return only specific fields**

```bash
# Select specific fields
GET /api/v1/menus?fields=name,price,category

# Minimal response (name only)
GET /api/v1/menus?fields=name

# Multiple fields
GET /api/v1/combos?fields=name,description,price,isActive
```

**Notes:**
- `_id` is always included
- `__v` is always excluded
- Reduces response size
- Improves performance

**Example Response:**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "menus": [
      {
        "_id": "abc123",
        "name": "Pizza",
        "price": 12.99,
        "category": "food"
      },
      ...
    ]
  }
}
```

---

### 5. Pagination (`?page=`, `?limit=`)

**Control result page and size**

```bash
# First page, 10 items
GET /api/v1/menus?page=1&limit=10

# Second page, 10 items
GET /api/v1/menus?page=2&limit=10

# Large page size
GET /api/v1/menus?limit=50

# Just page (uses default limit=100)
GET /api/v1/menus?page=2
```

**Defaults:**
- `page=1` (first page)
- `limit=100` (max 100 items per page)

**Calculation:**
```
skip = (page - 1) × limit
```

**Example:**
- `page=1&limit=10` → Items 1-10
- `page=2&limit=10` → Items 11-20
- `page=3&limit=10` → Items 21-30

---

## 🎯 Combined Queries

**Mix multiple query parameters:**

```bash
# Search + Filter
GET /api/v1/menus?search=burger&type=food

# Search + Filter + Sort
GET /api/v1/menus?search=burger&type=food&sort=price

# Complete Query
GET /api/v1/menus?search=burger&type=food&available=true&sort=price&fields=name,price&page=1&limit=10
```

**Advanced Example:**
```bash
# Find available burgers between $10-$20, sorted by name, page 1
GET /api/v1/menus?search=burger&available=true&price[gte]=10&price[lte]=20&sort=name&page=1&limit=10
```

---

## 📊 Response Format

### List Responses

**All list endpoints return:**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "menus": [...]  // or menuGroups, combos
  }
}
```

**Fields:**
- `status` — Always "success"
- `results` — Number of items in current response
- `data` — Object with resource key
  - `menus` — Array of menu items
  - `menuGroups` — Array of menu groups
  - `combos` — Array of combos

---

## 🔒 Security Notes

### Merchant Isolation

**Automatic:** All queries are scoped to the authenticated user's merchant
```bash
# User from Merchant A
GET /api/v1/menus?search=pizza
# Returns only Merchant A's pizzas

# User from Merchant B
GET /api/v1/menus?search=pizza
# Returns only Merchant B's pizzas
```

**Cannot be overridden via query params** — Merchant scoping is enforced in the base query

### RBAC (Role-Based Access Control)

**SUPER_MERCHANT_ADMIN:**
- Can see items from all branches under their merchant
- Can filter by specific branch: `?branchId=xyz`

**Branch Users:**
- Automatically scoped to their assigned branch
- Cannot access other branches

---

## 🚀 Performance Tips

### 1. Use Field Selection
```bash
# Bad (returns everything)
GET /api/v1/menus

# Good (only what you need)
GET /api/v1/menus?fields=name,price
```

### 2. Use Pagination
```bash
# Bad (could return 1000s of items)
GET /api/v1/menus

# Good (controlled batch)
GET /api/v1/menus?page=1&limit=20
```

### 3. Combine Filters
```bash
# Bad (large result set)
GET /api/v1/menus?search=food

# Good (narrow scope)
GET /api/v1/menus?type=food&available=true&category=appetizers
```

---

## 📖 Examples by Use Case

### Use Case 1: Search Bar
```bash
# User types "chick" in search
GET /api/v1/menus?search=chick&fields=name,price,image

# Response: Chicken items with minimal fields
```

### Use Case 2: Menu List with Filters
```bash
# Show available food items, sorted by price
GET /api/v1/menus?type=food&available=true&sort=price&page=1&limit=20
```

### Use Case 3: Price Range Filter
```bash
# Show items between $5-$15
GET /api/v1/menus?price[gte]=5&price[lte]=15&sort=price
```

### Use Case 4: Category Navigation
```bash
# Show all appetizers
GET /api/v1/menus?category=appetizers&available=true&sort=name
```

### Use Case 5: Admin Dashboard
```bash
# Show recently created items
GET /api/v1/menus?sort=-createdAt&limit=10&fields=name,createdAt,price
```

### Use Case 6: Menu Groups
```bash
# Show visible menu groups with items
GET /api/v1/menu-groups?visibility=always&sort=priority
```

### Use Case 7: Active Combos
```bash
# Show all active combo deals
GET /api/v1/combos/active?sort=-sold
```

---

## ⚠️ Common Mistakes

### 1. Wrong Query Syntax
```bash
# ❌ Wrong
GET /api/v1/menus?price>=10

# ✅ Correct
GET /api/v1/menus?price[gte]=10
```

### 2. Forgetting URL Encoding
```bash
# ❌ Wrong (space)
GET /api/v1/menus?search=cheese burger

# ✅ Correct
GET /api/v1/menus?search=cheese%20burger
```

### 3. Using Unsupported Fields
```bash
# ❌ Wrong (field doesn't exist)
GET /api/v1/menus?invalidField=value

# ✅ Correct (use actual field names)
GET /api/v1/menus?type=food
```

### 4. Mixing Search with Same-Field Filter
```bash
# ⚠️ Be careful
GET /api/v1/menus?name=Pizza&search=burger
# Search and name filter might conflict
```

---

## 🛠️ Testing Examples (curl)

### Basic Request
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "http://localhost:3000/api/v1/menus"
```

### Search Query
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "http://localhost:3000/api/v1/menus?search=pizza"
```

### Complex Query
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "http://localhost:3000/api/v1/menus?search=burger&type=food&available=true&sort=price&page=1&limit=10"
```

---

## 📚 Additional Resources

- **Full API Documentation:** See `PHASE-C-COMPLETE-ALL-ENDPOINTS-STANDARDIZED.md`
- **Testing Guide:** See `PHASE-C-VERIFICATION-PLAN.md`
- **Implementation Details:** See `PHASE-C-FINAL-SUMMARY.md`

---

**Last Updated:** 2026-08-19  
**Phase:** C — Query Handling & Response Standardization
