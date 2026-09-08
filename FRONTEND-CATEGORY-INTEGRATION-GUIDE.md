# Frontend Integration Guide: Category Management Module

## Overview
This guide helps frontend developers integrate the new dynamic Category Management system. Categories are now managed via API (not hardcoded), support multilingual names (English, Amharic), and include soft delete, search, and filtering capabilities.

---

## 📋 Table of Contents
1. [API Endpoints](#api-endpoints)
2. [Category Data Structure](#category-data-structure)
3. [Integration Steps](#integration-steps)
4. [Common Use Cases](#common-use-cases)
5. [Menu Integration](#menu-integration)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)

---

## 🌐 API Endpoints

### Base URL
```
/api/v1/categories
```

### Authentication
All endpoints require JWT token in Authorization header:
```javascript
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

### Available Endpoints

#### 1. Create Category
```http
POST /api/v1/categories
```

**Request Body:**
```json
{
  "name": {
    "en": "Appetizers",
    "am": "ክዳነ ምግብ"
  },
  "description": "Starters and small dishes",
  "displayOrder": 1,
  "icon": "🥗",
  "isActive": true
}
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "category": {
      "id": "507f1f77bcf86cd799439011",
      "merchant": "507f191e810c19729de860ea",
      "name": {
        "en": "Appetizers",
        "am": "ክዳነ ምግብ"
      },
      "description": "Starters and small dishes",
      "displayOrder": 1,
      "icon": "🥗",
      "isActive": true,
      "isDeleted": false,
      "createdBy": "507f191e810c19729de860eb",
      "createdAt": "2026-08-19T10:00:00.000Z",
      "updatedAt": "2026-08-19T10:00:00.000Z"
    }
  }
}
```

#### 2. Get All Categories (with filtering)
```http
GET /api/v1/categories?page=1&limit=10&sort=displayOrder
```

**Query Parameters:**
- `page` (number): Page number for pagination (default: 1)
- `limit` (number): Items per page (default: 10)
- `sort` (string): Sort field, prefix with `-` for descending (e.g., `-createdAt`)
- `search` (string): Search in category names (English/Amharic)
- `isActive` (boolean): Filter by active status
- `fields` (string): Select specific fields (e.g., `name,description`)

**Response (200):**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "categories": [
      {
        "id": "507f1f77bcf86cd799439011",
        "name": {
          "en": "Appetizers",
          "am": "ክዳነ ምግብ"
        },
        "description": "Starters and small dishes",
        "displayOrder": 1,
        "icon": "🥗",
        "isActive": true
      }
    ]
  }
}
```

#### 3. Get Active Categories Only
```http
GET /api/v1/categories/active
```

**Response (200):**
```json
{
  "status": "success",
  "results": 3,
  "data": {
    "categories": [...]
  }
}
```

#### 4. Get Single Category
```http
GET /api/v1/categories/:id
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "category": {
      "id": "507f1f77bcf86cd799439011",
      "name": {
        "en": "Appetizers",
        "am": "ክዳነ ምግብ"
      },
      "description": "Starters and small dishes",
      "displayOrder": 1,
      "icon": "🥗",
      "isActive": true,
      "createdAt": "2026-08-19T10:00:00.000Z"
    }
  }
}
```

#### 5. Update Category
```http
PATCH /api/v1/categories/:id
```

**Request Body (partial update):**
```json
{
  "name": {
    "en": "Main Courses",
    "am": "ዋና ምግብ"
  },
  "displayOrder": 2
}
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "category": {
      "id": "507f1f77bcf86cd799439011",
      "name": {
        "en": "Main Courses",
        "am": "ዋና ምግብ"
      },
      "displayOrder": 2,
      "updatedAt": "2026-08-19T11:00:00.000Z"
    }
  }
}
```

#### 6. Delete Category (Soft Delete)
```http
DELETE /api/v1/categories/:id
```

**Response (204):**
```
No Content
```

**Note:** Returns 400 if category is used by menu items.

#### 7. Restore Deleted Category
```http
PATCH /api/v1/categories/:id/restore
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "category": {
      "id": "507f1f77bcf86cd799439011",
      "isDeleted": false,
      "isActive": true
    }
  }
}
```

---

## 📦 Category Data Structure

### TypeScript Interface
```typescript
interface LocalizedText {
  en: string;    // English (required)
  am?: string;   // Amharic (optional)
}

interface Category {
  id: string;
  merchant: string;
  name: LocalizedText;
  description?: string;
  displayOrder: number;
  icon?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Validation Rules
- **name.en**: Required, 2-50 characters, unique per merchant (case-insensitive)
- **name.am**: Optional, 2-50 characters
- **description**: Optional, max 200 characters
- **displayOrder**: Number, default 0
- **icon**: Optional, single emoji or string
- **isActive**: Boolean, default true

---

## 🔧 Integration Steps

### Step 1: Fetch Categories for Dropdown

```javascript
// React Example
import { useState, useEffect } from 'react';

const CategorySelect = ({ value, onChange }) => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/v1/categories/active', {
          headers: {
            'Authorization': `Bearer ${token}`,
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch categories');
        }
        
        const data = await response.json();
        setCategories(data.data.categories);
      } catch (err) {
        setError(err.message);
        console.error('Error fetching categories:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  if (loading) return <div>Loading categories...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select Category</option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.icon} {category.name.en}
        </option>
      ))}
    </select>
  );
};
```

### Step 2: Create Category Form

```javascript
const CreateCategoryForm = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    name: { en: '', am: '' },
    description: '',
    displayOrder: 0,
    icon: '',
    isActive: true
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/v1/categories', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const data = await response.json();
      onSuccess(data.data.category);
    } catch (err) {
      console.error('Error creating category:', err);
      alert(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Name (English)*</label>
        <input
          type="text"
          required
          value={formData.name.en}
          onChange={(e) => setFormData({
            ...formData,
            name: { ...formData.name, en: e.target.value }
          })}
        />
      </div>

      <div>
        <label>Name (Amharic)</label>
        <input
          type="text"
          value={formData.name.am}
          onChange={(e) => setFormData({
            ...formData,
            name: { ...formData.name, am: e.target.value }
          })}
        />
      </div>

      <div>
        <label>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({
            ...formData,
            description: e.target.value
          })}
        />
      </div>

      <div>
        <label>Icon (Emoji)</label>
        <input
          type="text"
          placeholder="🍕"
          value={formData.icon}
          onChange={(e) => setFormData({
            ...formData,
            icon: e.target.value
          })}
        />
      </div>

      <div>
        <label>Display Order</label>
        <input
          type="number"
          value={formData.displayOrder}
          onChange={(e) => setFormData({
            ...formData,
            displayOrder: parseInt(e.target.value)
          })}
        />
      </div>

      <div>
        <label>
          <input
            type="checkbox"
            checked={formData.isActive}
            onChange={(e) => setFormData({
              ...formData,
              isActive: e.target.checked
            })}
          />
          Active
        </label>
      </div>

      <button type="submit">Create Category</button>
    </form>
  );
};
```

### Step 3: Category List with Actions

```javascript
const CategoryList = () => {
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const fetchCategories = async () => {
    const query = new URLSearchParams({
      page: page.toString(),
      limit: '10',
      sort: 'displayOrder',
      ...(search && { search })
    });

    const response = await fetch(`/api/v1/categories?${query}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
    setCategories(data.data.categories);
  };

  useEffect(() => {
    fetchCategories();
  }, [page, search]);

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this category?')) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/categories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        fetchCategories(); // Refresh list
      } else {
        const error = await response.json();
        alert(error.message);
      }
    } catch (err) {
      console.error('Error deleting category:', err);
    }
  };

  return (
    <div>
      <input
        type="text"
        placeholder="Search categories..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <table>
        <thead>
          <tr>
            <th>Icon</th>
            <th>Name</th>
            <th>Order</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id}>
              <td>{category.icon}</td>
              <td>{category.name.en}</td>
              <td>{category.displayOrder}</td>
              <td>
                <span className={category.isActive ? 'active' : 'inactive'}>
                  {category.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <button onClick={() => handleEdit(category.id)}>Edit</button>
                <button onClick={() => handleDelete(category.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <button onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</button>
        <span>Page {page}</span>
        <button onClick={() => setPage(p => p + 1)}>Next</button>
      </div>
    </div>
  );
};
```

---

## 🍽️ Menu Integration

### Creating Menu Item with Category

When creating/updating menu items, use `categoryId` instead of the old `category` string field:

```javascript
const createMenuItem = async (menuData) => {
  const payload = {
    name: 'Margherita Pizza',
    description: 'Classic pizza with tomato and mozzarella',
    type: 'food',
    categoryId: '507f1f77bcf86cd799439011', // ✅ Use category ID
    // category: 'Pizza', // ❌ Deprecated - do not use
    variants: [
      { name: 'Small', price: 12.99, isDefault: true },
      { name: 'Large', price: 18.99 }
    ],
    // ... other fields
  };

  const response = await fetch('/api/v1/menu', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return response.json();
};
```

### Displaying Menu by Category

```javascript
const MenuByCategory = () => {
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);

  useEffect(() => {
    // Fetch categories and menu items
    Promise.all([
      fetch('/api/v1/categories/active').then(r => r.json()),
      fetch('/api/v1/menu').then(r => r.json())
    ]).then(([categoriesData, menuData]) => {
      setCategories(categoriesData.data.categories);
      setMenuItems(menuData.data.menus);
    });
  }, []);

  // Group menu items by category
  const groupedMenu = categories.map(category => ({
    category,
    items: menuItems.filter(item => item.categoryId === category.id)
  }));

  return (
    <div>
      {groupedMenu.map(({ category, items }) => (
        <div key={category.id}>
          <h2>
            {category.icon} {category.name.en}
            {category.name.am && <span> ({category.name.am})</span>}
          </h2>
          <div className="menu-grid">
            {items.map(item => (
              <MenuItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
```

---

## ⚠️ Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "status": "fail",
  "message": "Category name (en) must be between 2 and 50 characters"
}
```

#### 409 Conflict (Duplicate Name)
```json
{
  "status": "fail",
  "message": "A category with this name already exists for this merchant"
}
```

#### 400 Cannot Delete (In Use)
```json
{
  "status": "fail",
  "message": "Cannot delete category. It is currently used by 5 menu items"
}
```

#### 404 Not Found
```json
{
  "status": "fail",
  "message": "Category not found"
}
```

### Error Handling Example

```javascript
const handleApiCall = async (url, options) => {
  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      // Handle specific error cases
      switch (response.status) {
        case 400:
          throw new Error(data.message || 'Invalid request');
        case 401:
          throw new Error('Unauthorized. Please login again');
        case 404:
          throw new Error('Category not found');
        case 409:
          throw new Error('Category name already exists');
        default:
          throw new Error(data.message || 'An error occurred');
      }
    }

    return data;
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
};
```

---

## ✅ Best Practices

### 1. Cache Categories
Categories don't change frequently. Cache them in local storage or state management:

```javascript
// Using React Context
const CategoryContext = createContext();

export const CategoryProvider = ({ children }) => {
  const [categories, setCategories] = useState([]);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchCategories = async (force = false) => {
    // Refresh every 5 minutes
    if (!force && lastFetch && Date.now() - lastFetch < 5 * 60 * 1000) {
      return categories;
    }

    const response = await fetch('/api/v1/categories/active');
    const data = await response.json();
    
    setCategories(data.data.categories);
    setLastFetch(Date.now());
    
    return data.data.categories;
  };

  return (
    <CategoryContext.Provider value={{ categories, fetchCategories }}>
      {children}
    </CategoryContext.Provider>
  );
};
```

### 2. Handle Multilingual Display

```javascript
const getCategoryName = (category, language = 'en') => {
  return category.name[language] || category.name.en;
};

// Usage
<h3>{getCategoryName(category, userLanguage)}</h3>
```

### 3. Sort by Display Order

Always sort categories by `displayOrder` for consistent UI:

```javascript
const sortedCategories = [...categories].sort((a, b) => 
  a.displayOrder - b.displayOrder
);
```

### 4. Filter Active Only for User-Facing UI

For public menus, always use `/active` endpoint or filter:

```javascript
// Admin panel - show all
const adminCategories = await fetch('/api/v1/categories');

// Customer menu - show active only
const publicCategories = await fetch('/api/v1/categories/active');
```

### 5. Handle Icon Display Safely

```javascript
const CategoryIcon = ({ icon }) => {
  // Fallback if no icon
  const displayIcon = icon || '📋';
  
  return <span className="category-icon">{displayIcon}</span>;
};
```

### 6. Implement Search with Debounce

```javascript
import { debounce } from 'lodash';

const CategorySearch = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const debouncedSearch = debounce(async (term) => {
    if (!term) return;
    
    const response = await fetch(
      `/api/v1/categories?search=${encodeURIComponent(term)}`
    );
    const data = await response.json();
    // Update UI with results
  }, 300);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    debouncedSearch(e.target.value);
  };

  return (
    <input
      type="text"
      placeholder="Search categories..."
      value={searchTerm}
      onChange={handleSearchChange}
    />
  );
};
```

---

## 📝 Migration Checklist

### From Old String-Based Categories to New System

- [ ] Fetch active categories from `/api/v1/categories/active`
- [ ] Replace hardcoded category dropdowns with API-driven ones
- [ ] Update menu creation forms to use `categoryId` field
- [ ] Update menu edit forms to use `categoryId` field
- [ ] Test multilingual category names display
- [ ] Implement category management UI (CRUD operations)
- [ ] Add category icons to menu displays
- [ ] Update menu filtering to use `categoryId`
- [ ] Remove references to old `category` string field
- [ ] Test all menu-related operations with new categories

---

## 🔗 Related Documentation

- [Category Module Complete](./CATEGORY-MODULE-COMPLETE.md)
- [Category Management Implementation Summary](./CATEGORY-MANAGEMENT-IMPLEMENTATION-SUMMARY.md)
- [Menu API Query Reference](./MENU-API-QUERY-REFERENCE.md)
- [Frontend Menu API Migration Guide](./FRONTEND-MENU-API-MIGRATION-GUIDE.md)

---

## 🆘 Support

If you encounter issues:

1. Check that JWT token is valid and included in headers
2. Verify merchant context is set correctly
3. Check API response error messages
4. Ensure category names are unique (case-insensitive)
5. Verify required fields are provided (name.en is required)

For backend issues, check:
- `tests/category-integration.test.js` for API examples
- `src/modules/categories/` for implementation details
- `models/Category.js` for data model reference
