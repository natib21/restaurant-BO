# Frontend Menu API Migration Guide

**Guide for updating frontend code to use the new standardized Menu API responses**

---

## 🚨 BREAKING CHANGE

**Phase C** introduced a standardized response format across all Menu domain endpoints. The most significant breaking change is in the `getAllMenu` endpoint.

---

## ⚠️ Critical Change: getAllMenu Response Key

### Endpoint: `GET /api/v1/menus`

#### Before (Old)
```javascript
// ❌ OLD - Response used singular 'menu' key
const response = await fetch('/api/v1/menus', {
  headers: { Authorization: `Bearer ${token}` }
});

const data = await response.json();
console.log(data.data.menu); // ❌ Singular 'menu'
```

**Old Response Shape:**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "menu": [...]  // ❌ Singular (inconsistent)
  }
}
```

#### After (New)
```javascript
// ✅ NEW - Response uses plural 'menus' key
const response = await fetch('/api/v1/menus', {
  headers: { Authorization: `Bearer ${token}` }
});

const data = await response.json();
console.log(data.data.menus); // ✅ Plural 'menus'
```

**New Response Shape:**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "menus": [...]  // ✅ Plural (consistent with other endpoints)
  }
}
```

---

## 🔧 Required Frontend Changes

### 1. JavaScript/TypeScript

#### Vanilla JavaScript
```javascript
// ❌ BEFORE
fetch('/api/v1/menus')
  .then(res => res.json())
  .then(data => {
    const menuItems = data.data.menu; // ❌ OLD
    renderMenuItems(menuItems);
  });

// ✅ AFTER
fetch('/api/v1/menus')
  .then(res => res.json())
  .then(data => {
    const menuItems = data.data.menus; // ✅ NEW
    renderMenuItems(menuItems);
  });
```

#### Async/Await
```javascript
// ❌ BEFORE
async function fetchMenuItems() {
  const response = await fetch('/api/v1/menus');
  const data = await response.json();
  return data.data.menu; // ❌ OLD
}

// ✅ AFTER
async function fetchMenuItems() {
  const response = await fetch('/api/v1/menus');
  const data = await response.json();
  return data.data.menus; // ✅ NEW
}
```

#### Destructuring
```javascript
// ❌ BEFORE
const { data: { menu } } = await response.json(); // ❌ OLD

// ✅ AFTER
const { data: { menus } } = await response.json(); // ✅ NEW
```

---

### 2. React

#### useState/useEffect
```jsx
// ❌ BEFORE
function MenuList() {
  const [menuItems, setMenuItems] = useState([]);
  
  useEffect(() => {
    fetch('/api/v1/menus')
      .then(res => res.json())
      .then(data => setMenuItems(data.data.menu)); // ❌ OLD
  }, []);
  
  return <div>{menuItems.map(...)}</div>;
}

// ✅ AFTER
function MenuList() {
  const [menuItems, setMenuItems] = useState([]);
  
  useEffect(() => {
    fetch('/api/v1/menus')
      .then(res => res.json())
      .then(data => setMenuItems(data.data.menus)); // ✅ NEW
  }, []);
  
  return <div>{menuItems.map(...)}</div>;
}
```

#### React Query
```jsx
// ❌ BEFORE
const { data } = useQuery('menus', async () => {
  const response = await fetch('/api/v1/menus');
  const json = await response.json();
  return json.data.menu; // ❌ OLD
});

// ✅ AFTER
const { data } = useQuery('menus', async () => {
  const response = await fetch('/api/v1/menus');
  const json = await response.json();
  return json.data.menus; // ✅ NEW
});
```

---

### 3. Vue.js

```vue
<!-- ❌ BEFORE -->
<script>
export default {
  data() {
    return {
      menuItems: []
    };
  },
  async mounted() {
    const response = await fetch('/api/v1/menus');
    const data = await response.json();
    this.menuItems = data.data.menu; // ❌ OLD
  }
}
</script>

<!-- ✅ AFTER -->
<script>
export default {
  data() {
    return {
      menuItems: []
    };
  },
  async mounted() {
    const response = await fetch('/api/v1/menus');
    const data = await response.json();
    this.menuItems = data.data.menus; // ✅ NEW
  }
}
</script>
```

---

### 4. Angular

```typescript
// ❌ BEFORE
@Component({ ... })
export class MenuListComponent implements OnInit {
  menuItems: MenuItem[] = [];
  
  ngOnInit() {
    this.http.get('/api/v1/menus').subscribe((response: any) => {
      this.menuItems = response.data.menu; // ❌ OLD
    });
  }
}

// ✅ AFTER
@Component({ ... })
export class MenuListComponent implements OnInit {
  menuItems: MenuItem[] = [];
  
  ngOnInit() {
    this.http.get('/api/v1/menus').subscribe((response: any) => {
      this.menuItems = response.data.menus; // ✅ NEW
    });
  }
}
```

---

### 5. Axios

```javascript
// ❌ BEFORE
axios.get('/api/v1/menus')
  .then(response => {
    const menuItems = response.data.data.menu; // ❌ OLD
    console.log(menuItems);
  });

// ✅ AFTER
axios.get('/api/v1/menus')
  .then(response => {
    const menuItems = response.data.data.menus; // ✅ NEW
    console.log(menuItems);
  });
```

---

## 🔍 Find & Replace Guide

### Search Your Codebase

**Search for:**
```regex
\.data\.menu(?!\w)
```

This will find:
- `data.data.menu`
- `response.data.menu`
- `json.data.menu`

**But NOT:**
- `data.data.menus` (already correct)
- `data.data.menuGroup` (different endpoint)

### Automated Find & Replace

**VS Code:**
1. Press `Ctrl+Shift+F` (Windows/Linux) or `Cmd+Shift+F` (Mac)
2. Search: `\.data\.menu(?!\w)`
3. Enable regex (click `.*` button)
4. Review each match manually
5. Replace only `getAllMenu` calls with `.data.menus`

**Grep (Linux/Mac):**
```bash
# Find all occurrences
grep -r "\.data\.menu[^a-zA-Z]" src/

# Review and manually update
```

---

## ✅ Other Endpoints (No Breaking Changes)

These endpoints already used correct plural forms:

### Menu Groups
```javascript
// ✅ Already correct (no change needed)
const response = await fetch('/api/v1/menu-groups');
const { data: { menuGroups } } = await response.json(); // ✅ Plural
```

### Combos
```javascript
// ✅ Already correct (no change needed)
const response = await fetch('/api/v1/combos');
const { data: { combos } } = await response.json(); // ✅ Plural
```

### Single Resource Endpoints
```javascript
// ✅ Already correct (no change needed)
const response = await fetch('/api/v1/menus/123');
const { data: { menu } } = await response.json(); // ✅ Singular (single item)
```

---

## 🎯 New Query Features

**Phase C also added powerful query features to all list endpoints:**

### Search
```javascript
// Search for menu items
const response = await fetch('/api/v1/menus?search=pizza');
const { data: { menus } } = await response.json();
```

### Filter
```javascript
// Filter by type and availability
const response = await fetch('/api/v1/menus?type=food&available=true');
const { data: { menus } } = await response.json();
```

### Sort
```javascript
// Sort by price (descending)
const response = await fetch('/api/v1/menus?sort=-price');
const { data: { menus } } = await response.json();
```

### Pagination
```javascript
// Get page 2 with 20 items per page
const response = await fetch('/api/v1/menus?page=2&limit=20');
const { data: { menus }, results } = await response.json();
console.log(`Showing ${results} items`);
```

### Combined Queries
```javascript
// Complex query: search + filter + sort + pagination
const url = '/api/v1/menus?search=burger&type=food&available=true&sort=price&page=1&limit=10';
const response = await fetch(url);
const { data: { menus }, results } = await response.json();
```

**See:** `MENU-API-QUERY-REFERENCE.md` for complete query documentation

---

## 📋 Testing Checklist

After updating your frontend code:

- [ ] Test `GET /api/v1/menus` endpoint
- [ ] Verify menu items render correctly
- [ ] Test search functionality
- [ ] Test filtering
- [ ] Test sorting
- [ ] Test pagination
- [ ] Test error handling (empty results)
- [ ] Check console for errors
- [ ] Verify no references to old `data.menu` key remain

---

## 🐛 Troubleshooting

### Issue: "Cannot read property 'map' of undefined"

**Cause:** Still using old `data.menu` key

**Solution:**
```javascript
// ❌ WRONG
const menuItems = data.data.menu; // undefined
menuItems.map(...) // Error!

// ✅ CORRECT
const menuItems = data.data.menus; // array
menuItems.map(...) // Works!
```

### Issue: Empty array instead of menu items

**Cause:** Accessing wrong key

**Solution:**
```javascript
console.log(data); // Inspect response
console.log(data.data.menus); // Should be array
console.log(data.data.menu); // undefined (old key)
```

### Issue: TypeScript errors

**Solution:** Update interface definitions
```typescript
// ❌ BEFORE
interface MenuResponse {
  status: string;
  results: number;
  data: {
    menu: MenuItem[]; // ❌ OLD
  };
}

// ✅ AFTER
interface MenuResponse {
  status: string;
  results: number;
  data: {
    menus: MenuItem[]; // ✅ NEW
  };
}
```

---

## 📊 Response Shape Reference

### List Endpoints
```typescript
interface ListResponse<T> {
  status: 'success';
  results: number;
  data: {
    [resourceKey: string]: T[]; // e.g., menus, menuGroups, combos
  };
}
```

### Single Resource Endpoints
```typescript
interface SingleResponse<T> {
  status: 'success';
  data: {
    [resourceKey: string]: T; // e.g., menu, menuGroup, combo
  };
}
```

### Action Endpoints
```typescript
interface ActionResponse<T> {
  status: 'success';
  message: string;
  data: {
    [resourceKey: string]: T;
  };
}
```

---

## 🔄 Migration Strategy

### Option 1: Immediate Update (Recommended)
1. Update all frontend code at once
2. Deploy new backend with Phase C changes
3. Deploy updated frontend
4. Test thoroughly

### Option 2: Gradual Migration
1. Create API wrapper to handle both formats:
```javascript
function normalizeMenuResponse(response) {
  // Handle both old and new formats during transition
  const data = response.data;
  return {
    ...data,
    data: {
      menus: data.data.menus || data.data.menu || []
    }
  };
}
```

2. Update API calls to use wrapper
3. Deploy backend changes
4. Remove wrapper after confirming everything works

---

## 📞 Support

If you encounter issues during migration:

1. Check backend logs for errors
2. Verify JWT token is valid
3. Test API directly with curl/Postman
4. Review `PHASE-C-VERIFICATION-PLAN.md` for test cases
5. Contact backend team if response format is incorrect

---

## 📚 Additional Documentation

- **Query Reference:** `MENU-API-QUERY-REFERENCE.md`
- **Complete Changes:** `PHASE-C-COMPLETE-ALL-ENDPOINTS-STANDARDIZED.md`
- **Testing Guide:** `PHASE-C-VERIFICATION-PLAN.md`
- **Summary:** `PHASE-C-FINAL-SUMMARY.md`

---

**Last Updated:** 2026-08-19  
**Phase:** C — Query Handling & Response Standardization  
**Version:** 1.0
