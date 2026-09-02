# CBEBirr PDF Receipt Fix - Complete

## Problem Summary

The CBEBirr receipt endpoint at `https://cbepay1.cbe.com.et/aureceipt` returns a **PDF document**, not HTML. The response:
- Content-Type: `application/pdf`
- Starts with: `%PDF-1.6`

The previous implementation incorrectly:
1. Treated the response as HTML text
2. Attempted to parse it with Cheerio (HTML parser)
3. Failed to download and store the PDF properly

## Solution Implemented

### 1. Updated BaseProvider.fetchReceipt() 
**File**: `src/modules/payment-verification/service/providers/BaseProvider.js`

**Changes**:
- Now detects content type from response headers
- Handles PDF responses as binary buffers, not text
- Validates PDF magic bytes (`%PDF-`)
- Returns structured object: `{ content, contentType, isPdf }`

```javascript
// Before
const html = await response.text();
return html;

// After  
const contentType = response.headers.get('content-type') || '';
const isPdf = contentType.includes('application/pdf');

if (isPdf) {
  const arrayBuffer = await response.arrayBuffer();
  content = Buffer.from(arrayBuffer);
  
  // Validate PDF magic bytes
  const header = content.slice(0, 5).toString('utf-8');
  if (header !== '%PDF-') {
    throw new Error('Response claims to be PDF but does not have PDF magic bytes');
  }
} else {
  content = await response.text();
}

return { content, contentType, isPdf };
```

### 2. Updated CBEBirrProvider.verify()
**File**: `src/modules/payment-verification/service/providers/CBEBirrProvider.js`

**Changes**:
- Removed HTML parsing logic (no longer uses `parseCBEBirrHTML`)
- Now expects and handles PDF responses
- Validates PDF format
- Returns PDF buffer for storage
- Sets `parseQuality: 'pdf_manual_review_required'` since PDFs cannot be auto-parsed
- Deprecated `verifyWithPDF()` method (PDF is now default)

```javascript
// Fetch receipt - CBEBirr returns PDF, not HTML
const { content: pdfBuffer, contentType, isPdf } = await this.fetchReceipt(url);

if (!isPdf) {
  throw new Error(`Expected PDF response but got ${contentType}`);
}

// Validate PDF
validatePDF(pdfBuffer, contentType);

return {
  reference: tid,
  parsed: {
    // Cannot auto-extract from PDF - requires manual review
    amount: null,
    currency: 'ETB',
    status: 'UNKNOWN',
    fullRawText: `[PDF Receipt: ${pdfBuffer.length} bytes]`,
  },
  amountMatch: false,
  parseQuality: 'pdf_manual_review_required',
  verificationType: 'manual_entry_pdf_downloaded',
  pdfBuffer,
  pdfDownloaded: true,
};
```

### 3. Updated PaymentVerificationService
**File**: `src/modules/payment-verification/service/PaymentVerificationService.js`

**Changes in `initiateManualVerification()`**:
- Added transaction support for PDF storage
- Checks for `result.pdfBuffer` and saves it as FileAsset
- Handles new `parseQuality: 'pdf_manual_review_required'`
- Links PDF FileAsset to verification record

```javascript
// Start transaction for optional PDF storage
const session = await mongoose.startSession();
session.startTransaction();

try {
  let pdfFileAsset = null;
  
  // Store PDF if downloaded (e.g., CBEBirr)
  if (result.pdfDownloaded && result.pdfBuffer) {
    pdfFileAsset = await savePDFAsFileAsset(
      result.pdfBuffer,
      {
        merchantId,
        orderId,
        provider,
        referenceId: cleanedReceiptNo,
        uploadedBy: userId,
      },
      session
    );
  }
  
  // Create verification with PDF reference
  const verification = await PaymentVerificationRepository.create([{
    // ... other fields
    receiptFileRef: pdfFileAsset ? pdfFileAsset._id : null,
  }], { session });
  
  await session.commitTransaction();
}
```

### 4. Updated QR Parser
**File**: `src/modules/payment-verification/utils/qr-parser.js`

**Changes**:
- Removed `constructCBEBirrPdfURL()` - no longer needed
- Updated documentation to note that CBEBirr URL returns PDF directly

### 5. Obsolete Files
**File**: `src/modules/payment-verification/service/providers/parsers/cbebirr-parser.js`

This HTML parser is now obsolete since CBEBirr returns PDF. Can be deleted or archived.

## How It Works Now

### Manual Entry Flow (TID + Phone)
1. User enters TID and phone number manually
2. Backend validates format and constructs URL
3. `CBEBirrProvider.verify()` fetches the URL
4. Response is detected as PDF (Content-Type header)
5. PDF is validated (magic bytes, size limits)
6. PDF buffer is returned in verification result
7. `PaymentVerificationService` saves PDF as FileAsset
8. Verification record created with status `pending_review` and `parseQuality: 'pdf_manual_review_required'`
9. Staff reviews the downloaded PDF and confirms/rejects

### QR Scan Flow
1. User scans QR code containing URL with TID and phone
2. Backend extracts and validates TID and phone from URL
3. Same process as manual entry follows
4. PDF is automatically downloaded and stored

## Verification Status Flow

For CBEBirr receipts:
- **parseQuality**: `'pdf_manual_review_required'`
- **status**: `'pending_review'`
- **amountMatch**: `false` (cannot auto-verify from PDF)
- **lookupError**: `'PDF receipt downloaded - requires manual review'`

Staff must:
1. View the downloaded PDF receipt
2. Manually verify amount, status, and transaction details
3. Confirm or reject the verification

## Testing Recommendations

### Unit Tests
```javascript
describe('CBEBirr PDF Handling', () => {
  it('should detect PDF response', async () => {
    const mockPdfBuffer = Buffer.from('%PDF-1.6\n...');
    // Mock fetch to return PDF
    // Call verify()
    // Assert pdfBuffer is returned
  });
  
  it('should validate PDF magic bytes', async () => {
    const fakePdfBuffer = Buffer.from('<!DOCTYPE html>');
    // Should throw error about invalid PDF
  });
  
  it('should store PDF as FileAsset', async () => {
    // Mock verification with PDF
    // Assert FileAsset is created
    // Assert verification.receiptFileRef is set
  });
});
```

### Integration Tests
1. Test with real CBEBirr URL (if available in test environment)
2. Verify PDF is downloaded and stored correctly
3. Verify file size and format
4. Test staff can view the PDF from verification record

## Security Considerations

✅ **Maintained**:
- SSRF protection (whitelisted hosts only)
- TLS validation (no bypass)
- Input validation (TID and phone format)
- PDF size limits (10 MB max)
- PDF magic byte validation

✅ **Improved**:
- Proper binary handling (no text corruption)
- Transaction-safe PDF storage
- Content-Type validation

## API Response Changes

### Before (Expected HTML parsing)
```json
{
  "parsed": {
    "amount": 150.00,
    "status": "COMPLETED",
    "payerName": "John Doe"
  },
  "parseQuality": "high",
  "amountMatch": true
}
```

### After (PDF download)
```json
{
  "parsed": {
    "amount": null,
    "currency": "ETB",
    "status": "UNKNOWN",
    "fullRawText": "[PDF Receipt: 24576 bytes]"
  },
  "parseQuality": "pdf_manual_review_required",
  "amountMatch": false,
  "pdfDownloaded": true,
  "receiptFileRef": "64f5a1b2c3d4e5f6a7b8c9d0"
}
```

## Future Enhancements

1. **PDF Text Extraction**: Use libraries like `pdf-parse` to extract text from PDF
2. **OCR**: If PDF is image-based, use OCR to read transaction details
3. **Auto-parsing**: Pattern matching on extracted text to auto-fill amount and status
4. **PDF Preview**: Add endpoint to stream PDF for staff preview

## Migration Notes

**Schema Migration Required**: Yes - Server restart needed

New enum values added to `models/PaymentVerification.js`:

**verificationType enum**:
- ✅ `'manual_entry_auto_lookup'` (existing)
- ✅ `'manual_entry_lookup_failed'` (existing)
- ✅ `'qr_scan'` (existing)
- ✨ `'manual_entry_pdf_downloaded'` (new - CBEBirr manual entry)
- ✨ `'qr_scan_pdf_downloaded'` (new - CBEBirr QR scan)

**parseQuality enum**:
- ✅ `'high'`, `'medium'`, `'low'`, `'failed'` (existing)
- ✨ `'pdf_manual_review_required'` (new - PDF receipts)

**Action Required**: Restart server to load updated schema

Existing verification records remain valid - no data migration needed.

## Rollback Plan

If issues arise:
1. Revert changes to BaseProvider, CBEBirrProvider, and PaymentVerificationService
2. CBEBirr will show `lookup_failed` status
3. Staff can manually upload PDFs as fallback

---

**Status**: ✅ **Complete and Ready for Testing**

**Files Modified**:
1. `src/modules/payment-verification/service/providers/BaseProvider.js`
2. `src/modules/payment-verification/service/providers/CBEBirrProvider.js`
3. `src/modules/payment-verification/service/PaymentVerificationService.js`
4. `src/modules/payment-verification/utils/qr-parser.js`

**Files Obsolete**:
1. `src/modules/payment-verification/service/providers/parsers/cbebirr-parser.js`
