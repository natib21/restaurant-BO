# Frontend Menu System - Complete Integration Guide

**Complete guide for integrating with the Restaurant Management Platform Menu System**

**Last Updated:** August 22, 2026  
**Version:** 2.0  
**Target Audience:** Frontend Developers

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Menu Items API](#menu-items-api)
4. [Menu Groups API](#menu-groups-api)
5. [Combos API](#combos-api)
6. [Menu Publication & Versioning](#menu-publication--versioning)
7. [Query Features](#query-features)
8. [Complete Workflows](#complete-workflows)
9. [Error Handling](#error-handling)
10. [Code Examples](#code-examples)
11. [Best Practices](#best-practices)

---

## 🎯 Overview

The Menu System consists of four main components:

```
┌─────────────────────────────────────────────────────────────┐
│                      MENU SYSTEM                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   │
│  │ MENU ITEMS   │   │ MENU GROUPS  │   │   COMBOS     │   │
│  │              │   │              │   │              │   │
│  │ Individual   │──▶│ Collections  │   │ Bundle deals │   │
│  │ food/drink   │   │ + scheduling │   │ with items   │   │
│  └──────────────┘   └──────────────┘   └──────────────┘   │
│         │                   │                   │           │
│         └───────────────────┴───────────────────┘           │
│                             │                               │
│                             ▼                               │
│                  ┌──────────────────────┐                   │
│                  │   PUBLICATION        │                   │
│                  │   (Versioning)       │                   │
│                  │                      │                   │
│                  │   Branch-specific    │                   │
│                  │   Published menus    │                   │
│                  └──────────────────────┘                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Concepts

- **Menu Items**: Individual food/drink items with pricing, images, variants
- **Menu Groups**: Collections of items with scheduling (breakfast, lunch, dinner)
- **Combos**: Bundle deals combining multiple items at discounted prices
- **Publications**: Versioned snapshots of published menus per branch

---

## 🔐 Authentication

All API requests (except public endpoints) require JWT authentication.

### Getting Authentication Token

```javascript
// Login to get JWT token
const response = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const { token } = await response.json();
localStorage.setItem('authToken', token);
```

### Using Token in Requests

```javascript
const token = localStorage.getItem('authToken');

const response = await fetch('/api/v1/menus', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Public Endpoints (No Auth Required)

```javascript
// Public menu (for customers via QR code/table session)
GET /api/v1/menus/public
GET /api/v1/menus/public/food
GET /api/v1/menus/public/beverages
GET /api/v1/combos/active
```

---

## 🍕 Menu Items API

### Endpoints Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/menus` | Staff | Get all menu items (with queries) |
| GET | `/api/v1/menus/:id` | Staff | Get single menu item |
| POST | `/api/v1/menus` | Staff | Create new menu item |
| PATCH | `/api/v1/menus/:id` | Staff | Update menu item |
| DELETE | `/api/v1/menus/:id` | Staff | Delete menu item |
| GET | `/api/v1/menus/staff` | Staff | Staff view (all items) |
| GET | `/api/v1/menus/public` | Public | Customer view (available items) |
| GET | `/api/v1/menus/public/food` | Public | Food items only |
| GET | `/api/v1/menus/public/beverages` | Public | Beverages only |
| PATCH | `/api/v1/menus/:id/toggle-availability` | Staff | Toggle available status |
| PATCH | `/api/v1/menus/:id/archive` | Admin | Archive menu item |

---

### Menu Item Data Structure

```javascript
{
  "_id": "menu-item-id",
  "name": "Margherita Pizza",
  "description": "Classic Italian pizza with fresh mozzarella",
  "type": "food",              // "food" or "drink"
  "category": "Pizza",
  "price": 12.99,
  "available": true,           // Customer can see and order
  "inStock": true,
  "publishStatus": "published", // "draft", "published", "archived"
  "image": "fileasset-id",     // Reference to image
  "variants": [
    {
      "name": "Small",
      "price": 9.99,
      "calories": 800
    },
    {
      "name": "Large", 
      "price": 14.99,
      "calories": 1200
    }
  ],
  "recipe": {
    "ingredients": [
      {
        "ingredient": "ingredient-id",
        "quantity": 0.3,
        "unit": "kg"
      }
    ]
  },
  "allergens": ["gluten", "dairy"],
  "tags": ["vegetarian", "popular"],
  "preparationTime": 15,       // minutes
  "spiceLevel": 2,             // 0-5
  "isVegetarian": true,
  "isVegan": false,
  "calories": 850,
  "merchant": "merchant-id",
  "branch": "branch-id",
  "createdAt": "2026-08-22T10:00:00Z",
  "updatedAt": "2026-08-22T10:00:00Z"
}
```

---

### GET All Menu Items

**Request:**
```javascript
const response = await fetch('/api/v1/menus', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
```

**Response:**
```json
{
  "status": "success",
  "results": 25,
  "data": {
    "menus": [
      {
        "_id": "menu-id-1",
        "name": "Margherita Pizza",
        "price": 12.99,
        "available": true,
        "publishStatus": "published",
        ...
      },
      ...
    ]
  }
}
```

**⚠️ IMPORTANT:** Response key is **`menus`** (plural), not `menu`

---

### GET Single Menu Item

**Request:**
```javascript
const menuId = 'menu-item-id';
const response = await fetch(`/api/v1/menus/${menuId}`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "menu": {
      "_id": "menu-item-id",
      "name": "Margherita Pizza",
      "price": 12.99,
      ...
    }
  }
}
```

---

### CREATE Menu Item

**Request:**
```javascript
const formData = new FormData();
formData.append('name', 'New Pizza');
formData.append('description', 'Delicious pizza');
formData.append('type', 'food');
formData.append('category', 'Pizza');
formData.append('price', 15.99);
formData.append('available', true);

// Add image (optional)
formData.append('image', fileInput.files[0]);

// Add variants (JSON string)
formData.append('variants', JSON.stringify([
  { name: 'Small', price: 12.99 },
  { name: 'Large', price: 17.99 }
]));

// Add tags (JSON string)
formData.append('tags', JSON.stringify(['popular', 'vegetarian']));

const response = await fetch('/api/v1/menus', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const data = await response.json();
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "menu": {
      "_id": "new-menu-id",
      "name": "New Pizza",
      "price": 15.99,
      "publishStatus": "published",
      ...
    }
  }
}
```

**Notes:**
- Use `multipart/form-data` for file upload
- JSON fields must be stringified: `variants`, `tags`, `allergens`, `ingredients`
- Default `publishStatus` is `"published"` if not specified

---

### UPDATE Menu Item

**Request:**
```javascript
const menuId = 'menu-item-id';
const formData = new FormData();
formData.append('name', 'Updated Pizza Name');
formData.append('price', 13.99);

// Optional: update image
formData.append('image', newFileInput.files[0]);

const response = await fetch(`/api/v1/menus/${menuId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const data = await response.json();
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "menu": {
      "_id": "menu-item-id",
      "name": "Updated Pizza Name",
      "price": 13.99,
      ...
    }
  }
}
```

---

### DELETE Menu Item

**Request:**
```javascript
const menuId = 'menu-item-id';
const response = await fetch(`/api/v1/menus/${menuId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
```

**Response:**
```json
{
  "status": "success",
  "data": null
}
```

---

### Toggle Availability

**Request:**
```javascript
const menuId = 'menu-item-id';
const response = await fetch(`/api/v1/menus/${menuId}/toggle-availability`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "menu": {
      "_id": "menu-item-id",
      "available": false,  // Toggled
      ...
    }
  }
}
```

---

### Archive Menu Item

**Request:**
```javascript
const menuId = 'menu-item-id';
const response = await fetch(`/api/v1/menus/${menuId}/archive`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
```

**Response:**
```json
{
  "status": "success",
  "message": "Menu item archived successfully",
  "data": {
    "menu": {
      "_id": "menu-item-id",
      "publishStatus": "archived",
      "available": false,
      ...
    }
  }
}
```

---

## 📂 Menu Groups API

Menu Groups organize items into collections with scheduling capabilities (breakfast, lunch, dinner, etc.)

### Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/menu-groups` | Get all menu groups |
| GET | `/api/v1/menu-groups/light` | Get lightweight list (no items) |
| GET | `/api/v1/menu-groups/:id` | Get single menu group |
| POST | `/api/v1/menu-groups` | Create menu group |
| PATCH | `/api/v1/menu-groups/:id` | Update menu group |
| DELETE | `/api/v1/menu-groups/:id` | Delete menu group |
| PATCH | `/api/v1/menu-groups/:id/add-item` | Add item to group |
| PATCH | `/api/v1/menu-groups/:id/remove-item` | Remove item from group |
| PATCH | `/api/v1/menu-groups/:id/reorder` | Reorder items in group |

---

### Menu Group Data Structure

```javascript
{
  "_id": "menu-group-id",
  "name": "Breakfast Menu",
  "description": "Available from 7am to 11am",
  "visibility": "scheduled",     // "always", "scheduled", "hidden"
  "priority": 1,                  // Display order
  "activeDays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "blockedDays": ["saturday", "sunday"],
  "timeSlots": [
    {
      "start": "07:00",
      "end": "11:00"
    }
  ],
  "items": [
    {
      "menu": "menu-item-id",     // Reference to Menu item
      "sortOrder": 1,
      "overridePrice": 8.99,      // Optional price override
      "customName": "Morning Special Pancakes",  // Optional name override
      "isHidden": false
    },
    ...
  ],
  "merchant": "merchant-id",
  "branch": "branch-id",
  "createdAt": "2026-08-22T10:00:00Z"
}
```

---

### GET All Menu Groups

**Request:**
```javascript
const response = await fetch('/api/v1/menu-groups', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
```

**Response:**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "menuGroups": [
      {
        "_id": "group-id-1",
        "name": "Breakfast Menu",
        "visibility": "scheduled",
        "items": [
          {
            "menu": {
              "_id": "menu-id-1",
              "name": "Pancakes",
              "price": 9.99,
              ...
            },
            "sortOrder": 1,
            "overridePrice": 8.99
          },
          ...
        ],
        ...
      },
      ...
    ]
  }
}
```

---

### GET Menu Groups (Lightweight)

For dropdown lists or navigation, use lightweight endpoint without populated items:

**Request:**
```javascript
const response = await fetch('/api/v1/menu-groups/light', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

**Response:**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "menuGroups": [
      {
        "_id": "group-id-1",
        "name": "Breakfast Menu",
        "visibility": "always",
        "priority": 1
      },
      ...
    ]
  }
}
```

---

### CREATE Menu Group

**Request:**
```javascript
const response = await fetch('/api/v1/menu-groups', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Lunch Menu',
    description: 'Available from 11am to 3pm',
    visibility: 'scheduled',
    priority: 2,
    activeDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    timeSlots: [
      {
        start: '11:00',
        end: '15:00'
      }
    ]
  })
});

const data = await response.json();
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "menuGroup": {
      "_id": "new-group-id",
      "name": "Lunch Menu",
      "visibility": "scheduled",
      "items": [],
      ...
    }
  }
}
```

---

### Add Item to Menu Group

**Request:**
```javascript
const groupId = 'menu-group-id';
const response = await fetch(`/api/v1/menu-groups/${groupId}/add-item`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    menuItemId: 'menu-item-id',
    sortOrder: 1,
    overridePrice: 11.99,        // Optional
    customName: 'Special Burger'  // Optional
  })
});

const data = await response.json();
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "menuGroup": {
      "_id": "menu-group-id",
      "items": [
        {
          "menu": "menu-item-id",
          "sortOrder": 1,
          "overridePrice": 11.99,
          "customName": "Special Burger",
          "isHidden": false
        },
        ...
      ],
      ...
    }
  }
}
```

---

### Remove Item from Menu Group

**Request:**
```javascript
const groupId = 'menu-group-id';
const response = await fetch(`/api/v1/menu-groups/${groupId}/remove-item`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    menuItemId: 'menu-item-id'
  })
});

const data = await response.json();
```

---

### Reorder Items in Menu Group

**Request:**
```javascript
const groupId = 'menu-group-id';
const response = await fetch(`/api/v1/menu-groups/${groupId}/reorder`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    items: [
      { menuItemId: 'item-1', sortOrder: 1 },
      { menuItemId: 'item-2', sortOrder: 2 },
      { menuItemId: 'item-3', sortOrder: 3 }
    ]
  })
});

const data = await response.json();
```

---

## 🎁 Combos API

Combos are bundle deals combining multiple menu items at discounted prices.

### Endpoints Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/combos` | Staff | Get all combos |
| GET | `/api/v1/combos/active` | Public | Get active combos (customers) |
| GET | `/api/v1/combos/:id` | Staff | Get single combo |
| POST | `/api/v1/combos` | Staff | Create combo |
| PATCH | `/api/v1/combos/:id` | Staff | Update combo |
| DELETE | `/api/v1/combos/:id` | Staff | Delete combo |
| PATCH | `/api/v1/combos/:id/toggle-active` | Staff | Toggle active status |
| PATCH | `/api/v1/combos/:comboId/branch-toggle` | Staff | Toggle for specific branch |
| PATCH | `/api/v1/combos/:comboId/branch-override` | Staff | Override price for branch |

---

### Combo Data Structure

```javascript
{
  "_id": "combo-id",
  "name": "Family Meal Deal",
  "description": "2 Pizzas + 4 Drinks",
  "price": 29.99,               // Bundle price (discounted)
  "originalPrice": 45.00,       // Sum of individual items
  "savings": 15.01,             // Calculated discount
  "isActive": true,
  "image": "fileasset-id",
  "items": [
    {
      "menu": "pizza-id",
      "quantity": 2,
      "name": "Large Pizza"       // Cached for display
    },
    {
      "menu": "drink-id",
      "quantity": 4,
      "name": "Soft Drink"
    }
  ],
  "branchSpecific": [
    {
      "branch": "branch-id-1",
      "isActive": true,
      "overridePrice": 27.99
    }
  ],
  "sold": 150,                   // Number of times sold
  "validFrom": "2026-08-01T00:00:00Z",
  "validUntil": "2026-08-31T23:59:59Z",
  "merchant": "merchant-id",
  "createdAt": "2026-08-22T10:00:00Z"
}
```

---

### GET Active Combos (Public)

**Request:**
```javascript
// No authentication required - for customers
const response = await fetch('/api/v1/combos/active');
const data = await response.json();
```

**Response:**
```json
{
  "status": "success",
  "results": 3,
  "data": {
    "combos": [
      {
        "_id": "combo-id-1",
        "name": "Lunch Deal",
        "price": 12.99,
        "originalPrice": 18.00,
        "savings": 5.01,
        "isActive": true,
        "items": [...]
      },
      ...
    ]
  }
}
```

---

### CREATE Combo

**Request:**
```javascript
const formData = new FormData();
formData.append('name', 'Family Meal Deal');
formData.append('description', '2 Pizzas + 4 Drinks');
formData.append('price', 29.99);
formData.append('isActive', true);

// Add image
formData.append('image', fileInput.files[0]);

// Add items (JSON string)
formData.append('items', JSON.stringify([
  { menu: 'pizza-id', quantity: 2 },
  { menu: 'drink-id', quantity: 4 }
]));

// Optional validity period
formData.append('validFrom', '2026-08-01');
formData.append('validUntil', '2026-08-31');

const response = await fetch('/api/v1/combos', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const data = await response.json();
```

---

### Toggle Combo Active Status

**Request:**
```javascript
const comboId = 'combo-id';
const response = await fetch(`/api/v1/combos/${comboId}/toggle-active`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
```

---

### Branch-Specific Combo Override

**Request:**
```javascript
const comboId = 'combo-id';
const response = await fetch(`/api/v1/combos/${comboId}/branch-override`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    branchId: 'branch-id',
    overridePrice: 27.99
  })
});

const data = await response.json();
```

---

## 📚 Menu Publication & Versioning

Menu Publication creates versioned snapshots of menu groups when published to branches.

### Why Use Publications?

1. **Version Control**: Track menu changes over time
2. **Order History**: Prove what prices were when order was placed
3. **Branch-Specific Menus**: Different branches can have different menu versions
4. **Audit Trail**: Know who published what and when
5. **Rollback**: Revert to previous versions if needed
6. **Recipe Validation**: Ensure all items have recipes before publishing

---

### Publication Data Structure

```javascript
{
  "_id": "publication-id",
  "merchant": "merchant-id",
  "branch": "branch-id",
  "menuGroup": "menu-group-id",
  "version": 3,                   // Auto-incremented per branch+menuGroup
  "status": "published",          // or "archived"
  "publishedBy": "user-id",
  "publishedAt": "2026-08-22T10:00:00Z",
  "snapshot": {
    "menuGroup": {
      "name": "Breakfast Menu",
      "visibility": "scheduled",
      ...
    },
    "items": [...],               // Menu group items config
    "menus": [...]                // Full menu item data at publish time
  },
  "recipeValidation": {
    "passed": true,
    "missingRecipes": []
  },
  "publishState": "complete",     // "pending", "complete", "incomplete"
  "createdAt": "2026-08-22T10:00:00Z"
}
```

---

### Publish Menu Group to Branch

**Request:**
```javascript
const response = await fetch('/api/v1/menus/publish', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    menuGroupId: 'menu-group-id',
    branchId: 'branch-id'
  })
});

const data = await response.json();
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "publication": {
      "_id": "publication-id",
      "version": 3,
      "publishedAt": "2026-08-22T10:00:00Z",
      "snapshot": {...},
      "recipeValidation": {
        "passed": true,
        "missingRecipes": []
      }
    }
  }
}
```

**Validation Errors:**
```json
{
  "status": "error",
  "message": "Cannot publish menu group: some items are missing recipes",
  "data": {
    "missingRecipes": [
      { "menuItemId": "item-1", "name": "Pizza Margherita" }
    ]
  }
}
```

---

### Get Branch Publications

**Request:**
```javascript
const branchId = 'branch-id';
const response = await fetch(`/api/v1/menus/publications/branch/${branchId}`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
```

**Response:**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "publications": [
      {
        "_id": "pub-1",
        "version": 5,
        "publishedAt": "2026-08-22T10:00:00Z",
        "menuGroup": {
          "name": "Breakfast Menu"
        },
        ...
      },
      ...
    ]
  }
}
```

---

## 🔍 Query Features

All list endpoints support powerful query features for search, filter, sort, and pagination.

### Search

**Case-insensitive search across multiple fields:**

```javascript
// Search menu items
const response = await fetch(
  '/api/v1/menus?search=pizza',
  { headers: { 'Authorization': `Bearer ${token}` } }
);

// Search combos
const response = await fetch(
  '/api/v1/combos?search=deal',
  { headers: { 'Authorization': `Bearer ${token}` } }
);
```

**Search Fields:**
- **Menus**: name, description, category
- **Menu Groups**: name, description
- **Combos**: name, description

---

### Filter

**Exact match filtering:**

```javascript
// Single filter
const response = await fetch(
  '/api/v1/menus?type=food',
  { headers: { 'Authorization': `Bearer ${token}` } }
);

// Multiple filters
const response = await fetch(
  '/api/v1/menus?type=food&available=true&category=Pizza',
  { headers: { 'Authorization': `Bearer ${token}` } }
);
```

**Range Filters:**

```javascript
// Price range: $10 - $50
const response = await fetch(
  '/api/v1/menus?price[gte]=10&price[lte]=50',
  { headers: { 'Authorization': `Bearer ${token}` } }
);

// Greater than
'/api/v1/combos?sold[gt]=100'

// Less than
'/api/v1/menus?calories[lt]=500'
```

**Common Filters:**
- `type=food` or `type=drink`
- `available=true` or `available=false`
- `publishStatus=published` or `publishStatus=draft`
- `isActive=true` (for combos)
- `category=Pizza`

---

### Sort

**Sort by field(s):**

```javascript
// Sort ascending (A-Z, low to high)
const response = await fetch(
  '/api/v1/menus?sort=name',
  { headers: { 'Authorization': `Bearer ${token}` } }
);

// Sort descending (Z-A, high to low)
const response = await fetch(
  '/api/v1/menus?sort=-price',
  { headers: { 'Authorization': `Bearer ${token}` } }
);

// Multi-field sort
const response = await fetch(
  '/api/v1/menus?sort=category,name',
  { headers: { 'Authorization': `Bearer ${token}` } }
);
```

**Common Sort Fields:**
- `name` — Alphabetical
- `price` — Price
- `createdAt` — Creation date
- `updatedAt` — Last modified
- `priority` — Custom priority (menu groups)
- `sold` — Number sold (combos)

**Default:** Results sorted by `-createdAt` (newest first)

---

### Field Selection

**Return only specific fields:**

```javascript
// Select specific fields
const response = await fetch(
  '/api/v1/menus?fields=name,price,category',
  { headers: { 'Authorization': `Bearer ${token}` } }
);
```

**Response:**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "menus": [
      {
        "_id": "menu-id-1",
        "name": "Pizza",
        "price": 12.99,
        "category": "food"
      },
      ...
    ]
  }
}
```

**Benefits:**
- Reduces response size
- Improves performance
- Reduces bandwidth usage

---

### Pagination

**Control result pages:**

```javascript
// Page 1, 10 items per page
const response = await fetch(
  '/api/v1/menus?page=1&limit=10',
  { headers: { 'Authorization': `Bearer ${token}` } }
);

// Page 2
const response = await fetch(
  '/api/v1/menus?page=2&limit=10',
  { headers: { 'Authorization': `Bearer ${token}` } }
);
```

**Defaults:**
- `page=1` (first page)
- `limit=100` (max 100 items per page)

---

### Combined Queries

**Mix multiple query parameters:**

```javascript
// Complex query: search + filter + sort + pagination
const url = '/api/v1/menus?' + new URLSearchParams({
  search: 'burger',
  type: 'food',
  available: true,
  'price[gte]': 10,
  'price[lte]': 20,
  sort: 'price',
  fields: 'name,price,image',
  page: 1,
  limit: 10
});

const response = await fetch(url, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## 🔄 Complete Workflows

### Workflow 1: Display Public Menu (Customer View)

```javascript
// Step 1: Get active combos (no auth required)
const combosRes = await fetch('/api/v1/combos/active');
const { data: { combos } } = await combosRes.json();

// Step 2: Get public menu (with table session token)
const menuRes = await fetch('/api/v1/menus/public', {
  headers: {
    'Authorization': `Bearer ${tableSessionToken}`
  }
});
const { data: { menuGroups } } = await menuRes.json();

// Step 3: Display menu groups and combos
menuGroups.forEach(group => {
  console.log(`${group.name}:`);
  group.items.forEach(item => {
    if (!item.isHidden) {
      const price = item.overridePrice || item.menu.price;
      const name = item.customName || item.menu.name;
      console.log(`  - ${name}: $${price}`);
    }
  });
});

combos.forEach(combo => {
  console.log(`${combo.name}: $${combo.price} (Save $${combo.savings})`);
});
```

---

### Workflow 2: Create Menu Item and Add to Group

```javascript
// Step 1: Create menu item
const formData = new FormData();
formData.append('name', 'Caesar Salad');
formData.append('description', 'Fresh romaine lettuce with Caesar dressing');
formData.append('type', 'food');
formData.append('category', 'Salads');
formData.append('price', 8.99);
formData.append('available', true);
formData.append('image', imageFile);

const createRes = await fetch('/api/v1/menus', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

const { data: { menu } } = await createRes.json();
const menuItemId = menu._id;

// Step 2: Add to menu group
const groupId = 'lunch-menu-group-id';
const addRes = await fetch(`/api/v1/menu-groups/${groupId}/add-item`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    menuItemId: menuItemId,
    sortOrder: 5
  })
});

const { data: { menuGroup } } = await addRes.json();
console.log(`Item added to ${menuGroup.name}`);
```

---

### Workflow 3: Publish Menu to Branch

```javascript
// Step 1: Validate menu group has all recipes (optional check)
const groupId = 'menu-group-id';
const groupRes = await fetch(`/api/v1/menu-groups/${groupId}`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: { menuGroup } } = await groupRes.json();

// Check if all items have recipes (frontend validation)
const itemsWithoutRecipes = menuGroup.items.filter(item => {
  return !item.menu.recipe || !item.menu.recipe.ingredients || 
         item.menu.recipe.ingredients.length === 0;
});

if (itemsWithoutRecipes.length > 0) {
  console.error('Some items missing recipes:', itemsWithoutRecipes);
  // Show error to user
  return;
}

// Step 2: Publish to branch
const branchId = 'branch-id';
const publishRes = await fetch('/api/v1/menus/publish', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    menuGroupId: groupId,
    branchId: branchId
  })
});

if (publishRes.ok) {
  const { data: { publication } } = await publishRes.json();
  console.log(`Published version ${publication.version}`);
} else {
  const error = await publishRes.json();
  console.error('Publish failed:', error.message);
  // Show error with missing recipes to user
}
```

---

### Workflow 4: Search and Filter Menu

```javascript
// Step 1: Build query parameters
const filters = {
  search: searchInput.value,           // User search term
  type: selectedType,                   // 'food' or 'drink'
  available: true,
  'price[gte]': minPrice,
  'price[lte]': maxPrice,
  sort: sortBy,                         // 'name', '-price', etc.
  page: currentPage,
  limit: 20
};

// Step 2: Build URL
const queryString = new URLSearchParams(
  Object.entries(filters).filter(([_, v]) => v != null)
).toString();

const url = `/api/v1/menus?${queryString}`;

// Step 3: Fetch results
const response = await fetch(url, {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: { menus }, results } = await response.json();

// Step 4: Display results
console.log(`Found ${results} items`);
menus.forEach(menu => {
  console.log(`${menu.name}: $${menu.price}`);
});
```

---

### Workflow 5: Create Combo Deal

```javascript
// Step 1: Select menu items for combo
const selectedItems = [
  { menuId: 'burger-id', quantity: 1 },
  { menuId: 'fries-id', quantity: 1 },
  { menuId: 'drink-id', quantity: 1 }
];

// Step 2: Calculate prices
const itemsRes = await fetch('/api/v1/menus?fields=name,price', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: { menus } } = await itemsRes.json();

let originalTotal = 0;
selectedItems.forEach(({ menuId, quantity }) => {
  const item = menus.find(m => m._id === menuId);
  originalTotal += item.price * quantity;
});

const comboPrice = 12.99;
const savings = originalTotal - comboPrice;

// Step 3: Create combo
const formData = new FormData();
formData.append('name', 'Burger Combo');
formData.append('description', 'Burger + Fries + Drink');
formData.append('price', comboPrice);
formData.append('isActive', true);
formData.append('image', comboImageFile);
formData.append('items', JSON.stringify(
  selectedItems.map(item => ({
    menu: item.menuId,
    quantity: item.quantity
  }))
));

const createRes = await fetch('/api/v1/combos', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

const { data: { combo } } = await createRes.json();
console.log(`Combo created: Save $${combo.savings.toFixed(2)}`);
```

---

## ❌ Error Handling

### Standard Error Response

```json
{
  "status": "error",
  "message": "Human-readable error message",
  "error": {
    "statusCode": 400,
    "isOperational": true
  }
}
```

---

### Common Error Codes

| Status Code | Meaning | Common Causes |
|-------------|---------|---------------|
| 400 | Bad Request | Invalid data, missing required fields |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate entry, constraint violation |
| 422 | Unprocessable Entity | Validation failed |
| 500 | Server Error | Internal server issue |

---

### Error Handling Pattern

```javascript
async function fetchMenus() {
  try {
    const response = await fetch('/api/v1/menus', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      
      // Handle specific errors
      if (response.status === 401) {
        // Token expired or invalid - redirect to login
        redirectToLogin();
        return;
      }
      
      if (response.status === 403) {
        // No permission - show error message
        showError('You do not have permission to view menus');
        return;
      }
      
      if (response.status === 404) {
        showError('Menu not found');
        return;
      }
      
      // Generic error
      showError(error.message || 'Something went wrong');
      return;
    }

    const data = await response.json();
    return data.data.menus;
    
  } catch (err) {
    // Network error or JSON parse error
    console.error('Failed to fetch menus:', err);
    showError('Network error. Please check your connection.');
  }
}
```

---

### Validation Errors

```json
{
  "status": "error",
  "message": "Validation failed",
  "errors": [
    {
      "field": "name",
      "message": "Name is required"
    },
    {
      "field": "price",
      "message": "Price must be greater than 0"
    }
  ]
}
```

**Handling:**

```javascript
if (error.errors && Array.isArray(error.errors)) {
  error.errors.forEach(err => {
    // Show field-specific error
    showFieldError(err.field, err.message);
  });
} else {
  // Show general error
  showError(error.message);
}
```

---

## 💻 Code Examples

### React Example: Menu List Component

```jsx
import React, { useState, useEffect } from 'react';

function MenuList() {
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [type, setType] = useState('all');

  useEffect(() => {
    fetchMenus();
  }, [searchTerm, type]);

  async function fetchMenus() {
    try {
      setLoading(true);
      setError(null);

      // Build query
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (type !== 'all') params.append('type', type);
      params.append('sort', 'name');
      params.append('limit', 20);

      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `/api/v1/menus?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch menus');
      }

      const data = await response.json();
      setMenus(data.data.menus);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="menu-list">
      {/* Search and filters */}
      <div className="filters">
        <input
          type="text"
          placeholder="Search menus..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All Types</option>
          <option value="food">Food</option>
          <option value="drink">Drinks</option>
        </select>
      </div>

      {/* Menu items */}
      <div className="menu-grid">
        {menus.map(menu => (
          <div key={menu._id} className="menu-card">
            {menu.image && (
              <img src={`/api/files/${menu.image}`} alt={menu.name} />
            )}
            <h3>{menu.name}</h3>
            <p>{menu.description}</p>
            <p className="price">${menu.price.toFixed(2)}</p>
            <span className={`badge ${menu.available ? 'available' : 'unavailable'}`}>
              {menu.available ? 'Available' : 'Unavailable'}
            </span>
          </div>
        ))}
      </div>

      {menus.length === 0 && (
        <div className="no-results">No menus found</div>
      )}
    </div>
  );
}

export default MenuList;
```

---

### React Example: Create Menu Item Form

```jsx
import React, { useState } from 'react';

function CreateMenuForm({ onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'food',
    category: '',
    price: '',
    available: true
  });
  const [imageFile, setImageFile] = useState(null);
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  }

  function handleImageChange(e) {
    setImageFile(e.target.files[0]);
  }

  function addVariant() {
    setVariants(prev => [...prev, { name: '', price: '' }]);
  }

  function updateVariant(index, field, value) {
    setVariants(prev => {
      const updated = [...prev];
      updated[index][field] = value;
      return updated;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);

      // Build form data
      const data = new FormData();
      Object.keys(formData).forEach(key => {
        data.append(key, formData[key]);
      });

      if (imageFile) {
        data.append('image', imageFile);
      }

      if (variants.length > 0) {
        data.append('variants', JSON.stringify(variants));
      }

      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/v1/menus', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: data
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const result = await response.json();
      onSuccess(result.data.menu);
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        type: 'food',
        category: '',
        price: '',
        available: true
      });
      setImageFile(null);
      setVariants([]);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="create-menu-form">
      <h2>Create Menu Item</h2>

      {error && <div className="error">{error}</div>}

      <div className="form-group">
        <label>Name *</label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
        />
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
        />
      </div>

      <div className="form-group">
        <label>Type *</label>
        <select name="type" value={formData.type} onChange={handleChange}>
          <option value="food">Food</option>
          <option value="drink">Drink</option>
        </select>
      </div>

      <div className="form-group">
        <label>Category *</label>
        <input
          type="text"
          name="category"
          value={formData.category}
          onChange={handleChange}
          required
        />
      </div>

      <div className="form-group">
        <label>Price *</label>
        <input
          type="number"
          name="price"
          value={formData.price}
          onChange={handleChange}
          step="0.01"
          min="0"
          required
        />
      </div>

      <div className="form-group">
        <label>Image</label>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageChange}
        />
      </div>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            name="available"
            checked={formData.available}
            onChange={handleChange}
          />
          Available
        </label>
      </div>

      {/* Variants */}
      <div className="variants-section">
        <h3>Variants</h3>
        {variants.map((variant, index) => (
          <div key={index} className="variant-row">
            <input
              type="text"
              placeholder="Variant name (e.g., Small)"
              value={variant.name}
              onChange={(e) => updateVariant(index, 'name', e.target.value)}
            />
            <input
              type="number"
              placeholder="Price"
              value={variant.price}
              onChange={(e) => updateVariant(index, 'price', e.target.value)}
              step="0.01"
              min="0"
            />
          </div>
        ))}
        <button type="button" onClick={addVariant}>
          Add Variant
        </button>
      </div>

      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Menu Item'}
      </button>
    </form>
  );
}

export default CreateMenuForm;
```

---

### Vue.js Example: Menu Display

```vue
<template>
  <div class="menu-display">
    <!-- Loading state -->
    <div v-if="loading" class="loading">Loading...</div>

    <!-- Error state -->
    <div v-if="error" class="error">{{ error }}</div>

    <!-- Menu groups -->
    <div v-if="!loading && !error" class="menu-groups">
      <div
        v-for="group in menuGroups"
        :key="group._id"
        class="menu-group"
      >
        <h2>{{ group.name }}</h2>
        <p class="description">{{ group.description }}</p>

        <!-- Menu items in group -->
        <div class="menu-items">
          <div
            v-for="item in group.items"
            :key="item._id"
            class="menu-item"
            v-show="!item.isHidden"
          >
            <img
              v-if="item.menu.image"
              :src="`/api/files/${item.menu.image}`"
              :alt="displayName(item)"
            />
            <div class="item-details">
              <h3>{{ displayName(item) }}</h3>
              <p>{{ item.menu.description }}</p>
              <p class="price">${{ displayPrice(item) }}</p>
              
              <!-- Variants -->
              <div v-if="item.menu.variants && item.menu.variants.length" class="variants">
                <span
                  v-for="variant in item.menu.variants"
                  :key="variant.name"
                  class="variant"
                >
                  {{ variant.name }}: ${{ variant.price.toFixed(2) }}
                </span>
              </div>

              <button
                @click="addToCart(item)"
                :disabled="!item.menu.available"
              >
                {{ item.menu.available ? 'Add to Cart' : 'Unavailable' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'MenuDisplay',
  
  data() {
    return {
      menuGroups: [],
      loading: true,
      error: null
    };
  },

  mounted() {
    this.fetchMenu();
  },

  methods: {
    async fetchMenu() {
      try {
        this.loading = true;
        this.error = null;

        const response = await fetch('/api/v1/menus/public', {
          headers: {
            'Authorization': `Bearer ${this.tableSessionToken}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to load menu');
        }

        const data = await response.json();
        this.menuGroups = data.data.menuGroups || [];
        
      } catch (err) {
        this.error = err.message;
      } finally {
        this.loading = false;
      }
    },

    displayName(item) {
      return item.customName || item.menu.name;
    },

    displayPrice(item) {
      const price = item.overridePrice || item.menu.price;
      return price.toFixed(2);
    },

    addToCart(item) {
      // Emit event to parent component
      this.$emit('add-to-cart', {
        menuItemId: item.menu._id,
        name: this.displayName(item),
        price: item.overridePrice || item.menu.price,
        quantity: 1
      });
    }
  }
};
</script>
```

---

### Angular Example: Menu Service

```typescript
// menu.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface MenuItem {
  _id: string;
  name: string;
  description: string;
  type: 'food' | 'drink';
  category: string;
  price: number;
  available: boolean;
  publishStatus: string;
  image?: string;
  variants?: Array<{ name: string; price: number }>;
}

export interface MenuResponse {
  status: string;
  results: number;
  data: {
    menus: MenuItem[];
  };
}

@Injectable({
  providedIn: 'root'
})
export class MenuService {
  private baseUrl = '/api/v1/menus';

  constructor(private http: HttpClient) {}

  getMenus(filters?: {
    search?: string;
    type?: string;
    available?: boolean;
    sort?: string;
    page?: number;
    limit?: number;
  }): Observable<MenuItem[]> {
    let params = new HttpParams();

    if (filters) {
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value !== undefined && value !== null) {
          params = params.append(key, value.toString());
        }
      });
    }

    return this.http
      .get<MenuResponse>(this.baseUrl, { params })
      .pipe(map(response => response.data.menus));
  }

  getMenu(id: string): Observable<MenuItem> {
    return this.http
      .get<{ status: string; data: { menu: MenuItem } }>(`${this.baseUrl}/${id}`)
      .pipe(map(response => response.data.menu));
  }

  createMenu(menuData: FormData): Observable<MenuItem> {
    return this.http
      .post<{ status: string; data: { menu: MenuItem } }>(this.baseUrl, menuData)
      .pipe(map(response => response.data.menu));
  }

  updateMenu(id: string, menuData: FormData): Observable<MenuItem> {
    return this.http
      .patch<{ status: string; data: { menu: MenuItem } }>(`${this.baseUrl}/${id}`, menuData)
      .pipe(map(response => response.data.menu));
  }

  deleteMenu(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  toggleAvailability(id: string): Observable<MenuItem> {
    return this.http
      .patch<{ status: string; data: { menu: MenuItem } }>(`${this.baseUrl}/${id}/toggle-availability`, {})
      .pipe(map(response => response.data.menu));
  }

  archiveMenu(id: string): Observable<MenuItem> {
    return this.http
      .patch<{ status: string; data: { menu: MenuItem } }>(`${this.baseUrl}/${id}/archive`, {})
      .pipe(map(response => response.data.menu));
  }
}
```

---

## 🎯 Best Practices

### 1. Authentication

```javascript
// ✅ Good: Store token securely
const token = localStorage.getItem('authToken');

// ✅ Good: Handle token expiration
if (response.status === 401) {
  localStorage.removeItem('authToken');
  redirectToLogin();
}

// ❌ Bad: Storing token in cookies without httpOnly flag
document.cookie = `token=${token}`;
```

---

### 2. Error Handling

```javascript
// ✅ Good: Specific error handling
try {
  const response = await fetch('/api/v1/menus');
  if (!response.ok) {
    const error = await response.json();
    handleError(response.status, error.message);
  }
} catch (err) {
  handleNetworkError(err);
}

// ❌ Bad: Silent failures
try {
  await fetch('/api/v1/menus');
} catch (err) {
  // Do nothing
}
```

---

### 3. Query Building

```javascript
// ✅ Good: Use URLSearchParams
const params = new URLSearchParams({
  search: searchTerm,
  type: 'food',
  sort: '-price'
});
const url = `/api/v1/menus?${params.toString()}`;

// ❌ Bad: Manual string concatenation
const url = `/api/v1/menus?search=${searchTerm}&type=food&sort=-price`;
```

---

### 4. Loading States

```javascript
// ✅ Good: Show loading indicators
const [loading, setLoading] = useState(false);

async function fetchData() {
  setLoading(true);
  try {
    const data = await fetch(...);
    // Process data
  } finally {
    setLoading(false);
  }
}

// Show loading UI
if (loading) return <Spinner />;

// ❌ Bad: No loading feedback
async function fetchData() {
  const data = await fetch(...);
}
```

---

### 5. Image Handling

```javascript
// ✅ Good: Check image exists before displaying
{menu.image && (
  <img src={`/api/files/${menu.image}`} alt={menu.name} />
)}

// ✅ Good: Provide fallback image
<img
  src={menu.image ? `/api/files/${menu.image}` : '/default-food.jpg'}
  alt={menu.name}
  onError={(e) => { e.target.src = '/default-food.jpg'; }}
/>

// ❌ Bad: No error handling
<img src={`/api/files/${menu.image}`} />
```

---

### 6. Form Data

```javascript
// ✅ Good: Proper FormData with multipart/form-data
const formData = new FormData();
formData.append('name', 'Pizza');
formData.append('price', 12.99);
formData.append('variants', JSON.stringify(variants));
formData.append('image', fileInput.files[0]);

await fetch('/api/v1/menus', {
  method: 'POST',
  body: formData  // No Content-Type header needed
});

// ❌ Bad: Trying to send file as JSON
await fetch('/api/v1/menus', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Pizza', image: fileInput.files[0] })
});
```

---

### 7. Response Key Usage

```javascript
// ✅ Good: Use correct response keys
const { data: { menus } } = await response.json();  // List endpoint (plural)
const { data: { menu } } = await response.json();   // Single endpoint (singular)

// ❌ Bad: Using old/wrong keys
const { data: { menu } } = await response.json();   // Wrong for list endpoint
```

---

### 8. Caching Strategy

```javascript
// ✅ Good: Cache menu data appropriately
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cachedMenus = null;
let lastFetch = 0;

async function getMenus() {
  const now = Date.now();
  if (cachedMenus && (now - lastFetch) < CACHE_DURATION) {
    return cachedMenus;
  }

  const response = await fetch('/api/v1/menus');
  const data = await response.json();
  cachedMenus = data.data.menus;
  lastFetch = now;
  return cachedMenus;
}

// Invalidate cache on create/update/delete
async function createMenu(data) {
  const response = await fetch('/api/v1/menus', { method: 'POST', body: data });
  cachedMenus = null;  // Invalidate cache
  return response;
}
```

---

### 9. Pagination

```javascript
// ✅ Good: Handle pagination properly
const [page, setPage] = useState(1);
const [hasMore, setHasMore] = useState(true);
const limit = 20;

async function loadMore() {
  const response = await fetch(`/api/v1/menus?page=${page + 1}&limit=${limit}`);
  const { data: { menus }, results } = await response.json();
  
  setMenus(prev => [...prev, ...menus]);
  setPage(page + 1);
  setHasMore(results === limit);  // If less than limit, no more pages
}

// ❌ Bad: Load all data at once
const response = await fetch('/api/v1/menus');  // Could return thousands
```

---

### 10. TypeScript Interfaces

```typescript
// ✅ Good: Define proper types
interface MenuItem {
  _id: string;
  name: string;
  description?: string;
  type: 'food' | 'drink';
  category: string;
  price: number;
  available: boolean;
  publishStatus: 'draft' | 'published' | 'archived';
  image?: string;
  variants?: MenuVariant[];
  // ... other fields
}

interface MenuVariant {
  name: string;
  price: number;
  calories?: number;
}

interface ApiResponse<T> {
  status: 'success' | 'error';
  data: T;
  message?: string;
}

// Usage
async function getMenus(): Promise<MenuItem[]> {
  const response = await fetch('/api/v1/menus');
  const data: ApiResponse<{ menus: MenuItem[] }> = await response.json();
  return data.data.menus;
}
```

---

## 📚 Additional Resources

- **API Migration Guide**: `FRONTEND-MENU-API-MIGRATION-GUIDE.md`
- **Query Reference**: `MENU-API-QUERY-REFERENCE.md`
- **Workflow Guide**: `MENU-MANAGEMENT-WORKFLOW-GUIDE.md`
- **Testing Guide**: `PHASE-C-VERIFICATION-PLAN.md`

---

## 🔄 Changelog

### Version 2.0 (August 22, 2026)
- Created comprehensive integration guide
- Added complete API reference for Menu Items, Menu Groups, Combos, Publications
- Added query features documentation
- Added 5 complete workflow examples
- Added error handling patterns
- Added code examples for React, Vue.js, Angular
- Added best practices section

---

**Questions or Issues?**
Contact the backend team or refer to the additional documentation files listed above.
