# Payment Verification: Required Receipt Photo for Telebirr Manual Verifications

## Status: ✅ IMPLEMENTED & TESTED (27/27 tests passing)

## Context

**Direct testing confirmed:** Telebirr's public verification URL (`https://transactioninfo.ethiotelecom.et/receipt/{reference}`) is not responding. The server is currently down/inaccessible, making automated lookup impossible for Telebirr.

**Solution:** Require receipt photo evidence for all manual verifications (lookup_failed) to maintain verification integrity without working automated lookup.

---

## Changes Implemented

### 1. Model Comment Update ✅
**File:** `models/PaymentVerification.js`

Updated `receiptFileRef` field documentation:

```javascript
// Receipt photo: REQUIRED for Telebirr manual verifications (no working auto-lookup),
// optional for CBE auto-lookup verifications (working automated lookup)
receiptFileRef: { type: Schema.Types.ObjectId, ref: 'FileAsset' }
```

---

### 2. Enforcement in confirmVerification ✅
**File:** `src/modules/payment-verification/service/PaymentVerificationService.js`

Added validation check **after** atomic status update but **before** FileAsset validation:

```javascript
// ✅ REQUIRED PHOTO: Manual verifications (lookup_failed) need receipt photo evidence
// since there's no working automated lookup for Telebirr
if (verification.verificationType === 'manual_entry_lookup_failed' && !receiptFileId) {
  throw new AppError(
    'A receipt photo is required to confirm manual verifications',
    400
  );
}
```

**Placement rationale:**
- Runs **after** atomic status update retrieves verification record
- Runs **before** existing FileAsset ownership/deletion checks
- Reuses existing FileAsset validation logic (no duplication)

---

### 3. Test Coverage ✅
**File:** `tests/payment-verification-mocked.test.js`

Added 3 new tests (27 total, up from 24):

#### New Test 1: Require Receipt Photo for Manual Verifications
```javascript
it('should require receipt photo for manual_entry_lookup_failed verifications', async () => {
  // Attempt to confirm without receiptFileId
  const res = await request(app)
    .post(`/api/v1/payment-verification/${verification._id}/confirm`)
    .set('Authorization', `Bearer ${token}`)
    .send({}) // No receiptFileId
    .expect(400);

  expect(res.body.message).toContain('A receipt photo is required to confirm manual verifications');
});
```

**Result:** ✅ Passes - Returns 400 with correct error message

---

#### New Test 2: Allow Manual Verification With Valid Receipt
```javascript
it('should allow confirming manual verification with valid receipt photo', async () => {
  const receiptFile = await FileAsset.create({
    merchant: merchant._id,
    storageProvider: 'local',
    storageKey: '/uploads/receipts/telebirr-receipt-test.jpg',
    entityType: 'order_payment',
    purpose: 'receipt',
    // ... other required fields
  });

  const res = await request(app)
    .post(`/api/v1/payment-verification/${verification._id}/confirm`)
    .set('Authorization', `Bearer ${token}`)
    .send({ receiptFileId: receiptFile._id.toString() })
    .expect(200);

  expect(res.body.data.verification.status).toBe('verified');
  expect(res.body.data.verification.receiptFileRef).toBeTruthy();
});
```

**Result:** ✅ Passes - Confirms successfully with photo, `receiptFileRef` populated

---

#### New Test 3: CBE Auto-Lookup Still Works Without Photo
```javascript
it('should allow confirming CBE auto-lookup verification without receipt photo', async () => {
  const cbeVerification = await PaymentVerification.create({
    provider: 'cbe',
    verificationType: 'manual_entry_auto_lookup', // Successful auto-lookup
    parseQuality: 'high',
    // ...
  });

  const res = await request(app)
    .post(`/api/v1/payment-verification/${cbeVerification._id}/confirm`)
    .set('Authorization', `Bearer ${token}`)
    .send({}) // No receiptFileId - should still work
    .expect(200);

  expect(res.body.data.verification.status).toBe('verified');
});
```

**Result:** ✅ Passes - CBE auto-lookup confirmations unaffected (no regression)

---

### 4. Updated Existing Tests ✅

Modified 4 existing confirmation tests to provide valid `FileAsset` objects with all required fields:

- `storageProvider: 'local'`
- `storageKey` (unique per test)
- `entityType: 'order_payment'`
- `entityId: order._id`
- `purpose: 'receipt'`
- `sizeBytes` (instead of `size`)

**Tests updated:**
1. "should confirm verification and mark order as paid"
2. "should prevent confirming already processed verification"
3. "should reject if amount does not match current order total"
4. "should allow confirming manual verification with valid receipt photo"

---

## Verification Type Breakdown

| verificationType | Photo Required | Provider(s) | Reason |
|-----------------|----------------|-------------|--------|
| `manual_entry_lookup_failed` | ✅ **YES** | Telebirr (primarily) | No working automated lookup - photo is only evidence |
| `manual_entry_auto_lookup` | ❌ No | CBE, Telebirr (when working) | Automated lookup provides verification data |
| `qr_scan` | ❌ No | Future feature | QR contains embedded verification data |

---

## User Workflow Impact

### Before Confirmation
1. Staff member receives payment from customer
2. Customer shows receipt (physical or on phone)
3. Staff **takes photo** of receipt using upload endpoint
4. System returns `fileAssetId`
5. Staff enters receipt number and `fileAssetId` into confirmation

### During Confirmation
- **Manual verification (lookup_failed):**
  - System validates `receiptFileId` is provided → 400 if missing
  - System validates FileAsset exists, not deleted, correct merchant → 404 if invalid
  - Photo stored as evidence and displayed to approving staff
  
- **Auto-lookup verification (CBE):**
  - Photo optional (existing behavior maintained)
  - Automated data from provider page is primary evidence

### No OCR / No Automated Parsing
- Receipt photo is **evidence only** - shown to staff for manual comparison
- No image processing, no text extraction, no automated amount parsing
- Staff manually verifies receipt matches order details

---

## Production Deployment Notes

### Immediate Impact
- **Telebirr verifications:** Now require photo upload before confirmation can succeed
- **CBE verifications:** Unaffected (photo still optional)
- **Error message:** Clear, actionable: "A receipt photo is required to confirm manual verifications"

### Staff Training Required
Staff must be informed:
1. Telebirr payments now require photo before confirmation
2. Photo must be uploaded **before** clicking confirm
3. Upload endpoint: existing FileAsset creation API
4. CBE payments still work as before (photo optional)

### Backward Compatibility
- **Pending verifications created before this change:**
  - Will require photo on confirmation (even if created without one)
  - Staff may need to request customer return with receipt or provide photo via other means
  - Alternative: Temporary migration script to mark old manual verifications as different type

### Feature Flag Status
- `TELEBIRR_AUTO_LOOKUP_ENABLED=false` (unchanged)
- When Telebirr server becomes accessible:
  - Enable flag → creates `manual_entry_auto_lookup` verifications (photo optional)
  - Until then → creates `manual_entry_lookup_failed` (photo required)

---

## Test Results Summary

```
✅ All 27 tests passing (was 24)

New Tests (3):
  ✅ should require receipt photo for manual_entry_lookup_failed verifications
  ✅ should allow confirming manual verification with valid receipt photo
  ✅ should allow confirming CBE auto-lookup verification without receipt photo

Updated Tests (4):
  ✅ should confirm verification and mark order as paid (now with photo)
  ✅ should prevent confirming already processed verification (now with photo)
  ✅ should reject if amount does not match current order total (now with photo)
  ✅ should allow confirming manual verification with valid receipt photo

Existing Tests (20):
  ✅ All passing, no regressions
```

---

## Security & Audit Implications

### Evidence Trail
- Every Telebirr manual verification now has photographic evidence
- FileAsset tracked with:
  - `merchant` (tenant isolation)
  - `uploadedBy` (staff accountability)
  - `entityType: 'order_payment'` + `entityId: orderId` (linkage)
  - `isDeleted: false` (soft-delete protection)

### Fraud Prevention
- Receipt photo prevents "invisible payment" fraud
- Staff can cross-verify receipt details against order
- Audit log records who uploaded photo and who confirmed verification
- Unique index on `{provider, providerReference}` still prevents duplicate receipt usage

### Compliance
- Photo storage subject to data retention policies
- PII in receipt photos (customer names, phone numbers) must be protected
- GDPR/data protection: receipts may contain sensitive financial info

---

## Files Modified

1. `models/PaymentVerification.js` - Updated field comment
2. `src/modules/payment-verification/service/PaymentVerificationService.js` - Added validation
3. `tests/payment-verification-mocked.test.js` - Added 3 tests, updated 4 tests

---

## Next Steps

### Optional Enhancements (Not Required)
1. **UI Warning:** Show "Photo required" message in confirmation UI for manual verifications
2. **Combined Endpoint:** Allow photo upload + confirmation in single API call
3. **Photo Preview:** Display uploaded receipt photo in confirmation modal
4. **Bulk Migration:** Script to handle pre-existing manual verifications without photos

### When Telebirr Server Returns Online
1. Run TLS diagnostic: `node scripts/test-telebirr-tls.js`
2. If successful, enable flag: `TELEBIRR_AUTO_LOOKUP_ENABLED=true`
3. Update parsers with real HTML selectors
4. New Telebirr verifications will be `manual_entry_auto_lookup` (photo optional)
5. Old manual verifications (`lookup_failed`) still exist (photo required for confirmation)
