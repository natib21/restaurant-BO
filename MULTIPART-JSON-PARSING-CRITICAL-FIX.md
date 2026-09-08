# Critical Fix: Multipart JSON Parsing Whitelist

## Problem

**Error**: `Invalid JSON format for field "name": Unexpected token 'B', "Beef Steak" is not valid JSON`

## Root Cause

The `parseMultipartJsonFields()` helper was attempting to JSON.parse **ALL fields** in its whitelist, including:
- ❌ `name` - Plain string sent by frontend as `"Beef Steak"` (NOT JSON)
- ❌ `description` - Plain string (NOT JSON)

These fields should **never** be parsed - they're sent as plain strings directly from the frontend.

## The Confusion

### What Frontend Sends:

```javascript
// Plain strings - sent directly
formData.append('name', 'Beef Steak');  // ← Plain string
formData.append('nameAm', 'የበሬ ስቴክ');   // ← Plain string
formData.append('description', '300g premium ribeye...'); // ← Plain string

// Structured data - JSON stringified BEFORE appending
formData.append('variants', JSON.stringify([{name: "Regular", price: 200}])); // ← JSON string
formData.append('ingredients', JSON.stringify(["water", "coffee"])); // ← JSON string
formData.append('tags', JSON.stringify(["chef-special", "trending"])); // ← JSON string
```

### What Backend Should Parse:

**ONLY** the fields that were JSON-stringified by the frontend:
- ✅ `variants` - Array of objects
- ✅ `ingredients` - Array of strings
- ✅ `allergens` - Array of strings
- ✅ `tags` - Array of strings

**NEVER** parse these (they're already plain strings):
- ❌ `name` - Plain string
- ❌ `nameAm` - Plain string
- ❌ `description` - Plain string
- ❌ `descriptionAm` - Plain string
- ❌ `type` - Plain string
- ❌ `categoryId` - Plain string
- ❌ `price` - Number (as string)
- ❌ Any other primitive field

## Fix Applied

### Menu Controller (CREATE + UPDATE)

**Before** (WRONG):
```javascript
const parsedBody = parseMultipartJsonFields(req.body, [
  'variants',
  'ingredients',
  'allergens',
  'tags',
  'name', // ← WRONG! Plain string, not JSON
  'description', // ← WRONG! Plain string, not JSON
]);
```

**After** (CORRECT):
```javascript
const parsedBody = parseMultipartJsonFields(req.body, [
  'variants',      // ✅ JSON array
  'ingredients',   // ✅ JSON array
  'allergens',     // ✅ JSON array
  'tags',          // ✅ JSON array
]);
// name, description, etc. pass through untouched as plain strings
```

### Combo Controller (CREATE + UPDATE)

**Before** (WRONG):
```javascript
const parsedBody = parseMultipartJsonFields(req.body, [
  'items',
  'tags',
  'branchOverrides',
  'name', // ← WRONG!
  'description', // ← WRONG!
  'branches',
  'availableOnDays',
  'timeSlots',
]);
```

**After** (CORRECT):
```javascript
const parsedBody = parseMultipartJsonFields(req.body, [
  'items',             // ✅ JSON array
  'tags',              // ✅ JSON array
  'branchOverrides',   // ✅ JSON array
  'branches',          // ✅ JSON array
  'availableOnDays',   // ✅ JSON array
  'timeSlots',         // ✅ JSON array
]);
// name, description pass through untouched
```

## Files Fixed

1. ✅ `src/modules/menu/controller/menu.controller.js`
   - Fixed CREATE handler (`exports.createNewMenu`)
   - Fixed UPDATE handler (`exports.updateMenu`)

2. ✅ `src/modules/menu/controller/combo.controller.js`
   - Fixed CREATE handler (`exports.createCombo`)
   - Fixed UPDATE handler (`exports.updateCombo`)

## Testing

### Test Payload (from actual request):
```
name: "Beef Steak"                    ← Plain string
nameAm: "የበሬ ስቴክ"                     ← Plain string
description: "300g premium ribeye..." ← Plain string
descriptionAm: "300 ግራም..."          ← Plain string
variants: '[{"name":"Regular","price":200,...}]'   ← JSON string
ingredients: '["water","coffee"]'                   ← JSON string
allergens: '["gluten","dairy","nuts"]'              ← JSON string
tags: '["chef-special","trending"]'                 ← JSON string
image: (binary)
```

### Expected Result (AFTER FIX):
```javascript
parsedBody = {
  name: "Beef Steak",                              // ✅ Plain string (untouched)
  nameAm: "የበሬ ስቴክ",                               // ✅ Plain string (untouched)
  description: "300g premium ribeye...",           // ✅ Plain string (untouched)
  descriptionAm: "300 ግራም...",                    // ✅ Plain string (untouched)
  variants: [{name: "Regular", price: 200, ...}],  // ✅ Parsed to array
  ingredients: ["water", "coffee"],                 // ✅ Parsed to array
  allergens: ["gluten", "dairy", "nuts"],          // ✅ Parsed to array
  tags: ["chef-special", "trending"],              // ✅ Parsed to array
  // ... other plain fields untouched
}
```

## Rule

**The whitelist passed to `parseMultipartJsonFields()` must ONLY contain fields that:**
1. Are arrays or objects (not primitives)
2. Are actually JSON-stringified by the frontend before being appended to FormData

**Never include:**
- Plain text fields (`name`, `description`, `type`, etc.)
- Primitive fields (`price`, `available`, `inStock`, etc.)
- Fields that are sent directly without JSON.stringify()

## Date Fixed
2026-08-22 (Critical fix after initial multipart parsing implementation)

## Status
✅ **FIXED** - Ready for testing with PATCH /api/v1/menu/:id
