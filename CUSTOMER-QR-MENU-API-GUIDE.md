# Customer QR Menu API Guide

**For Building Customer-Facing QR Ordering Frontend**

---

## Overview

The `/api/v1/menu/public` endpoint returns the restaurant's published menu with all details needed for a customer ordering app.

---

## API Flow

```
1. Customer scans QR code at table
   ↓
2. Frontend initiates session: POST /api/v1/sessions/start
   Response: { 
     sessionToken: "...",
     table: "6a95...",
     tableNumber: "T-01", 
     branchId: "6a95...",  ✅ INCLUDED
     merchantId: "6a95...",
     message: "Welcome!"
   }
   ↓
3. Frontend calls menu endpoint: GET /api/v1/menu/public
   With session token in request
   ↓
4. Response: Full menu with images, descriptions, prices, etc.
   ↓
5. Customer selects items and places order
```

---

## Endpoint: GET /api/v1/menu/public

### Authentication
- **Required:** Table session token (from POST /api/v1/sessions/start)
- **Header:** `Cookie: sessionToken=<token>` OR URL parameter

### Query Parameters
```
type=food      → Food items only
type=drink     → Drinks (non-alcoholic only)
type=alcohol   → Alcoholic beverages only
(no type)      → All items
```

### Response Structure

```json
{
  "status": "success",
  "data": {
    "restaurant": "Restaurant Name",
    "generatedAt": "2026-08-31T08:57:12.995Z",
    "totalItems": 13,
    "tableNumber": "T-01",
    "menus": [
      {
        "id": "6a9533328bc68bc64ec6b679",
        "name": "Grilled Chicken Breast",
        "description": "Juicy grilled chicken breast with roasted vegetables and mashed potatoes",
        "image": "http://localhost:8000/api/v1/files/...",  // ← FULL URL to image
        "price": 245,
        "variants": [
          {
            "name": "regular",
            "price": 245,
            "available": true,
            "isDefault": true
          }
        ],
        "type": "food",
        "isVeg": false,
        "isSpicy": false,
        "isAlcoholic": false,
        "prepTime": "15-25 min",
        "ingredients": [
          { "name": "chicken", "quantity": 200, "unit": "g" },
          { "name": "vegetables", "quantity": 150, "unit": "g" }
        ],
        "allergens": ["dairy"],
        "rating": 4.5,
        "displayedIn": "Lunch Specials"
      }
    ],
    "specialOffers": [
      {
        "id": "6a9533328bc68bc64ec6b684",
        "name": "Beyaynetu (Veggie Combo)",
        "image": "http://localhost:8000/api/v1/files/...",
        "price": 600,
        "tag": "chef-special"  // Or: "trending", "bestseller", "limited"
      }
    ]
  }
}
```

---

## Key Data Fields for Frontend

### Menu Item Object

| Field | Type | Use Case |
|-------|------|----------|
| **id** | ObjectId | For order submission |
| **name** | string | Display in menu list |
| **description** | string | Show in item detail view |
| **image** | URL string | Display thumbnail/detail image |
| **price** | number | Show in ETB (Ethiopian Birr) |
| **variants** | array | Show size/variant selector |
| **type** | "food" \| "drink" | Filter/categorize items |
| **isVeg** | boolean | Show vegetarian badge |
| **isSpicy** | boolean | Show spicy/chili icon |
| **isAlcoholic** | boolean | Require age verification? |
| **prepTime** | string | Show "15-25 min" indicator |
| **ingredients** | array | Show allergen/nutrition info |
| **allergens** | string[] | Show allergy warnings |
| **rating** | number | Display star rating |
| **displayedIn** | string | Group by menu section |

---

## What's Missing? (Add to Frontend Integration)

### 1. **Stock Status** ⚠️

Current response doesn't include:
- Ingredient stock levels (low/out of stock)
- Estimated availability time

**Needed for:**
- Disable items that are out of stock
- Show "Coming soon" for low-stock items

**Add to request:**
```
GET /api/v1/menu/public?includeStock=true
```

### 2. **Nutritional Information** ⚠️

Current response has:
- Allergens only

**Missing:**
- Calories
- Protein, fat, carbs
- Dietary information (vegan, gluten-free, etc.)

### 3. **Customer Preferences** ⚠️

Current response doesn't include:
- Customization options (e.g., "extra cheese", "no onions")
- Special instructions fields

### 4. **Reviews/Ratings** ⚠️

Current response includes:
- Average rating (4.5)

**Missing:**
- Individual reviews
- Review count
- Recent customer feedback

---

## Frontend Implementation Checklist

### 1. Session Initialization
```javascript
// Step 1: Start session
POST /api/v1/sessions/start?data=<base64>&s=<signature>

Response:
{
  "status": "success",
  "data": {
    "sessionToken": "abc123...",
    "table": "6a9535346c844d03b3400036",
    "tableNumber": "T-01",
    "branchId": "6a9532e46c844d03b33ff55e",  ✅ INCLUDED
    "merchantId": "6a9532e46c844d03b33ff55b",
    "message": "Welcome!"
  }
}

// Save all IDs for later use
localStorage.setItem('sessionToken', data.sessionToken);
localStorage.setItem('tableId', data.table);
localStorage.setItem('branchId', data.branchId);  ✅
localStorage.setItem('merchantId', data.merchantId);
```

### 2. Fetch Menu
```javascript
// Step 2: Get menu
GET /api/v1/menu/public
Headers: { 'Cookie': 'sessionToken=...' }

// Parse response
const { restaurant, menus, specialOffers, tableNumber } = response.data;
```

### 3. Display Menu
```javascript
✅ Restaurant name (header)
✅ Table number (e.g., "Table T-01")
✅ Menu items with:
   ✅ Image (full URL, can display directly)
   ✅ Name
   ✅ Description
   ✅ Price (show in ETB)
   ✅ Prep time estimate
   ✅ Spicy/Vegetarian badges
   ✅ Allergen warnings
   ✅ Special offers section
⚠️ Stock status (NOT PROVIDED - need to add)
⚠️ Customer reviews (NOT PROVIDED - need to add)
```

### 4. Item Selection Flow
```javascript
1. User taps item
2. Show details:
   - Full image
   - Description
   - Ingredients
   - Allergens
   - Rating
   - Variants (sizes/options)
3. User selects variant + quantity
4. Add to cart
```

### 5. Order Submission
```javascript
POST /api/v1/orders/place
Body: {
  items: [
    {
      menuItem: "6a9533328bc68bc64ec6b679",
      quantity: 2,
      variant: "regular",
      notes: "No onions"
    }
  ],
  tableNumber: "T-01",
  customerName: "...",
  customerPhone: "..."
}
```

---

## Current Limitations

### What Works ✅
- Full menu retrieval
- Categorization (food/drink/alcohol)
- Special offers
- Images (if uploaded)
- Allergies
- Vegetarian/Spicy flags

### What's Missing ⚠️
- **Stock status** - items are marked as `inStock: true` in DB but no real-time stock count
- **Nutritional facts** - not in database
- **Customer reviews** - rating is averaged, no individual reviews
- **Customization options** - no add-ons/modifiers data
- **Dietary badges** - vegan/gluten-free flags only in notes

---

## Menu Structure (Backend)

### MenuGroup → MenuItems Flow

```
MenuGroup (e.g., "Lunch Specials")
├─ Priority (1-100)
├─ Visibility (always/scheduled/hidden)
├─ TimeSlots (e.g., 11:00-14:00)
├─ Items[]
│  ├─ MenuItem (e.g., "Chicken Breast")
│  │  ├─ name
│  │  ├─ description
│  │  ├─ image (FileAsset)
│  │  ├─ price
│  │  ├─ variants (sizes)
│  │  ├─ recipe (ingredients)
│  │  ├─ allergens
│  │  └─ ...
│  ├─ customName (override group name)
│  ├─ customDescription (override group desc)
│  ├─ overridePrice (special price for group)
│  └─ isHidden (exclude from this group)
```

**Current Response:** Flattens all active groups → single `menus[]` array

**Grouping:** `displayedIn` field shows which MenuGroup the item belongs to

---

## Example: Build Menu UI

```javascript
// Group items by displayedIn field
const groupedMenu = menus.reduce((acc, item) => {
  if (!acc[item.displayedIn]) {
    acc[item.displayedIn] = [];
  }
  acc[item.displayedIn].push(item);
  return acc;
}, {});

// Render
Object.entries(groupedMenu).forEach(([groupName, items]) => {
  console.log(`<h2>${groupName}</h2>`);
  items.forEach(item => {
    console.log(`
      <div class="menu-item">
        <img src="${item.image}" alt="${item.name}" />
        <h3>${item.name}</h3>
        <p>${item.description}</p>
        <div class="badges">
          ${item.isVeg ? '<span class="veg">🌱 Vegetarian</span>' : ''}
          ${item.isSpicy ? '<span class="spicy">🌶️ Spicy</span>' : ''}
          ${item.allergens?.length ? `<span class="allergens">⚠️ ${item.allergens.join(', ')}</span>` : ''}
        </div>
        <p class="price">ETB ${item.price}</p>
        <p class="prep-time">⏱️ ${item.prepTime}</p>
        <button onclick="addToCart('${item.id}')">Add to Cart</button>
      </div>
    `);
  });
});
```

---

## Testing the Endpoint

### 1. Start a session
```bash
curl -X POST http://localhost:8000/api/v1/sessions/start \
  -H "Content-Type: application/json" \
  -d '{
    "data": "eyJtIjoiNmE5NTMyZTQ2Yzg0NGQwM2IzM2ZmNTViIiwiYiI6IjZhOTUzMmU0NmM4NDRkMDNiMzNmZjU1ZSIsInQiOiI2YTk1MzUzNDZjODQ0ZDAzYjM0MDAwMzYifQ",
    "s": "4092fe5d56b7a53b38852d2dd12900ac5d49a2cff28e29aeb69687ee05baa55e11:24"
  }'
```

### 2. Get menu with session token
```bash
curl -X GET "http://localhost:8000/api/v1/menu/public" \
  -H "Cookie: sessionToken=<token-from-step-1>"
```

### 3. Filter by type
```bash
curl -X GET "http://localhost:8000/api/v1/menu/public?type=food"
curl -X GET "http://localhost:8000/api/v1/menu/public?type=drink"
curl -X GET "http://localhost:8000/api/v1/menu/public?type=alcohol"
```

---

## Summary

✅ **What You Have:**
- Full menu with images, descriptions, prices
- Categorization by MenuGroup (displayedIn)
- Special offers with tags
- Allergen/dietary information
- Variants (sizes)

⚠️ **What's Missing (Good Future Features):**
- Real-time stock status
- Nutritional facts
- Customer reviews
- Add-on/customization options
- Dietary filters (vegan, gluten-free, etc.)

**Good to go for MVP?** ✅ YES - Basic ordering flow works with current response

