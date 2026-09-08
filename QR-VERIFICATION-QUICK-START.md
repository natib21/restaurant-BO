# QR Verification Quick Start

## For Frontend Developers

### Install QR Scanner

```bash
npm install html5-qrcode
```

### Basic Implementation

```jsx
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useState, useEffect } from 'react';

function QRVerification({ orderId }) {
  const [result, setResult] = useState(null);
  
  useEffect(() => {
    const scanner = new Html5QrcodeScanner("qr-reader", { fps: 10 });
    
    scanner.render(
      (decodedText) => {
        // Send to backend
        fetch('/api/v1/payment-verification/initiate-from-qr', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            orderId,
            qrPayload: decodedText, // Raw QR string
          }),
        })
        .then(res => res.json())
        .then(data => setResult(data));
      },
      (error) => console.warn('QR scan failed:', error)
    );
    
    return () => scanner.clear();
  }, [orderId]);
  
  return <div id="qr-reader"></div>;
}
```

### API Call

```javascript
POST /api/v1/payment-verification/initiate-from-qr

// Request
{
  "orderId": "507f1f77bcf86cd799439012",
  "qrPayload": "https://apps.cbe.com.et:100/?id=FT26240JY4DT"
}

// Response
{
  "status": "success",
  "data": {
    "verification": {
      "provider": "cbe",
      "providerReference": "FT26240JY4DT",
      "parsed": { "amount": 250.00, "status": "COMPLETED" },
      "amountMatch": true,
      "receiptFileRef": "507f..." // PDF auto-downloaded
    }
  }
}
```

---

## For Backend Developers

### Files Modified

1. `src/modules/payment-verification/utils/qr-parser.js` (new)
2. `src/modules/payment-verification/utils/pdf-downloader.js` (new)
3. `src/modules/payment-verification/service/providers/CBEProvider.js` (enhanced)
4. `src/modules/payment-verification/service/PaymentVerificationService.js` (enhanced)
5. `src/modules/payment-verification/controller/payment-verification.controller.js` (enhanced)
6. `src/modules/payment-verification/payment-verification.routes.js` (enhanced)

### Key Security Features

```javascript
// SSRF Protection
const ALLOWED_HOSTS = {
  cbe: ['apps.cbe.com.et'], // Only allow this host
};

// PDF Validation
if (buffer.slice(0, 5).toString('utf-8') !== '%PDF-') {
  throw new AppError('Not a valid PDF', 400);
}

// Duplicate Prevention
const existing = await PaymentVerificationRepository.findOne({
  provider,
  providerReference,
});
if (existing) throw new AppError('Receipt already used', 409);
```

### Usage in Service

```javascript
const PaymentVerificationService = require('./PaymentVerificationService');

// QR-based verification with PDF download
const verification = await PaymentVerificationService.initiateVerificationFromQR({
  merchantId: '507f...',
  orderId: '507f...',
  qrPayload: 'https://apps.cbe.com.et:100/?id=FT26240JY4DT',
  userId: '507f...',
});

// Returns verification with receiptFileRef (PDF) attached
```

---

## Configuration TODO

### 1. Update PDF URL (CRITICAL)

**File:** `src/modules/payment-verification/utils/qr-parser.js`

**Line 133:** `constructCBEPdfURL()` function

**Action:** Test real CBE receipt page, find PDF download URL, update:

```javascript
function constructCBEPdfURL(referenceId) {
  // UPDATE THIS after testing real CBE receipt
  return `https://apps.cbe.com.et:100/pdf?id=${encodeURIComponent(referenceId)}`;
}
```

### 2. Implement File Storage

**File:** `src/modules/payment-verification/utils/pdf-downloader.js`

**Line 120:** `savePDFAsFileAsset()` function

**Action:** Add actual file writing:

```javascript
// For S3:
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
await s3.putObject({
  Bucket: process.env.S3_BUCKET,
  Key: storageKey,
  Body: pdfBuffer,
  ContentType: 'application/pdf',
}).promise();

// OR for local storage:
const fs = require('fs').promises;
await fs.writeFile(
  path.join(process.env.UPLOAD_DIR, storageKey),
  pdfBuffer
);
```

---

## Testing

### Run Tests

```bash
npm test -- payment-verification
```

### Manual Test

```bash
# 1. Start server
npm run dev

# 2. Create test order
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ ... }'

# 3. Test QR verification
curl -X POST http://localhost:3000/api/v1/payment-verification/initiate-from-qr \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "507f1f77bcf86cd799439012",
    "qrPayload": "https://apps.cbe.com.et:100/?id=FT26240JY4DT"
  }'
```

---

## Troubleshooting

### "Unrecognized payment provider"

**Cause:** QR hostname not in whitelist

**Fix:** Check QR contains `apps.cbe.com.et` exactly

### "PDF download failed"

**Cause:** `constructCBEPdfURL()` has wrong URL

**Fix:** Test real CBE receipt, update URL

### "Receipt already used"

**Cause:** Duplicate QR code scanned

**Fix:** This is expected behavior (security feature)

### Camera permission denied

**Cause:** Browser/app doesn't have camera access

**Fix:** Use HTTPS, request permissions properly

---

## Quick Links

- **Full Guide:** `CBE-QR-VERIFICATION-GUIDE.md`
- **Implementation Summary:** `QR-VERIFICATION-IMPLEMENTATION-SUMMARY.md`
- **Security Docs:** See "SSRF Protection" section in guide
- **Frontend Examples:** See "Frontend Integration" in guide

---

## Summary

**New Endpoint:** `POST /api/v1/payment-verification/initiate-from-qr`

**What It Does:**
1. Validates QR URL (SSRF protection)
2. Fetches HTML receipt from CBE
3. Downloads PDF receipt automatically
4. Stores PDF as FileAsset
5. Creates verification record

**What You Need To Do:**
1. Frontend: Add QR scanner
2. Backend: Update PDF URL placeholder
3. Backend: Implement file storage
4. Test with real CBE QR codes
5. Deploy

**Status:** ✅ Core implementation complete, configuration required
