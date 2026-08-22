# Menu Localization Guide

## Overview
Menu items now support multilingual names and descriptions in English (en) and Amharic (am), matching the category localization structure.

---

## Changes Made

### 1. Menu Model Updates
**File**: `models/menuModel.js`

#### Before (String-based):
```javascript
name: {
  type: String,
  required: true,
  trim: true,
  maxlength: 100
},
description: {
  type: String,
  trim: true,
  maxlength: 800
}
```

#### After (Localized):
```javascript
name: {
  type: localizedTextSchema,  // { en: String (required), am: String (optional) }
  required: true
},
description: {
  type: localizedTextSchema,  // { en: String (optional), am: String (optional) }
  required: false
}
```

### 2. Validation Updates
**File**: `src/modules/menu/validators/menu.validators.js`

- Added `validateLocalizedDescription()` function
- Updated `assertMenuCreateFields()` to validate localized names
- Supports both object format `{en: "...", am: "..."}` and legacy string format

### 3. Slug Generation
- Slug now uses `name.en` (English name) for URL-friendly identifiers
- Maintains backward compatibility with legacy string names

---

## API Usage

### Creating Menu Item with Localized Content

#### Request Body (New Format):
```json
{
  "name": {
    "en": "Margherita Pizza",
    "am": "ማርጋሪታ ፒዛ"
  },
  "description": {
    "en": "Classic Italian pizza with fresh mozzarella, tomatoes, and basil",
    "am": "በቅርቡ የሞፃሬላ ጨው፣ የቲማቲም እና ባዚል የታጨ ክላሲክ ፒዛ"
  },
  "type": "food",
  "categoryId": "507f1f77bcf86cd799439011",
  "variants": [
    {
      "name": "Small",
      "price": 12.99,
      "isDefault": true
    },
    {
      "name": "Large",
      "price": 18.99
    }
  ]
}
```

#### Response:
```json
{
  "status": "success",
  "data": {
    "menu": {
      "id": "507f1f77bcf86cd799439012",
      "name": {
        "en": "Margherita Pizza",
        "am": "ማርጋሪታ ፒዛ"
      },
      "description": {
        "en": "Classic Italian pizza with fresh mozzarella, tomatoes, and basil",
        "am": "በቅርቡ የሞፃሬላ ጨው፣ የቲማቲም እና ባዚል የታጨ ክላሲክ ፒዛ"
      },
      "slug": "margherita-pizza-mt05k7ab",
      "type": "food",
      "categoryId": "507f1f77bcf86cd799439011",
      "variants": [...],
      "price": 0,
      "averagePrice": 15.99
    }
  }
}
```

---

## Frontend Integration

### TypeScript Interface
```typescript
interface LocalizedText {
  en: string;    // English (required)
  am?: string;   // Amharic (optional)
}

interface MenuItem {
  id: string;
  name: LocalizedText;           // ✅ Localized
  description?: LocalizedText;   // ✅ Localized
  slug: string;
  type: 'food' | 'drink';
  categoryId: string;
  variants: Variant[];
  // ... other fields
}
```

### Display Helper Function
```javascript
/**
 * Get localized text based on user's language preference
 * Falls back to English if preferred language not available
 */
function getLocalizedText(localizedObj, language = 'en') {
  if (!localizedObj) return '';
  
  // If it's a string (legacy format), return as is
  if (typeof localizedObj === 'string') return localizedObj;
  
  // Return preferred language or fallback to English
  return localizedObj[language] || localizedObj.en || '';
}

// Usage
const menuName = getLocalizedText(menuItem.name, userLanguage);
const menuDescription = getLocalizedText(menuItem.description, userLanguage);
```

### React Component Example
```jsx
const MenuItemCard = ({ item, language = 'en' }) => {
  const name = getLocalizedText(item.name, language);
  const description = getLocalizedText(item.description, language);

  return (
    <div className="menu-item-card">
      <h3>{name}</h3>
      <p>{description}</p>
      <div className="price">
        {item.averagePrice} ETB
      </div>
    </div>
  );
};
```

### Menu Form Component
```jsx
const MenuForm = ({ onSubmit }) => {
  const [formData, setFormData] = useState({
    name: { en: '', am: '' },
    description: { en: '', am: '' },
    type: 'food',
    categoryId: '',
    variants: [{ name: 'Regular', price: 0, isDefault: true }]
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate English name is provided
    if (!formData.name.en.trim()) {
      alert('English name is required');
      return;
    }

    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <fieldset>
        <legend>Name</legend>
        
        <div>
          <label>English Name *</label>
          <input
            type="text"
            required
            maxLength={100}
            value={formData.name.en}
            onChange={(e) => setFormData({
              ...formData,
              name: { ...formData.name, en: e.target.value }
            })}
          />
        </div>

        <div>
          <label>Amharic Name (አማርኛ ስም)</label>
          <input
            type="text"
            maxLength={100}
            value={formData.name.am}
            onChange={(e) => setFormData({
              ...formData,
              name: { ...formData.name, am: e.target.value }
            })}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Description</legend>
        
        <div>
          <label>English Description</label>
          <textarea
            maxLength={800}
            value={formData.description.en}
            onChange={(e) => setFormData({
              ...formData,
              description: { ...formData.description, en: e.target.value }
            })}
          />
        </div>

        <div>
          <label>Amharic Description (አማርኛ መግለጫ)</label>
          <textarea
            maxLength={800}
            value={formData.description.am}
            onChange={(e) => setFormData({
              ...formData,
              description: { ...formData.description, am: e.target.value }
            })}
          />
        </div>
      </fieldset>

      {/* Other fields... */}
      
      <button type="submit">Create Menu Item</button>
    </form>
  );
};
```

### Language Switcher
```jsx
const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('en');

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

const LanguageSwitcher = () => {
  const { language, setLanguage } = useContext(LanguageContext);

  return (
    <div className="language-switcher">
      <button 
        className={language === 'en' ? 'active' : ''}
        onClick={() => setLanguage('en')}
      >
        English
      </button>
      <button 
        className={language === 'am' ? 'active' : ''}
        onClick={() => setLanguage('am')}
      >
        አማርኛ
      </button>
    </div>
  );
};
```

---

## Validation Rules

### Name Field
- **Type**: LocalizedText object
- **Required**: Yes
- **name.en (English)**:
  - Required: Yes
  - Min length: 2 characters
  - Max length: 100 characters
- **name.am (Amharic)**:
  - Required: No
  - Min length: 2 characters (if provided)
  - Max length: 100 characters

### Description Field
- **Type**: LocalizedText object
- **Required**: No (optional)
- **description.en (English)**:
  - Max length: 800 characters
- **description.am (Amharic)**:
  - Max length: 800 characters

---

## Backward Compatibility

### Legacy String Format Support
The system temporarily supports legacy string-based name and description for backward compatibility during migration:

```javascript
// ✅ New format (preferred)
{
  "name": { "en": "Pizza", "am": "ፒዛ" }
}

// ⚠️ Legacy format (still works, but deprecated)
{
  "name": "Pizza"
}
```

### Migration Path
1. **Phase 1** (Current): Both formats accepted
2. **Phase 2**: Update all frontend forms to use localized format
3. **Phase 3**: Run data migration script to convert existing string data
4. **Phase 4**: Remove string format support

---

## Data Migration

### Migration Script (To Be Created)
```javascript
// scripts/migrate-menu-to-localized.js

const Menu = require('../models/menuModel');

async function migrateMenuToLocalized() {
  const menus = await Menu.find({});
  
  for (const menu of menus) {
    let updated = false;
    
    // Migrate name if it's a string
    if (typeof menu.name === 'string') {
      menu.name = { en: menu.name };
      updated = true;
    }
    
    // Migrate description if it's a string
    if (typeof menu.description === 'string') {
      menu.description = { en: menu.description };
      updated = true;
    }
    
    if (updated) {
      await menu.save();
      console.log(`Migrated menu: ${menu._id}`);
    }
  }
  
  console.log('Migration complete');
}

// Run: node scripts/migrate-menu-to-localized.js
```

---

## Search & Filtering

### Searching Localized Content
When implementing search, search across both English and Amharic names:

```javascript
// Backend search example
const searchQuery = req.query.search;

const query = {
  merchant: merchantId,
  $or: [
    { 'name.en': { $regex: searchQuery, $options: 'i' } },
    { 'name.am': { $regex: searchQuery, $options: 'i' } },
    { 'description.en': { $regex: searchQuery, $options: 'i' } },
    { 'description.am': { $regex: searchQuery, $options: 'i' } }
  ]
};

const results = await Menu.find(query);
```

---

## Testing

### Test Cases to Cover
1. ✅ Create menu with English name only
2. ✅ Create menu with both English and Amharic names
3. ✅ Create menu with both English and Amharic descriptions
4. ✅ Update menu item to add Amharic translation
5. ✅ Validate name.en is required
6. ✅ Validate character limits for both languages
7. ✅ Search across both language fields
8. ✅ Slug generation uses English name
9. ✅ Display correct language based on user preference

### Example Test
```javascript
describe('Menu Localization', () => {
  it('should create menu with localized name and description', async () => {
    const response = await request(app)
      .post('/api/v1/menu')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: {
          en: 'Ethiopian Coffee',
          am: 'የኢትዮጵያ ቡና'
        },
        description: {
          en: 'Traditional Ethiopian coffee ceremony',
          am: 'ባህላዊ የኢትዮጵያ የቡና ስርዓት'
        },
        type: 'drink',
        categoryId: categoryId,
        variants: [{ name: 'Regular', price: 50, isDefault: true }]
      });

    expect(response.status).toBe(201);
    expect(response.body.data.menu.name.en).toBe('Ethiopian Coffee');
    expect(response.body.data.menu.name.am).toBe('የኢትዮጵያ ቡና');
  });
});
```

---

## Best Practices

### 1. Always Provide English Content
English (`en`) is the fallback language. Always provide English content:
```javascript
// ✅ Good
{ name: { en: 'Pizza', am: 'ፒዛ' } }

// ❌ Bad - English missing
{ name: { am: 'ፒዛ' } }
```

### 2. Use Helper Functions
Create reusable helper functions for displaying localized content:
```javascript
// utils/localization.js
export const getLocalizedField = (field, lang = 'en') => {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field[lang] || field.en || '';
};
```

### 3. Store User Language Preference
Store the user's language preference in:
- Local storage
- User profile
- Context/Redux store

### 4. Consistent UI for Translation Input
Use a consistent UI pattern for translation inputs across the application.

### 5. Validate Before Submit
Always validate that required language content is provided before submitting:
```javascript
if (!formData.name.en || !formData.name.en.trim()) {
  throw new Error('English name is required');
}
```

---

## Related Documentation
- [Frontend Category Integration Guide](./FRONTEND-CATEGORY-INTEGRATION-GUIDE.md)
- [Category Module Complete](./CATEGORY-MODULE-COMPLETE.md)
- [Menu API Query Reference](./MENU-API-QUERY-REFERENCE.md)

---

## Summary

✅ Menu items now support multilingual names and descriptions  
✅ English (en) is required, Amharic (am) is optional  
✅ Backward compatible with legacy string format  
✅ Slug generation uses English name  
✅ Validation ensures data quality  
✅ Frontend examples provided for React  
✅ Migration path defined  

**Next Steps:**
1. Update existing menu creation forms in frontend
2. Add language switcher to user interface
3. Run data migration script for existing menus
4. Update all menu display components to use localized content
5. Test thoroughly with both languages
