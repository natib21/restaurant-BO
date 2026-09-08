# Menu Localization: Service & Controller Updates Needed

## Status: ⚠️ BREAKING CHANGES - Requires Updates

The menu model has been updated to use localized text for `name` and `description` fields. However, the service layer and other parts of the codebase still treat these as strings.

---

## Critical Issues Found

### 1. MenuService.js - Name Access Issues

#### Lines with Direct `.name` Access:
These need to be updated to handle localized text:

1. **Line 191**: `name: item.customName || menu.name`
   - **Issue**: `menu.name` is now `{en, am}`
   - **Fix**: `name: item.customName || menu.name?.en || menu.name`

2. **Line 231**: `name: i.name`
   - **Issue**: `i.name` might be localized object
   - **Fix**: Ensure proper extraction of English name

3. **Line 371**: `name: name.trim()`
   - **Issue**: `name` param might be an object now
   - **Fix**: Handle both string (legacy) and object formats

4. **Line 504**: `name: i.customName || i.menu.name`
   - **Issue**: `i.menu.name` is localized
   - **Fix**: Extract English name

5. **Line 556**: `name: menuItem.name`
   - **Issue**: Returns localized object instead of string
   - **Fix**: Extract appropriate language

6. **Line 673**: `name: itemEntry.customName || menu.name`
   - **Issue**: `menu.name` is localized
   - **Fix**: Extract English name

7. **Line 901**: `const menuMap = Object.fromEntries(menus.map(m => [m._id.toString(), m.name]))`
   - **Issue**: `m.name` is localized object
   - **Fix**: Extract English name for fallback

### 2. Search Functionality

#### Line 271: `.search(['name', 'description', 'category'])`
- **Issue**: ApiFeatures searches for `name` as string
- **Fix**: Update to search `name.en` and `name.am`

#### Line 744: `.search(['name', 'description'])`
- **Same issue for menu groups**

### 3. Select Statements

#### Line 167: `select: 'name description image...'`
- Will work but returns localized objects

#### Line 739: `select: 'name image variants...'`
- Same - returns localized

#### Line 795: `select: 'name image type variants...'`
- Same

#### Line 899: `.select('name')`
- Returns localized object

#### Line 961: `.populate('items.menuItem', 'name image...')`
- Returns localized

---

## Recommended Solution

### Option 1: Add Helper Functions (Recommended)

Create helper utilities to extract localized text:

```javascript
// utils/localization-helper.js

/**
 * Get localized text value
 * @param {Object|String} field - Localized object or legacy string
 * @param {String} language - Language code ('en' or 'am')
 * @returns {String} - Extracted text
 */
function getLocalizedText(field, language = 'en') {
  if (!field) return '';
  
  // Legacy string format
  if (typeof field === 'string') return field;
  
  // New localized format
  if (typeof field === 'object') {
    return field[language] || field.en || '';
  }
  
  return '';
}

/**
 * Get menu name in specified language
 * @param {Object} menu - Menu document
 * @param {String} language - Language code
 * @returns {String}
 */
function getMenuName(menu, language = 'en') {
  if (!menu) return '';
  return getLocalizedText(menu.name, language);
}

/**
 * Get menu description in specified language
 * @param {Object} menu - Menu document
 * @param {String} language - Language code
 * @returns {String}
 */
function getMenuDescription(menu, language = 'en') {
  if (!menu) return '';
  return getLocalizedText(menu.description, language);
}

module.exports = {
  getLocalizedText,
  getMenuName,
  getMenuDescription,
};
```

### Option 2: Virtual Field on Model

Add a virtual to Menu model for backward compatibility:

```javascript
// In menuModel.js

menuSchema.virtual('nameText').get(function() {
  if (typeof this.name === 'string') return this.name;
  return this.name?.en || '';
});

menuSchema.virtual('descriptionText').get(function() {
  if (typeof this.description === 'string') return this.description;
  return this.description?.en || '';
});
```

---

## Required Updates by File

### 1. MenuService.js

```javascript
// Add at top
const { getLocalizedText, getMenuName, getMenuDescription } = require('../../../utils/localization-helper');

// Update all name accesses:

// Line 191
name: item.customName || getMenuName(menu),

// Line 231  
name: getLocalizedText(i.name),

// Line 371 - Update createNewMenu
// Handle both formats
let menuName;
if (typeof name === 'string') {
  // Legacy string - convert to localized
  menuName = { en: name.trim() };
} else if (typeof name === 'object') {
  // Already localized
  menuName = name;
} else {
  throw new AppError('Invalid name format', 400);
}

const menuDataToCreate = {
  merchant: merchantId,
  name: menuName,
  // ...
};

// Line 504
name: i.customName || getMenuName(i.menu),

// Line 556
name: getMenuName(menuItem),

// Line 673
name: itemEntry.customName || getMenuName(menu),

// Line 901
const menuMap = Object.fromEntries(
  menus.map(m => [m._id.toString(), getMenuName(m)])
);
```

### 2. ApiFeatures Update

Update search to handle localized fields:

```javascript
// In apiFeatures.js - search method
search(fieldsArr = []) {
  if (this.queryString.search) {
    const searchRegex = new RegExp(this.queryString.search, 'i');
    
    // Handle localized fields
    const searchConditions = fieldsArr.flatMap(field => {
      if (field === 'name' || field === 'description') {
        return [
          { [`${field}.en`]: searchRegex },
          { [`${field}.am`]: searchRegex }
        ];
      }
      return [{ [field]: searchRegex }];
    });
    
    this.query = this.query.find({ $or: searchConditions });
  }
  
  return this;
}
```

### 3. Menu Controller

Check if controller accesses name directly and update similarly.

### 4. Order/Kitchen Services

Any service that displays menu names needs updates:
- `OrderService.js`
- `KitchenTicketService.js`
- Any email templates that show menu names

---

## Migration Strategy

### Phase 1: Add Helper Functions ✅
1. Create `utils/localization-helper.js`
2. Add unit tests for helper functions

### Phase 2: Update MenuService ⏳
1. Import helper functions
2. Update all `.name` accesses to use `getMenuName()`
3. Update all `.description` accesses to use `getMenuDescription()`
4. Update `createNewMenu` to handle both formats
5. Update search to handle localized fields

### Phase 3: Update Related Services ⏳
1. OrderService
2. KitchenTicketService  
3. Email templates
4. Any reports that show menu names

### Phase 4: Update Controller ⏳
1. Check menu.controller.js for direct name access
2. Update response formatting if needed

### Phase 5: Update Tests ⏳
1. Update test data to use localized format
2. Update assertions to check localized structure
3. Test both legacy and new formats

### Phase 6: Data Migration ⏳
1. Create migration script to convert existing string names to localized objects
2. Run on staging environment
3. Verify all functionality works
4. Run on production

---

## Testing Checklist

- [ ] Create menu with localized name
- [ ] Create menu with English name only
- [ ] Update menu name (both languages)
- [ ] Search for menu by English name
- [ ] Search for menu by Amharic name
- [ ] Get public menu (displays correct language)
- [ ] Get staff menu (displays correct language)
- [ ] View menu in order
- [ ] View menu in kitchen ticket
- [ ] Menu group displays with correct names
- [ ] Combo displays with correct menu names
- [ ] Toggle availability shows correct name
- [ ] Menu reports show correct names

---

## Priority Actions

### HIGH PRIORITY (Do First):
1. ✅ Create localization helper utilities
2. ⏳ Update MenuService.createNewMenu to handle both formats
3. ⏳ Update MenuService to use helpers for all name displays
4. ⏳ Update ApiFeatures search for localized fields

### MEDIUM PRIORITY:
5. ⏳ Update menu controller
6. ⏳ Update related services (Order, Kitchen)
7. ⏳ Update tests

### LOW PRIORITY:
8. ⏳ Data migration script
9. ⏳ Remove legacy string format support

---

## Notes

- **Backward Compatibility**: Helper functions handle both string (legacy) and object (new) formats
- **Default Language**: English (`en`) is used as fallback
- **API Changes**: Response structure changes - frontend needs updates
- **Breaking Change**: This is a breaking change that requires coordinated frontend updates

---

## Related Files

- `models/menuModel.js` - ✅ Updated
- `src/modules/menu/validators/menu.validators.js` - ✅ Updated
- `src/modules/menu/service/MenuService.js` - ⏳ Needs updates
- `src/modules/menu/controller/menu.controller.js` - ⏳ Needs checking
- `utils/apiFeatures.js` - ⏳ Needs search update
- `src/modules/order/service/OrderService.js` - ⏳ Needs checking
- `src/modules/kitchen/service/KitchenTicketService.js` - ⏳ Needs checking

---

## Estimated Effort

- Helper functions: 30 minutes
- MenuService updates: 2 hours
- Controller updates: 1 hour
- Related services: 2 hours
- Test updates: 2 hours
- Migration script: 1 hour
- **Total: ~8 hours**

---

## Next Steps

1. Create the localization helper utility file
2. Update MenuService with helper functions
3. Test create/update/get operations
4. Update ApiFeatures search
5. Test search functionality
6. Update related services
7. Update tests
8. Create data migration script
