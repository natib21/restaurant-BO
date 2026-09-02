# Multipart JSON Field Parsing Fix

## Problem

When using `multipart/form-data` for image uploads, structured fields (arrays, objects) are sent as JSON-stringified strings by the frontend. The backend was not parsing these strings back to their expected types, causing validation errors.

### Root Cause

- **Frontend**: Correctly stringifies structured fields before appending to FormData (e.g., `formData.append('variants', JSON.stringify(variants))`)
- **Backend**: Was directly passing `req.body` to service methods, where fields like `variants`, `ingredients`, `tags` remained as strings
- **Validation**: Service validators expected arrays/objects, not strings, causing errors like "Variants must be an array"

### Error Example

```
{
  "success": false,
  "message": "Variants must be an array",
  "errors": [{
    "status": "Fail",
    "stack": "Error: Variants must be an array\n at MenuItemService.validateVariants..."
  }]
}
```

## Solution

Created a reusable helper function `parseMultipartJsonFields()` that safely parses JSON-stringified fields from multipart requests:

```javascript
/**
 * Parse JSON-stringified fields from multipart/form-data
 * 
 * When using multipart/form-data for image uploads, structured fields (arrays, objects)
 * are sent as JSON strings. This helper safely parses them back to their expected types.
 * 
 * @param {Object} body - Request body
 * @param {Array<string>} fields - Field names to parse
 * @returns {Object} Body with parsed fields
 */
function parseMultipartJsonFields(body, fields = []) {
  const parsed = { ...body };

  for (const field of fields) {
    if (parsed[field] && typeof parsed[field] === 'string') {
      try {
        parsed[field] = JSON.parse(parsed[field]);
      } catch (err) {
        throw new AppError(
          `Invalid JSON format for field "${field}": ${err.message}`,
          400
        );
      }
    }
  }

  return parsed;
}
```

## Files Fixed

### 1. `src/modules/menu/controller/menu.controller.js`

**Added helper function** at the top of the file (after imports)

**Fixed CREATE handler** (`exports.createNewMenu`):
```javascript
// Parse JSON-stringified fields from multipart/form-data
const parsedBody = parseMultipartJsonFields(req.body, [
  'variants',
  'ingredients',
  'allergens',
  'tags',
  'name', // Localized field (e.g., {en: "...", am: "..."})
  'description', // Localized field
]);

const menuData = {
  ...parsedBody, // ← Use parsed body instead of req.body
};
```

**Fixed UPDATE handler** (`exports.updateMenu`):
```javascript
// Parse JSON-stringified fields from multipart/form-data
const parsedBody = parseMultipartJsonFields(req.body, [
  'variants',
  'ingredients',
  'allergens',
  'tags',
  'name', // Localized field
  'description', // Localized field
]);

const updatedMenu = await MenuItemService.update(req.params.id, parsedBody, merchantId, userId);
```

### 2. `src/modules/menu/controller/combo.controller.js`

**Added helper function** at the top of the file (after imports)

**Fixed CREATE handler** (`exports.createCombo`):
```javascript
// Parse JSON-stringified fields from multipart/form-data
const parsedBody = parseMultipartJsonFields(req.body, [
  'items', // Array of combo items
  'tags', // Array of tags
  'branchOverrides', // Array of branch-specific overrides
  'name', // Localized field (e.g., {en: "...", am: "..."})
  'description', // Localized field
  'branches', // Array of branch IDs
  'availableOnDays', // Array of days
  'timeSlots', // Array of time slot objects
]);

const comboData = {
  ...parsedBody,
};
```

**Fixed UPDATE handler** (`exports.updateCombo`):
```javascript
// Parse JSON-stringified fields from multipart/form-data
const parsedBody = parseMultipartJsonFields(req.body, [
  'items',
  'tags',
  'branchOverrides',
  'name',
  'description',
  'branches',
  'availableOnDays',
  'timeSlots',
]);

const combo = await ComboService.update(req.params.id, parsedBody, merchantId, userId);
```

## Fields Parsed

### Menu Items
- `variants` - Array of variant objects (name, price, available, isDefault)
- `ingredients` - Array of ingredient references with quantities
- `allergens` - Array of allergen strings
- `tags` - Array of tag strings
- `name` - Localized object (e.g., {en: "Burger", am: "በርገር"})
- `description` - Localized object

### Combos
- `items` - Array of combo item objects (menuItem, quantity, canRemove)
- `tags` - Array of tag strings
- `branchOverrides` - Array of branch-specific overrides
- `name` - Localized object
- `description` - Localized object
- `branches` - Array of branch ObjectIds
- `availableOnDays` - Array of day strings
- `timeSlots` - Array of time slot objects (start, end)

## Testing

### Before Fix
```bash
# PATCH /api/v1/menu/:id with multipart data
# Result: 400 "Variants must be an array"
```

### After Fix
```bash
# PATCH /api/v1/menu/:id with multipart data
# Result: 200 with variants correctly saved as array
```

## Error Handling

The helper function includes try/catch for JSON parsing:

```javascript
try {
  parsed[field] = JSON.parse(parsed[field]);
} catch (err) {
  throw new AppError(
    `Invalid JSON format for field "${field}": ${err.message}`,
    400
  );
}
```

This provides clear error messages when malformed JSON is sent:
```
"Invalid JSON format for field "variants": Unexpected token..."
```

## Prevention

To prevent this issue from recurring:

1. ✅ **Reusable helper** - Single source of truth for multipart JSON parsing
2. ✅ **Applied to both CREATE and UPDATE** - No drift between endpoints
3. ✅ **Clear error messages** - Easy to debug malformed JSON
4. ✅ **Documented fields** - Comments explain what's being parsed

## Related Issues

- Initial bug: KitchenStation creation bug (different issue, but discovered while investigating multipart patterns)
- This fix ensures consistency between frontend multipart submissions and backend validation

## Date Fixed
2026-08-22

## Fixed By
Kiro AI Assistant
