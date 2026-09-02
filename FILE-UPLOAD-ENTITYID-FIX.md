# File Upload EntityId Validation Fix

## Problem

Frontend was sending invalid `entityId` value causing validation error:

```json
{
  "file": "(binary)",
  "entityType": "order_payment",
  "entityId": "manual-order",  // ❌ Not a valid ObjectId
  "purpose": "receipt"
}
```

**Error:**
```
FileAsset validation failed: entityId: Cast to ObjectId failed for value "manual-order" 
(type string) at path "entityId" because of "BSONError"
```

## Root Cause

The FileAsset schema expects `entityId` to be either:
- A valid MongoDB ObjectId (24-character hex string)
- `null` (default value)

When frontend sends an invalid string like `"manual-order"`, Mongoose tries to cast it to ObjectId and fails.

## Solution

Updated `/src/modules/files/file.controller.js` to validate and sanitize `entityId` before saving:

```javascript
// ✅ Validate entityId - must be valid ObjectId or null
let validatedEntityId = null;
if (entityId) {
  if (mongoose.Types.ObjectId.isValid(entityId)) {
    validatedEntityId = entityId;
  } else {
    // If not a valid ObjectId, set to null
    validatedEntityId = null;
  }
}

const file = await FileManagementService.registerUpload({
  // ...
  entityId: validatedEntityId, // ← Always valid ObjectId or null
  // ...
});
```

## Changes Made

### 1. **Backend Fix** ✅

**File:** `src/modules/files/file.controller.js`

**Changes:**
- Added `mongoose` import for ObjectId validation
- Added validation logic to check if `entityId` is a valid ObjectId
- Invalid values are converted to `null` (which is acceptable)
- Valid ObjectIds are passed through unchanged

### 2. **Frontend Documentation Update** ✅

**File:** `FRONTEND-DEVELOPER-PROMPT.md`

**Changes:**
- Updated `uploadReceipt()` to validate ObjectId format before sending
- Added regex check: `/^[0-9a-fA-F]{24}$/`
- Clarified that invalid entityId values will be omitted

```typescript
async uploadReceipt(file: File, orderId?: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('entityType', 'order_payment');
  
  // Only include entityId if it's a valid ObjectId
  if (orderId && /^[0-9a-fA-F]{24}$/.test(orderId)) {
    formData.append('entityId', orderId);
  }
  // If invalid, omit it - backend will set to null
  
  formData.append('purpose', 'receipt');
  // ...
}
```

### 3. **Test Created** ✅

**File:** `tests/file-upload-entityid-fix.test.js`

**Test Cases:**
- ✅ Valid ObjectId entityId accepted
- ✅ Invalid string entityId converted to null
- ✅ Missing entityId set to null
- ✅ Missing entityType rejected (400)
- ✅ Non-image files rejected (400)
- ✅ Large files rejected (>8MB)
- ✅ Database storage with null entityId

## Validation Logic

```javascript
mongoose.Types.ObjectId.isValid(value)
```

**Returns `true` for:**
- `"507f1f77bcf86cd799439011"` (24-char hex)
- `new mongoose.Types.ObjectId()`

**Returns `false` for:**
- `"manual-order"` (invalid format)
- `"123"` (too short)
- `undefined`
- `null`

## Behavior Changes

### Before Fix ❌

| Frontend Input | Backend Result |
|---------------|----------------|
| Valid ObjectId | ✅ Stored as ObjectId |
| `"manual-order"` | ❌ 500 Error (BSONError) |
| Missing | ✅ Stored as null |

### After Fix ✅

| Frontend Input | Backend Result |
|---------------|----------------|
| Valid ObjectId | ✅ Stored as ObjectId |
| `"manual-order"` | ✅ Stored as null |
| Missing | ✅ Stored as null |

## API Endpoint Updated

### `POST /api/v1/files/upload`

**Request (multipart/form-data):**
```
file: (binary image file)
entityType: order_payment (required)
entityId: <valid-objectid> (optional, validated)
purpose: receipt
```

**Validation Rules:**
1. `file` must be present
2. `file` must be an image (mimetype: `image/*`)
3. `file` size ≤ 8MB
4. `entityType` must be provided (required)
5. `entityId` must be valid ObjectId OR will be set to null

**Success Response (201):**
```json
{
  "status": "success",
  "data": {
    "file": {
      "_id": "507f1f77bcf86cd799439011",
      "url": "/api/v1/files/507f1f77bcf86cd799439011/content",
      "entityType": "order_payment",
      "entityId": null,
      "purpose": "receipt"
    }
  }
}
```

## Frontend Integration

### Option 1: Send Valid ObjectId Only (Recommended)

```javascript
// ✅ Only send if valid
const orderId = order._id; // Real MongoDB ObjectId
const photoId = await api.uploadReceipt(photoFile, orderId);
```

### Option 2: Let Backend Handle Invalid Values

```javascript
// ✅ Backend will convert invalid to null
const orderId = "manual-order"; // Invalid
const photoId = await api.uploadReceipt(photoFile, orderId);
// Backend stores with entityId = null
```

### Option 3: Validate on Frontend (Best Practice)

```javascript
// ✅ Validate before sending
const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(orderId);
const validId = isValidObjectId ? orderId : undefined;
const photoId = await api.uploadReceipt(photoFile, validId);
```

## Testing

### Manual Test

```bash
# Test with invalid entityId (should now work)
curl -X POST http://localhost:3000/api/v1/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@receipt.jpg" \
  -F "entityType=order_payment" \
  -F "entityId=manual-order" \
  -F "purpose=receipt"

# Expected: 201 Created (entityId stored as null)
```

### Automated Test

```bash
npm test -- tests/file-upload-entityid-fix.test.js
```

## Impact

### What's Fixed ✅
- ✅ Frontend can send any `entityId` value without causing 500 errors
- ✅ Invalid values are gracefully converted to `null`
- ✅ File uploads work for testing with placeholder values
- ✅ Backend validation prevents database corruption

### What's Not Changed ✅
- ✅ Valid ObjectId values still work as before
- ✅ File storage and retrieval unchanged
- ✅ Authentication and authorization unchanged
- ✅ Other API endpoints unaffected

### Backward Compatibility ✅
- ✅ Existing valid requests work identically
- ✅ No breaking changes to API contract
- ✅ Only difference: invalid values don't crash (stored as null instead)

## Recommendations for Frontend

### For Testing
```javascript
// ✅ Use placeholder for testing without real order
const photoId = await api.uploadReceipt(photoFile); // No orderId
```

### For Production
```javascript
// ✅ Always use real order ObjectId
const order = await createOrder(...);
const photoId = await api.uploadReceipt(photoFile, order._id);
```

### For Payment Verification
```javascript
// ✅ Full workflow
async function verifyPayment(orderId, receiptPhoto) {
  // 1. Upload photo (linked to order)
  const photoId = await api.uploadReceipt(receiptPhoto, orderId);
  
  // 2. Initiate verification
  const verification = await api.initiate(orderId, 'telebirr', 'DB80L94QPK');
  
  // 3. Confirm with photo
  await api.confirm(verification._id, photoId);
}
```

## Security Considerations

### No Security Impact ✅

The validation change does not introduce security vulnerabilities:

1. **Authorization:** Still enforced at middleware level
2. **Tenant Isolation:** Merchant ID still required and validated
3. **File Access:** Still controlled by authentication
4. **SQL Injection:** Not applicable (MongoDB, no raw queries)
5. **Path Traversal:** Prevented by storage adapter

### What We're NOT Doing ❌

We're **not** storing arbitrary strings in the database:
- Invalid values → `null` (not stored as-is)
- Valid ObjectIds → stored as ObjectId type
- No risk of data corruption

## Summary

**Problem:** Frontend sending invalid `entityId` caused 500 errors  
**Solution:** Backend validates and converts invalid values to `null`  
**Result:** File uploads now work with any `entityId` value  
**Impact:** Zero breaking changes, backward compatible  

**Status:** ✅ **FIXED** and ready for testing
