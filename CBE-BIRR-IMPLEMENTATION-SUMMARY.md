# CBE Birr Implementation Summary

## What Changed

Based on real QR scan, we discovered CBE has **TWO separate payment services**, not one:

### 1. CBE Birr (Mobile Wallet) - NEW ✨
- **Provider code:** `cbebirr`
- **QR URL:** `https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI7&PH=251923479921`
- **Parameters:**
  - `TID`: Transaction ID (8-15 alphanumeric)
  - `PH`: Phone number (251XXXXXXXXX format)
- **Status:** ✅ Confirmed by live QR scan (January 2025)

### 2. CBE Bank (Traditional Banking) - Existing
- **Provider code:** `cbe`
- **QR URL:** `https://apps.cbe.com.et:100/?id=FT26240JY4DT` (placeholder)
- **Parameters:**
  - `id`: Receipt reference
- **Status:** ⚠️ Placeholder - needs real QR scan confirmation

---

## Files Created

### 1. `src/modules/payment-verification/service/providers/CBEBirrProvider.js`
New provider for CBE Birr mobile wallet payments.

**Key Methods:**
- `verify({ tid, phone }, { orderAmount })` - Verify with TID + phone
- `verifyWithPDF({ tid, phone }, options)` - Verify with PDF download
- `validateTransactionId(tid)` - Validate TID format
- `validatePhoneNumber(phone)` - Validate 251XXXXXXXXX format

**Special Features:**
- Requires BOTH `tid` AND `phone` (security feature - not brute-forceable)
- Stores TID as main `providerReference`
- Stores phone in metadata for audit trail

### 2. `src/modules/payment-verification/service/providers/parsers/cbebirr-parser.js`
HTML parser for CBE Birr receipt pages.

**⚠️ IMPORTANT:** Uses placeholder selectors - must be updated after inspecting real HTML

**Parses:**
- Amount
- Currency (ETB)
- Transaction status (COMPLETED, FAILED, PENDING)
- Timestamp
- Payer name & phone
- Receiver name & phone
- Transaction ID

---

## Files Modified

### 1. `src/modules/payment-verification/utils/qr-parser.js`

**Changes:**
- Updated `ALLOWED_HOSTS` to distinguish `cbebirr` and `cbe`
- Added `extractCBEBirrReference(rawQrPayload)` function
- Updated `parsePaymentQR()` to detect both providers
- Updated `constructProviderURL()` to handle dual parameters
- Added `constructCBEBirrPdfURL(tid, phone)` function

**Before:**
```javascript
ALLOWED_HOSTS = {
  cbe: ['apps.cbe.com.et'],
};
```

**After:**
```javascript
ALLOWED_HOSTS = {
  cbebirr: ['cbepay1.cbe.com.et'], // ✅ Confirmed
  cbe: ['apps.cbe.com.et'], // ⚠️ Placeholder
};
```

### 2. `src/modules/payment-verification/service/providers/index.js`

**Changes:**
- Imported `CBEBirrProvider`
- Added `cbebirr` to providers list
- Updated error message to include `cbebirr`

**Before:**
```javascript
providers = {
  telebirr: new TelebirrProvider(options),
  cbe: new CBEProvider(options),
};
```

**After:**
```javascript
providers = {
  telebirr: new TelebirrProvider(options),
  cbe: new CBEProvider(options),
  cbebirr: new CBEBirrProvider(options), // NEW
};
```

### 3. `src/modules/payment-verification/service/PaymentVerificationService.js`

**Changes in `initiateVerificationFromQR()`:**
- Extract `tid` and `phone` from parsedQR (in addition to `referenceId`)
- Use `tid` as main reference for CBE Birr
- Pass `{ tid, phone }` object to `verifyWithPDF()` for CBE Birr
- Use `mainReference` throughout for consistency

**Before:**
```javascript
const { provider, referenceId } = parsedQR;
result = await providerInstance.verifyWithPDF(referenceId, options);
```

**After:**
```javascript
const { provider, referenceId, tid, phone } = parsedQR;
const mainReference = tid || referenceId;
const verifyParams = tid ? { tid, phone } : mainReference;
result = await providerInstance.verifyWithPDF(verifyParams, options);
```

---

## How It Works

### QR Scan Flow for CBE Birr

```
1. Customer pays via CBE Birr mobile wallet
   ↓
2. Receipt QR generated:
   https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI7&PH=251923479921
   ↓
3. Staff scans QR → Frontend sends to backend
   ↓
4. Backend: parsePaymentQR()
   - Validates hostname: cbepay1.cbe.com.et ✓
   - Extracts TID: DHT71MPGDI7
   - Validates TID format ✓
   - Extracts PH: 251923479921
   - Validates phone format ✓
   - Returns: { provider: 'cbebirr', tid, phone }
   ↓
5. Backend: CBEBirrProvider.verifyWithPDF()
   - Constructs URL: https://cbepay1.cbe.com.et/aureceipt?TID=...&PH=...
   - Fetches HTML receipt
   - Parses payment data (amount, status, etc.)
   - Downloads PDF receipt (if available)
   ↓
6. Backend: Creates verification record
   - provider: 'cbebirr'
   - providerReference: 'DHT71MPGDI7' (TID)
   - receiptFileRef: <PDF file ID>
   ↓
7. Staff reviews and confirms
```

### API Changes

**No breaking changes** - New provider is additive.

**Existing endpoints work for `cbebirr`:**
```javascript
// QR-based (recommended)
POST /api/v1/payment-verification/initiate-from-qr
{
  "orderId": "...",
  "qrPayload": "https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI7&PH=251923479921"
}

// Manual entry (if needed)
POST /api/v1/payment-verification/initiate
{
  "orderId": "...",
  "provider": "cbebirr",
  "receiptNumber": "DHT71MPGDI7" // TID only
}
```

**Note:** Manual entry for CBE Birr will fail at verification because it needs the phone number. QR scanning is the only supported method for CBE Birr currently.

---

## Security Considerations

### Why CBE Birr Requires Both TID and Phone

**Good security design:**
- TID alone is not enough to fetch receipt
- Phone number acts as a second factor
- Prevents brute-force enumeration attacks
- Attacker can't just guess TIDs and fetch all receipts

**Implementation preserves this:**
- QR parser extracts BOTH parameters
- Backend validates BOTH formats
- Backend constructs URL with BOTH parameters
- Never exposes phone in logs (truncated to 6 digits)

### SSRF Protection Maintained

```javascript
// ✅ Whitelist check before any fetch
if (!ALLOWED_HOSTS.cbebirr.includes(url.hostname)) {
  throw new AppError('Untrusted host', 400);
}

// ✅ Backend constructs own URL
const url = constructProviderURL('cbebirr', null, { tid, phone });
// Returns: https://cbepay1.cbe.com.et/aureceipt?TID=...&PH=...
```

---

## Testing Requirements

### Unit Tests

1. **QR Parser:**
   ```javascript
   test('extractCBEBirrReference - valid QR', () => {
     const qr = 'https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI7&PH=251923479921';
     const result = extractCBEBirrReference(qr);
     expect(result).toEqual({
       provider: 'cbebirr',
       tid: 'DHT71MPGDI7',
       phone: '251923479921',
     });
   });
   
   test('extractCBEBirrReference - missing TID', () => {
     const qr = 'https://cbepay1.cbe.com.et/aureceipt?PH=251923479921';
     expect(() => extractCBEBirrReference(qr)).toThrow('missing transaction ID');
   });
   
   test('extractCBEBirrReference - invalid phone', () => {
     const qr = 'https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI7&PH=09123456789';
     expect(() => extractCBEBirrReference(qr)).toThrow('Invalid phone number');
   });
   ```

2. **CBEBirrProvider:**
   ```javascript
   test('verify - successful verification', async () => {
     const mockHTML = '<html><!-- CBE Birr receipt --></html>';
     const mockFetch = jest.fn().mockResolvedValue({
       ok: true,
       text: () => Promise.resolve(mockHTML),
     });
     
     const provider = new CBEBirrProvider({ httpClient: mockFetch });
     const result = await provider.verify(
       { tid: 'DHT71MPGDI7', phone: '251923479921' },
       { orderAmount: 250.00 }
     );
     
     expect(result.reference).toBe('DHT71MPGDI7');
     expect(mockFetch).toHaveBeenCalledWith(
       'https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI7&PH=251923479921',
       expect.any(Object)
     );
   });
   ```

### Integration Tests

```javascript
describe('POST /api/v1/payment-verification/initiate-from-qr', () => {
  it('should handle CBE Birr QR code', async () => {
    const order = await createTestOrder({ totalAmount: 250.00 });
    const qrPayload = 'https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI7&PH=251923479921';
    
    const res = await request(app)
      .post('/api/v1/payment-verification/initiate-from-qr')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ orderId: order._id, qrPayload })
      .expect(201);
    
    expect(res.body.data.verification.provider).toBe('cbebirr');
    expect(res.body.data.verification.providerReference).toBe('DHT71MPGDI7');
  });
  
  it('should prevent duplicate CBE Birr receipts', async () => {
    const order1 = await createTestOrder();
    const order2 = await createTestOrder();
    const qrPayload = 'https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI7&PH=251923479921';
    
    // First verification
    await request(app)
      .post('/api/v1/payment-verification/initiate-from-qr')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ orderId: order1._id, qrPayload })
      .expect(201);
    
    // Second verification with same TID
    const res = await request(app)
      .post('/api/v1/payment-verification/initiate-from-qr')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ orderId: order2._id, qrPayload })
      .expect(409);
    
    expect(res.body.message).toContain('already been used');
  });
});
```

### Manual Testing Checklist

- [ ] Scan real CBE Birr QR code
- [ ] Verify QR contains `cbepay1.cbe.com.et`
- [ ] Verify QR has both `TID` and `PH` parameters
- [ ] Test initiate-from-qr endpoint with real QR
- [ ] Verify TID is stored as `providerReference`
- [ ] **Update HTML parser selectors** after viewing real receipt page
- [ ] Test PDF download (if available)
- [ ] Test duplicate prevention
- [ ] Test with multiple different CBE Birr transactions

---

## Configuration Required

### 1. Update HTML Parser (CRITICAL)

**File:** `src/modules/payment-verification/service/providers/parsers/cbebirr-parser.js`

**Steps:**
1. Visit: `https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI7&PH=251923479921`
2. Open browser DevTools → Inspect HTML
3. Find selectors for:
   - Amount
   - Status
   - Timestamp
   - Payer name/phone
   - Receiver name/phone
4. Update parser with real selectors

**Example:**
```javascript
// Current (placeholder)
const amount = $('.receipt-amount').text();

// Update to real selector
const amount = $('#transaction-amount').text(); // or whatever the real selector is
```

### 2. Test PDF Download

**File:** `src/modules/payment-verification/utils/qr-parser.js`  
**Function:** `constructCBEBirrPdfURL()`

**Steps:**
1. Visit CBE Birr receipt page
2. Look for "Download PDF" button
3. Inspect button click → network request
4. Update URL pattern

**Possible formats:**
```javascript
// Option 1
https://cbepay1.cbe.com.et/aureceipt/pdf?TID=...&PH=...

// Option 2
https://cbepay1.cbe.com.et/receipt-pdf?TID=...&PH=...

// Option 3
https://cbepay1.cbe.com.et/download?type=pdf&TID=...&PH=...
```

### 3. Update Frontend Guide

Add CBE Birr examples to `COMPLETE-FRONTEND-INTEGRATION-GUIDE.md`:
- Update provider list (telebirr, cbe, cbebirr)
- Add CBE Birr-specific examples
- Explain dual-parameter requirement

---

## Frontend Changes Needed

### Provider Selection

Update provider dropdown to include CBE Birr:

```jsx
<select value={provider} onChange={e => setProvider(e.target.value)}>
  <option value="telebirr">Telebirr</option>
  <option value="cbe">CBE Bank</option>
  <option value="cbebirr">CBE Birr (Mobile Wallet)</option>
</select>
```

### QR Scanner

No changes needed - works automatically:
- Scans QR
- Gets URL: `https://cbepay1.cbe.com.et/aureceipt?TID=...&PH=...`
- Sends to `/initiate-from-qr`
- Backend auto-detects provider as `cbebirr`

### Display

Update provider display names:

```jsx
const providerNames = {
  telebirr: 'Telebirr',
  cbe: 'CBE Bank',
  cbebirr: 'CBE Birr',
};

<span>{providerNames[verification.provider]}</span>
```

---

## Database Impact

### PaymentVerification Collection

**No schema changes** - existing fields accommodate CBE Birr:

```javascript
{
  provider: 'cbebirr', // ← New value
  providerReference: 'DHT71MPGDI7', // ← TID stored here
  parsed: {
    phone: '251923479921', // ← Phone in metadata
    // ... other parsed fields
  }
}
```

### Unique Index

Existing index works correctly:
```javascript
schema.index({ provider: 1, providerReference: 1 }, { unique: true });
```

**Prevents duplicates:**
- Same TID with different phones → Allowed (different transactions)
- Same TID with same phone → Blocked (duplicate)

**Note:** Since phone is NOT part of the unique index, the same TID with different phones would be allowed. This is correct behavior because:
- TID is globally unique per transaction
- Phone parameter is for lookup, not uniqueness
- If same TID appears with different phones, it's likely an error/fraud (backend will catch this during verification)

---

## Deployment Checklist

### Pre-Deployment

- [ ] Run tests: `npm test`
- [ ] Check linter: `npm run lint`
- [ ] Update HTML parser with real selectors
- [ ] Update PDF URL with real pattern
- [ ] Update frontend provider list
- [ ] Test with real CBE Birr QR codes (dev/staging)

### Deployment

- [ ] Deploy backend code
- [ ] Restart server
- [ ] Verify `/initiate-from-qr` endpoint accessible
- [ ] Test with real QR code
- [ ] Monitor logs for errors

### Post-Deployment

- [ ] Test end-to-end flow (QR scan → verify → confirm)
- [ ] Verify duplicate prevention works
- [ ] Check PDF download (if available)
- [ ] Monitor success rate
- [ ] Update user documentation

---

## Monitoring

### Key Metrics

- `cbebirr.verification_success_rate` - Should be >95%
- `cbebirr.pdf_download_success_rate` - Track availability
- `cbebirr_parser.parse_quality` - high/low/failed distribution

### Log Events

```javascript
// Success
logger.info('cbebirr.verification_success', { tid, amount, status });

// Failure
logger.warn('cbebirr.verification_failed', { tid, error });

// PDF
logger.info('cbebirr.pdf_downloaded', { tid, size });
logger.warn('cbebirr.pdf_download_failed', { tid, error });

// Parser
logger.error('cbebirr_parser.parse_error', { error });
```

### Alerts

Set up alerts for:
- High rate of `cbebirr.verification_failed`
- All `cbebirr_parser.parse_error` (indicates selector changes)
- Sudden drop in `pdf_download_success_rate`

---

## Summary

### ✅ What's Ready

- CBEBirrProvider implementation
- QR parser with dual-parameter support
- SSRF protection maintained
- Service layer updated
- Provider registration complete

### ⚠️ What Needs Configuration

- HTML parser selectors (CRITICAL - placeholder selectors won't work)
- PDF download URL (if CBE provides PDF)
- Frontend provider list update

### 🚀 Next Steps

1. **Test with real CBE Birr QR code**
2. **Inspect HTML and update parser**
3. **Test PDF download**
4. **Update frontend**
5. **Deploy and monitor**

---

**Status:** ✅ Code complete, configuration required  
**Priority:** Update HTML parser before production use  
**Risk:** Low (additive change, doesn't affect existing providers)
