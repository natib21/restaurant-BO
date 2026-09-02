# PaymentVerification Schema Update - CBEBirr PDF Support

## Status: ✅ COMPLETE - Restart Required

## Summary
Updated `models/PaymentVerification.js` to support new enum values for PDF receipt handling.

## Changes Made

### File: models/PaymentVerification.js

#### 1. verificationType Enum - Added 2 new values
```javascript
// BEFORE
enum: ['manual_entry_auto_lookup', 'manual_entry_lookup_failed', 'qr_scan']

// AFTER
enum: [
  'manual_entry_auto_lookup', 
  'manual_entry_lookup_failed', 
  'manual_entry_pdf_downloaded',  // ✨ NEW - CBEBirr manual entry
  'qr_scan',
  'qr_scan_pdf_downloaded',       // ✨ NEW - CBEBirr QR scan
]
```

#### 2. parseQuality Enum - Added 1 new value
```javascript
// BEFORE
enum: ['high', 'medium', 'low', 'failed']

// AFTER
enum: [
  'high', 
  'medium', 
  'low', 
  'failed',
  'pdf_manual_review_required',  // ✨ NEW - PDF receipts
]
```

## Why These Changes?

### Problem
CBEBirr returns PDF receipts, not HTML. The code was updated to handle PDFs, but the schema didn't allow the new enum values, causing validation errors:

```
ValidationError: verificationType: `manual_entry_pdf_downloaded` is not a valid enum value
ValidationError: parseQuality: `pdf_manual_review_required` is not a valid enum value
```

### Solution
Added new enum values to properly categorize and track PDF-based verifications.

## Usage

### manual_entry_pdf_downloaded
Used when staff manually enters TID + phone and receives a PDF receipt:
```javascript
{
  verificationType: 'manual_entry_pdf_downloaded',
  parseQuality: 'pdf_manual_review_required',
  pdfDownloaded: true,
  receiptFileRef: ObjectId('...')
}
```

### qr_scan_pdf_downloaded
Used when staff scans QR code and receives a PDF receipt:
```javascript
{
  verificationType: 'qr_scan_pdf_downloaded',
  parseQuality: 'pdf_manual_review_required',
  pdfDownloaded: true,
  receiptFileRef: ObjectId('...')
}
```

### pdf_manual_review_required
Indicates the receipt is a PDF that cannot be automatically parsed:
```javascript
{
  parseQuality: 'pdf_manual_review_required',
  status: 'pending_review',
  lookupError: 'PDF receipt downloaded - requires manual review'
}
```

## Deployment Steps

### Step 1: Verify Changes
```bash
# Check the model file
cat models/PaymentVerification.js | grep -A 5 "verificationType"
cat models/PaymentVerification.js | grep -A 5 "parseQuality"
```

### Step 2: Restart Server
```bash
# Stop server (Ctrl+C or kill process)

# Start server
npm run dev
# or
npm start
```

### Step 3: Verify Schema Loaded
Check server logs for:
- ✅ No Mongoose schema errors
- ✅ Server starts successfully
- ✅ No validation warnings

### Step 4: Test with CBEBirr
```bash
# Test manual entry
curl -X POST http://localhost:8000/api/v1/payment-verification/initiate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER_ID",
    "provider": "cbebirr",
    "receiptNumber": "DHT71MPGDI7"
  }'

# Expected: 201 Created (no validation error)
```

## Backward Compatibility

✅ **Fully backward compatible**
- Existing enum values unchanged
- Existing verification records remain valid
- No data migration required
- Other providers (Telebirr, CBE) unaffected

## Rollback

If issues occur, revert the schema changes:

```javascript
// Revert verificationType
enum: ['manual_entry_auto_lookup', 'manual_entry_lookup_failed', 'qr_scan']

// Revert parseQuality
enum: ['high', 'medium', 'low', 'failed']
```

Then restart server. CBEBirr PDF handling will fail gracefully with validation errors.

## Verification Checklist

After restart, verify:
- [ ] Server starts without schema errors
- [ ] CBEBirr manual entry works
- [ ] CBEBirr QR scan works
- [ ] PDF is downloaded and stored
- [ ] Verification record created successfully
- [ ] FileAsset linked correctly
- [ ] Other providers still work (Telebirr, CBE)

## Related Changes

This schema update is part of the CBEBirr PDF fix. See also:
- **CBEBIRR-PDF-FIX-COMPLETE.md** - Full technical documentation
- **CHANGES-CBEBIRR-PDF.md** - Complete change log
- **BaseProvider.js** - PDF detection
- **CBEBirrProvider.js** - PDF handling
- **PaymentVerificationService.js** - PDF storage

---

**Updated**: January 2025  
**Status**: ✅ Complete - Restart Required  
**Breaking Changes**: None
