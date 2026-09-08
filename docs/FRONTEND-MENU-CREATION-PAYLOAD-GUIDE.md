# Frontend Menu Creation - Complete Payload Guide

**Date:** August 22, 2026  
**Purpose:** Complete reference for creating Categories, Menu Items, Menu Groups, and Special Offers

---

## Table of Contents
1. [Categories](#1-categories)
2. [Menu Items (Food & Drinks)](#2-menu-items)
3. [Menu Groups](#3-menu-groups)
4. [Special Offers (Tags)](#4-special-offers)
5. [Complete Examples](#5-complete-examples)

---

## 1. Categories

### Endpoint
```
POST /api/v1/categories
```

### Headers
```json
{
  "Authorization": "Bearer YOUR_JWT_TOKEN",
  "Content-Type": "application/json"
}
```

### Payload Structure
```json
{
  "name": {
    "en": "Appetizers",
    "am": "ጀማሪዎች"
  },
  "description": {
    "en": "Start your meal with our delicious appetizers",
    "am": "ምግብዎን በጣፋጭ ጀማሪዎቻችን ይጀምሩ"
  },
  "isActive": true
}
```

### Field Requirements

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `name.en` | string | ✅ Yes | English name | 2-100 characters |
| `name.am` | string | ⚠️ Optional | Amharic name | 2-100 characters |
| `description.en` | string | ⚠️ Optional | English description | Max 800 characters |
| `description.am` | string | ⚠️ Optional | Amharic description | Max 800 characters |
| `isActive` | boolean | ⚠️ Optional | Category visibility | Default: `true` |

### Response Example
```json
{
  "status": "success",
  "data": {
    "category": {
      "_id": "6123456789abcdef01234567",
      "merchant": "6098765432fedcba98765432",
      "name": {
        "en": "Appetizers",
        "am": "ጀማሪዎች"
      },
      "description": {
        "en": "Start your meal with our delicious appetizers",
        "am": "ምግብዎን በጣፋጭ ጀማሪዎቻችን ይጀምሩ"
      },
      "isActive": true,
      "createdAt": "2026-08-22T10:00:00.000Z",
      "updatedAt": "2026-08-22T10:00:00.000Z"
    }
  }
}
```

---

## 2. Menu Items

### Endpoint
```
POST /api/v1/menu
```

### Headers
```json
{
  "Authorization": "Bearer YOUR_JWT_TOKEN",
  "Content-Type": "multipart/form-data"
}
```

### Payload Structure (Food Item)

#### Basic Fields
```json
{
  "name": {
    "en": "Grilled Chicken",
    "am": "የተጠበሰ ዶሮ"
  },
  "description": {
    "en": "Juicy grilled chicken with herbs",
    "am": "ጣፋጭ የተጠበሰ ዶሮ ከቅመማ ቅመም ጋር"
  },
  "type": "food",
  "categoryId": "6123456789abcdef01234567",
  "price": 250,
  "prepTime": "20-25 min",
  "available": true,
  "inStock": true,
  "isVeg": false,
  "isSpicy": true,
  "isFasting": false,
  "cuisineOrigin": "local",
  "publishStatus": "published"
}
```

#### With Variants (Multiple Sizes/Prices)
```json
{
  "name": {"en": "Pizza Margherita", "am": "ፒዛ ማርጋሪታ"},
  "type": "food",
  "categoryId": "6123456789abcdef01234567",
  "variants": [
    {
      "name": "Small",
      "size": "8 inch",
      "price": 180,
      "calories": 650,
      "available": true,
      "isDefault": true
    },
    {
      "name": "Medium",
      "size": "12 inch",
      "price": 280,
      "calories": 980,
      "available": true,
      "isDefault": false
    },
    {
      "name": "Large",
      "size": "16 inch",
      "price": 380,
      "calories": 1320,
      "available": true,
      "isDefault": false
    }
  ]
}
```

#### With Image Upload
```javascript
const formData = new FormData();

// Add JSON fields
formData.append(''name', JSON.stringify({en: "Grilled Chicken", am: "የተጠበሰ ዶሮ"}));
formData.append(''description', JSON.stringify({en: "Description", am: "መግለጫ"}));
formData.append(''type', ''food');
formData.append(''categoryId', ''6123456789abcdef01234567');
formData.append(''price', ''250');

// Add image file
formData.append(''image', imageFile); // File object from input

// Send request
fetch(''http://localhost:8000/api/v1/menu'', {
  method: ''POST',
  headers: {
    ''Authorization': `Bearer ${token}`
  },
  body: formData
});
```

### Field Requirements (Menu Items)

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `name.en` | string | ✅ Yes | English name | 2-100 characters |
| `name.am` | string | ⚠️ Optional | Amharic name | 2-100 characters |
| `type` | string | ✅ Yes | Item type | "food" or "drink" |
| `categoryId` | ObjectId | ✅ Yes | Category reference | Valid category _id |
| `description.en` | string | ⚠️ Optional | English description | Max 800 characters |
| `description.am` | string | ⚠️ Optional | Amharic description | Max 800 characters |
| `price` | number | ⚠️ Optional* | Base price | Min: 0 (*required if no variants) |
| `variants` | array | ⚠️ Optional | Price variants | See variant schema |
| `image` | File | ⚠️ Optional | Menu item image | JPEG, PNG, WebP |
| `prepTime` | string | ⚠️ Optional | Preparation time | Default: "15-25 min" |
| `available` | boolean | ⚠️ Optional | Availability | Default: `true` |
| `inStock` | boolean | ⚠️ Optional | Stock status | Default: `true` |
| `isVeg` | boolean | ⚠️ Optional | Vegetarian | Default: `null` |
| `isSpicy` | boolean | ⚠️ Optional | Spicy flag | Default: `false` |
| `isFasting` | boolean | ⚠️ Optional | Fasting-friendly | Default: `null` |
| `cuisineOrigin` | string | ⚠️ Optional | Cuisine type | "local" or "international" |
| `cuisineTags` | array | ⚠️ Optional | Cuisine tags | e.g., ["ethiopian", "italian"] |
| `publishStatus` | string | ⚠️ Optional | Publish status | "draft", "published", "archived" |
| `allergens` | array | ⚠️ Optional | Allergen list | e.g., ["nuts", "dairy", "gluten"] |
| `tags` | array | ⚠️ Optional | Special tags | See Special Offers section |

### Drink-Specific Fields

| Field | Type | Required | Description | Values |
|-------|------|----------|-------------|--------|
| `drinkType` | string | ⚠️ Optional | Drink category | "soft-drink", "juice", "beer", "wine", "cocktail", "hot-drink", "milkshake", "water" |
| `isAlcoholic` | boolean | ⚠️ Optional | Contains alcohol | Default: `false` |
| `alcoholPercentage` | number | ⚠️ Optional | Alcohol % | 0-100 |

### Variant Schema

```json
{
  "name": "Medium",           // Required: variant name
  "size": "12 inch",          // Optional: size description
  "volume": "500ml",          // Optional: volume
  "price": 280,               // Required: price for this variant
  "calories": 980,            // Optional: calorie count
  "available": true,          // Optional: availability (default: true)
  "isDefault": false          // Optional: default selection (default: false)
}
```

---

## 3. Menu Groups

### Endpoint
```
POST /api/v1/menu-groups
```

### Payload Structure

#### Basic Menu Group (Always Visible)
```json
{
  "name": {
    "en": "Breakfast Special",
    "am": "ልዩ ቁርስ"
  },
  "description": {
    "en": "Our morning favorites",
    "am": "የጠዋት ተወዳጆቻችን"
  },
  "branches": ["609876543210abcdef123456"],
  "visibility": "always",
  "priority": 10,
  "items": [
    {
      "menu": "6123456789abcdef01234567",
      "sortOrder": 1
    },
    {
      "menu": "6123456789abcdef01234568",
      "sortOrder": 2,
      "overridePrice": 220,
      "customName": "Special Breakfast Combo"
    }
  ]
}
```

#### Scheduled Menu Group (Time-Based)
```json
{
  "name": {"en": "Lunch Menu", "am": "የምሳ ምናሌ"},
  "branches": ["609876543210abcdef123456"],
  "visibility": "scheduled",
  "priority": 8,
  "activeDays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "blockedDays": [],
  "timeSlots": [
    {
      "start": "11:00",
      "end": "15:00"
    }
  ],
  "items": [
    {"menu": "6123456789abcdef01234569", "sortOrder": 1}
  ]
}
```

#### With Special Dates
```json
{
  "name": {"en": "Holiday Special", "am": "የበዓል ልዩ"},
  "branches": ["609876543210abcdef123456"],
  "visibility": "scheduled",
  "priority": 15,
  "specialDates": [
    {
      "date": "2026-12-25T00:00:00.000Z",
      "recurringYearly": true
    },
    {
      "date": "2026-09-11T00:00:00.000Z",
      "recurringYearly": true
    }
  ],
  "items": [
    {"menu": "6123456789abcdef01234570", "sortOrder": 1}
  ]
}
```

### Field Requirements (Menu Groups)

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `name.en` | string | ✅ Yes | English name | Required |
| `name.am` | string | ⚠️ Optional | Amharic name | Optional |
| `branches` | array | ✅ Yes | Branch IDs | At least 1 branch |
| `visibility` | string | ✅ Yes | Visibility type | "always", "scheduled", "hidden" |
| `priority` | number | ⚠️ Optional | Display order | Higher = shown first |
| `items` | array | ✅ Yes | Menu items | At least 1 item |
| `activeDays` | array | ⚠️ Conditional | Active weekdays | Required if visibility="scheduled" |
| `blockedDays` | array | ⚠️ Optional | Blocked weekdays | Optional |
| `timeSlots` | array | ⚠️ Conditional | Time ranges | Required if visibility="scheduled" |
| `specialDates` | array | ⚠️ Optional | Special dates | Optional |
| `isAlcoholMenu` | boolean | ⚠️ Optional | Alcohol menu flag | Default: `false` |

### Menu Group Item Schema

```json
{
  "menu": "6123456789abcdef01234567",    // Required: menu item _id
  "sortOrder": 1,                         // Required: display order
  "overridePrice": 220,                   // Optional: override default price
  "customName": "Special Combo",          // Optional: override name
  "customDescription": "Limited time",    // Optional: override description
  "isHidden": false                       // Optional: hide this item
}
```

---

## 4. Special Offers

Special offers are created using **tags** on menu items. The public menu API automatically extracts items with these special tags.

### Special Offer Tags

Use these tags in the `tags` array when creating menu items:

| Tag | Display As | Description |
|-----|------------|-------------|
| `"chef-special"` | Chef''s Special | Chef''s recommendation |
| `"trending"` | Trending Now | Popular item |
| `"bestseller"` | Bestseller | Top-selling item |
| `"limited"` | Limited Time | Limited availability |

### Example: Create Menu Item with Special Offer Tag

```json
{
  "name": {"en": "Signature Tibs", "am": "የፊርማ ጥብስ"},
  "type": "food",
  "categoryId": "6123456789abcdef01234567",
  "price": 320,
  "tags": ["chef-special", "bestseller"],
  "available": true
}
```

### How Special Offers Appear in Public Menu

When customers fetch the public menu:

```
GET /api/v1/menu/public?merchantId={merchantId}
```

Response includes `specialOffers` section:

```json
{
  "restaurant": "My Restaurant",
  "totalItems": 45,
  "menus": [...],
  "specialOffers": [
    {
      "id": "6123456789abcdef01234567",
      "name": "Signature Tibs",
      "image": "https://...jpg",
      "price": 320,
      "tag": "chef-special"
    }
  ]
}
```

---

## 5. Complete Examples

### Example 1: Create Complete Food Menu Flow

#### Step 1: Create Category
```javascript
const category = await fetch(''http://localhost:8000/api/v1/categories'', {
  method: ''POST',
  headers: {
    ''Authorization': `Bearer ${token}`,
    ''Content-Type': ''application/json''
  },
  body: JSON.stringify({
    name: {en: "Main Dishes", am: "ዋና ምግቦች"},
    description: {en: "Our main course selections", am: "የዋና ምግብ ምርጫዎቻችን"},
    isActive: true
  })
}).then(r => r.json());

const categoryId = category.data.category._id;
```

#### Step 2: Create Menu Items
```javascript
const formData = new FormData();
formData.append(''name', JSON.stringify({en: "Beef Tibs", am: "የበሬ ጥብስ"}));
formData.append(''description', JSON.stringify({
  en: "Tender beef cubes with onions and peppers",
  am: "ለስላሳ የበሬ ስጋ ከሽንኩርት እና በርበሬ ጋር"
}));
formData.append(''type', ''food');
formData.append(''categoryId', categoryId);
formData.append(''price', ''280');
formData.append(''prepTime', ''15-20 min');
formData.append(''isSpicy', ''true');
formData.append(''cuisineOrigin', ''local');
formData.append(''tags', JSON.stringify([''chef-special'', ''bestseller'']));
formData.append(''image', imageFile);

const menuItem = await fetch(''http://localhost:8000/api/v1/menu'', {
  method: ''POST',
  headers: {''Authorization': `Bearer ${token}`},
  body: formData
}).then(r => r.json());

const menuItemId = menuItem.data.menu._id;
```

#### Step 3: Create Menu Group
```javascript
const menuGroup = await fetch(''http://localhost:8000/api/v1/menu-groups'', {
  method: ''POST',
  headers: {
    ''Authorization': `Bearer ${token}`,
    ''Content-Type': ''application/json''
  },
  body: JSON.stringify({
    name: {en: "Lunch Specials", am: "የምሳ ልዩነት"},
    description: {en: "Daily lunch specials", am: "የእለት ምሳ ልዩነቶች"},
    branches: [branchId],
    visibility: "scheduled",
    priority: 10,
    activeDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    timeSlots: [{start: "11:00", end: "15:00"}],
    items: [
      {menu: menuItemId, sortOrder: 1}
    ]
  })
}).then(r => r.json());
```

### Example 2: Drink Menu with Variants

```javascript
// Create Drink Category
const drinkCategory = await createCategory({
  name: {en: "Beverages", am: "መጠጦች"}
});

// Create Drink with Variants
const formData = new FormData();
formData.append(''name', JSON.stringify({en: "Fresh Orange Juice", am: "ትኩስ የብርቱካን ጭማቂ"}));
formData.append(''type', ''drink');
formData.append(''categoryId', drinkCategory._id);
formData.append(''drinkType', ''juice');
formData.append(''isAlcoholic', ''false');
formData.append(''variants', JSON.stringify([
  {name: "Small", volume: "250ml", price: 45, isDefault: true},
  {name: "Medium", volume: "500ml", price: 75},
  {name: "Large", volume: "750ml", price: 95}
]));
formData.append(''image', juiceImage);

const drink = await createMenuItem(formData);
```

---

## Error Responses

### Common Validation Errors

```json
{
  "success": false,
  "message": "name.en (English name) is required",
  "errors": [{
    "status": "Fail",
    "statusCode": 400,
    "isOperational": true
  }]
}
```

### Error Codes

| Status | Message | Solution |
|--------|---------|----------|
| 400 | "name.en (English name) is required" | Add `name.en` field |
| 400 | "type is required" | Add `type` field ("food" or "drink") |
| 400 | "categoryId is required" | Provide valid category `_id` |
| 400 | "At least one branch is required" | Add branch ID to `branches` array |
| 404 | "Category not found" | Use valid category `_id` |
| 401 | "Unauthorized" | Include valid JWT token |
| 403 | "Access denied" | Check user permissions |

---

## TypeScript Interfaces

```typescript
interface LocalizedText {
  en: string;
  am?: string;
}

interface MenuItemVariant {
  name: string;
  size?: string;
  volume?: string;
  price: number;
  calories?: number;
  available?: boolean;
  isDefault?: boolean;
}

interface CreateMenuItemPayload {
  name: LocalizedText;
  description?: LocalizedText;
  type: ''food'' | ''drink'';
  categoryId: string;
  price?: number;
  variants?: MenuItemVariant[];
  image?: File;
  prepTime?: string;
  available?: boolean;
  inStock?: boolean;
  isVeg?: boolean;
  isSpicy?: boolean;
  isFasting?: boolean;
  cuisineOrigin?: ''local'' | ''international'';
  cuisineTags?: string[];
  drinkType?: string;
  isAlcoholic?: boolean;
  publishStatus?: ''draft'' | ''published'' | ''archived'';
  allergens?: string[];
  tags?: string[];
}

interface MenuGroupItem {
  menu: string;
  sortOrder: number;
  overridePrice?: number;
  customName?: string;
  customDescription?: string;
  isHidden?: boolean;
}

interface CreateMenuGroupPayload {
  name: LocalizedText;
  description?: LocalizedText;
  branches: string[];
  visibility: ''always'' | ''scheduled'' | ''hidden'';
  priority?: number;
  items: MenuGroupItem[];
  activeDays?: string[];
  blockedDays?: string[];
  timeSlots?: Array<{start: string; end: string}>;
  specialDates?: Array<{date: string; recurringYearly: boolean}>;
  isAlcoholMenu?: boolean;
}

interface CreateCategoryPayload {
  name: LocalizedText;
  description?: LocalizedText;
  isActive?: boolean;
}
```

---

## Testing Checklist

- [ ] Can create category with bilingual names
- [ ] Can create food menu item with image
- [ ] Can create drink menu item with variants
- [ ] Can create menu group with items
- [ ] Special offer tags appear in public menu
- [ ] Scheduled menu groups show at correct times
- [ ] Image uploads work correctly
- [ ] Validation errors are clear
- [ ] All required fields enforced
- [ ] Soft-deleted items not visible

---

**Document Version:** 1.0  
**Last Updated:** August 22, 2026  
**Backend API Version:** v1
