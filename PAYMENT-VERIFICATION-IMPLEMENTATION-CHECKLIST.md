# Payment Verification — Production Implementation Checklist

**Date:** 2026-08-22  
**Status:** Design Approved ✅  
**All 8 Critical Issues Resolved**

---

## Phase 0: Prerequisites & Fixtures (1-2 days)

### Task 0.1: Collect Real Receipt Samples
- [ ] Get 5 real CBE Birr receipts from merchants
  - [ ] Scan QR codes and save raw strings to `tests/fixtures/payment-verification/qr-strings.json`
  - [ ] Screenshot receipt HTML and save to `tests/fixtures/payment-verification/cbe-sample-{1-5}.html`
  - [ ] Document transaction IDs, amounts, dates in JSON
  
- [ ] Get 5 real Telebirr receipts (both variants if possible)
  - [ ] Scan QR codes and save raw strings
  - [ ] Screenshot receipt HTML and save to `tests/fixtures/payment-verification/telebirr-sample-{1-5}.html`
  - [ ] Document transaction IDs, amounts, dates in JSON

### Task 0.2: Analyze Receipt Structure
- [ ] Document CBE receipt HTML structure
  - [ ] Identify selectors for amount extraction
  - [ ] Identify selectors for payer name
  - [ ] Identify selectors for transaction date
  - [ ] Identify selectors for reference number
  
- [ ] Document Telebirr receipt structure (same fields)
  
- [ ] Create `RECEIPT-PARSING-GUIDE.md` with findings

---

## Phase 1: Core Infrastructure (1 day)

### Task 1.1: Create PaymentVerification Model
**File:** `models/PaymentVerification.js`

- [ ] Copy schema from `PAYMENT-VERIFICATION-FINAL.md` (Issue 4 section)
- [ ] Verify unique index: `{ provider: 1, providerReference: 1 }` (no verificationType)
- [ ] Add audit plugin
- [ ] Add compound indexes for queries
- [ ] Test model creation in isolation

**Verification:**
```javascript
const PaymentVerification = require('./models/PaymentVerification');
const doc = new PaymentVerification({
  merchant: merchantId,
  order: orderId,
  provider: 'cbe',
  providerReference: 'TEST-123',
  rawQrPayload: 'test',
  verificationType: 'automated',
});
await doc.save();
// Try duplicate
const dup = new PaymentVerification({ ...doc.toObject(), _id: undefined });
await dup.save(); // Should throw E11000
```

### Task 1.2: Extract PaymentCompletionService
**File:** `src/modules/order/service/PaymentCompletionService.js`

- [ ] Create new file
- [ ] Copy implementation from `PAYMENT-VERIFICATION-DIFFS.md` section 2
- [ ] Add JSDoc comments
- [ ] Export class

**File:** `src/modules/order/service/OrderService.js`

- [ ] Add import: `const PaymentCompletionService = require('./PaymentCompletionService');`
- [ ] Replace `markAsPaid` method body with delegation (see DIFFS.md section 1)
- [ ] Keep existing function signature unchanged

**Verification:**
- [ ] Run existing payment tests: `npm test -- order-payment`
- [ ] All tests should pass (zero behavior change)
- [ ] Check that loyalty points still work
- [ ] Check that table cleanup still works for dine-in

### Task 1.3: Create Module Structure
```
src/modules/payment-verification/
├── controller/
│   └── PaymentVerificationController.js
├── dto/
│   ├── initiate-verification.dto.js
│   └── confirm-verification.dto.js
├── service/
│   ├── PaymentVerificationService.js
│   └── providers/
│       ├── index.js
│       ├── BaseProvider.js
│       ├── CbeProvider.js
│       └── TelebirrProvider.js
├── repository/
│   └── PaymentVerificationRepository.js
└── routes/
    └── payment-verification.routes.js
```

- [ ] Create directory structure
- [ ] Create placeholder files with basic exports

---

## Phase 2: Provider Implementation (2 days)

### Task 2.1: BaseProvider Class
**File:** `src/modules/payment-verification/service/providers/BaseProvider.js`

```javascript
class BaseProvider {
  getName() { throw new Error('Not implemented'); }
  matches(rawQrPayload) { throw new Error('Not implemented'); }
  async verify(rawQrPayload, context) { throw new Error('Not implemented'); }
}
module.exports = BaseProvider;
```

### Task 2.2: CbeProvider Implementation
**File:** `src/modules/payment-verification/service/providers/CbeProvider.js`

- [ ] Implement `matches(raw)` with hostname check:
  ```javascript
  matches(raw) {
    try {
      const url = new URL(raw);
      return url.hostname === 'apps.cbe.com.et';
    } catch {
      return false;
    }
  }
  ```

- [ ] Implement `verify(raw, context)` with:
  - [ ] ✅ Hostname validation (SSRF prevention)
  - [ ] ✅ `maxRedirects: 0` in axios config
  - [ ] ✅ 10-second timeout
  - [ ] ✅ Parse HTML using cheerio/jsdom
  - [ ] ✅ Extract: amount, payer name, transaction date, reference
  - [ ] ✅ Return standardized object

**Tests:**
- [ ] Test with real CBE fixtures
- [ ] Test SSRF prevention (crafted URLs)
- [ ] Test malformed HTML
- [ ] Test timeout handling

### Task 2.3: TelebirrProvider Implementation
**File:** `src/modules/payment-verification/service/providers/TelebirrProvider.js`

- [ ] Same structure as CbeProvider
- [ ] Hostname: `transactioninfo.ethiotelecom.et`
- [ ] Handle both receipt variants (if discovered in Phase 0)
- [ ] All same security checks

### Task 2.4: Provider Resolver
**File:** `src/modules/payment-verification/service/providers/index.js`

```javascript
const CbeProvider = require('./CbeProvider');
const TelebirrProvider = require('./TelebirrProvider');

const providers = [new CbeProvider(), new TelebirrProvider()];

function resolveProvider(rawQrPayload) {
  for (const provider of providers) {
    if (provider.matches(rawQrPayload)) {
      return provider;
    }
  }
  throw new Error('Unsupported QR code format');
}

module.exports = { resolveProvider, CbeProvider, TelebirrProvider };
```

---

## Phase 3: Service Layer (1 day)

### Task 3.1: PaymentVerificationRepository
**File:** `src/modules/payment-verification/repository/PaymentVerificationRepository.js`

- [ ] Wrap Mongoose model methods
- [ ] Add tenant-scoped queries
- [ ] Add common filters (by status, by order, etc.)

### Task 3.2: PaymentVerificationService
**File:** `src/modules/payment-verification/service/PaymentVerificationService.js`

**Methods to Implement:**

#### 3.2.1: initiateVerification
- [ ] Copy from `PAYMENT-VERIFICATION-FINAL.md` (complete service section)
- [ ] ✅ Verify Issue 2 fix applied: `error.code === 11000` only
- [ ] ✅ Verify early duplicate check exists
- [ ] Test with duplicate references

#### 3.2.2: confirmVerification
- [ ] Copy from `PAYMENT-VERIFICATION-FINAL.md` (Issue 6-8 sections)
- [ ] ✅ Verify Issue 6 fix: Atomic `findOneAndUpdate`
- [ ] ✅ Verify Issue 7 fix: Re-check amount at confirm time
- [ ] ✅ Verify Issue 8 fix: ObjectId validation
- [ ] ✅ Verify Issue 5a fix: FileAsset ownership check
- [ ] ✅ Verify Issue 5b fix: `getPublicUrl()` resolution
- [ ] Test race condition (concurrent confirms)
- [ ] Test stale data (order modified between scan and confirm)

#### 3.2.3: createManualVerification
- [ ] Implement manual entry flow
- [ ] Reuse duplicate-check logic
- [ ] Track `verificationType: 'manual'`
- [ ] Populate `manualEntry` subdocument

#### 3.2.4: rejectVerification
```javascript
static async rejectVerification({ verificationId, merchantId, staffUserId, reason }) {
  const verification = await PaymentVerificationRepository.findOneAndUpdate(
    { _id: verificationId, merchant: merchantId, status: 'pending_review' },
    {
      $set: {
        status: 'rejected',
        verifiedBy: staffUserId,
        verifiedAt: new Date(),
        rejectionReason: reason,
      },
    },
    { new: true }
  );

  if (!verification) {
    throw new AppError('Verification not found or already processed', 404);
  }

  return verification;
}
```

#### 3.2.5: listPendingVerifications
```javascript
static async listPendingVerifications({ merchantId, page = 1, limit = 50 }) {
  const skip = (page - 1) * limit;
  
  const verifications = await PaymentVerificationRepository.find({
    merchant: merchantId,
    status: 'pending_review',
  })
    .populate('order', 'orderNumber totalAmount placedAt')
    .populate('verifiedBy', 'fullName')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await PaymentVerificationRepository.countDocuments({
    merchant: merchantId,
    status: 'pending_review',
  });

  return {
    verifications,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}
```

---

## Phase 4: API Layer (1 day)

### Task 4.1: DTO Validators
**File:** `src/modules/payment-verification/dto/initiate-verification.dto.js`

```javascript
const { z } = require('zod');

const InitiateVerificationSchema = z.object({
  orderId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid order ID format'),
  rawQrPayload: z.string().min(10).max(2000),
});

module.exports = { InitiateVerificationSchema };
```

**File:** `src/modules/payment-verification/dto/confirm-verification.dto.js`

```javascript
const { z } = require('zod');

const ConfirmVerificationSchema = z.object({
  verificationId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid verification ID format'),
  receiptFileId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid file ID format').optional(),
});

module.exports = { ConfirmVerificationSchema };
```

### Task 4.2: Controller
**File:** `src/modules/payment-verification/controller/PaymentVerificationController.js`

**Endpoints:**

#### POST /api/v1/payment-verification/initiate
```javascript
async initiate(req, res, next) {
  try {
    const validated = InitiateVerificationSchema.parse(req.body);
    const merchantId = getMerchantId(req);
    const userId = req.user._id;

    const verification = await PaymentVerificationService.initiateVerification({
      merchantId,
      orderId: validated.orderId,
      rawQrPayload: validated.rawQrPayload,
      userId,
    });

    res.status(201).json({
      success: true,
      data: { verification },
    });
  } catch (error) {
    next(error);
  }
}
```

#### POST /api/v1/payment-verification/:id/confirm
#### POST /api/v1/payment-verification/:id/reject
#### GET /api/v1/payment-verification/pending
#### POST /api/v1/payment-verification/manual

- [ ] Implement all 5 endpoints
- [ ] Add Zod validation
- [ ] Add merchant scoping
- [ ] Add error handling

### Task 4.3: Routes
**File:** `src/modules/payment-verification/routes/payment-verification.routes.js`

```javascript
const express = require('express');
const router = express.Router();
const PaymentVerificationController = require('../controller/PaymentVerificationController');
const { protect, restrictTo } = require('../../../middleware/auth');

router.use(protect); // All routes require authentication

router.post('/initiate', restrictTo('waiter', 'support', 'admin'), PaymentVerificationController.initiate);
router.post('/:id/confirm', restrictTo('admin', 'accountant'), PaymentVerificationController.confirm);
router.post('/:id/reject', restrictTo('admin', 'accountant'), PaymentVerificationController.reject);
router.get('/pending', restrictTo('admin', 'accountant'), PaymentVerificationController.listPending);
router.post('/manual', restrictTo('admin', 'accountant'), PaymentVerificationController.createManual);

module.exports = router;
```

**File:** `src/routes/index.js`

```javascript
// Add to existing routes
const paymentVerificationRoutes = require('../modules/payment-verification/routes/payment-verification.routes');

// ...
router.use('/api/v1/payment-verification', paymentVerificationRoutes);
```

---

## Phase 5: RBAC Integration (30 minutes)

### Task 5.1: Add Tasks to Seeder
**File:** `scripts/seed-roles-and-tasks.js`

Add to `ALL_TASKS` array:

```javascript
// Payment Verification (6 tasks)
{ name: 'payment-verification.initiate', isMerchant: true },
{ name: 'payment-verification.confirm', isMerchant: true },
{ name: 'payment-verification.reject', isMerchant: true },
{ name: 'payment-verification.view.pending', isMerchant: true },
{ name: 'payment-verification.create.manual', isMerchant: true },
{ name: 'payment-verification.view.history', isMerchant: true },
```

**Expected Counts After:**
- Total: 214 → 220
- Merchant: 193 → 199

### Task 5.2: Assign to Roles
Add to appropriate role task arrays:

```javascript
// ADMIN_TASKS
'payment-verification.initiate',
'payment-verification.confirm',
'payment-verification.reject',
'payment-verification.view.pending',
'payment-verification.create.manual',
'payment-verification.view.history',

// WAITER_TASKS
'payment-verification.initiate',

// ACCOUNTANT_TASKS (if role exists)
'payment-verification.confirm',
'payment-verification.reject',
'payment-verification.view.pending',
'payment-verification.create.manual',
'payment-verification.view.history',
```

### Task 5.3: Run Seeder
```bash
npm run seed:roles
```

- [ ] Verify task count: 220 total, 199 merchant
- [ ] Verify roles have correct tasks assigned

---

## Phase 6: Testing (2 days)

### Task 6.1: Unit Tests

**File:** `tests/payment-verification/providers/cbe.test.js`
- [ ] Test hostname validation (SSRF prevention)
- [ ] Test HTML parsing with fixtures
- [ ] Test timeout handling
- [ ] Test malformed responses

**File:** `tests/payment-verification/providers/telebirr.test.js`
- [ ] Same as CBE tests

**File:** `tests/payment-verification/service.test.js`
- [ ] Test initiateVerification with valid QR
- [ ] Test duplicate reference detection (Issue 1)
- [ ] Test precise error catching (Issue 2)
- [ ] Test confirmVerification race condition (Issue 6)
- [ ] Test stale amount check (Issue 7)
- [ ] Test ObjectId validation (Issue 8)
- [ ] Test FileAsset ownership (Issue 5a)
- [ ] Test receiptImage URL resolution (Issue 5b)

### Task 6.2: Integration Tests

**File:** `tests/payment-verification/integration.test.js`

```javascript
describe('Payment Verification E2E', () => {
  it('should complete full verification flow', async () => {
    // 1. Create order
    const order = await createTestOrder({ totalAmount: 500 });
    
    // 2. Initiate verification with real fixture
    const qrPayload = fs.readFileSync('tests/fixtures/payment-verification/cbe-sample-1-qr.txt', 'utf8');
    const verification = await PaymentVerificationService.initiateVerification({
      merchantId,
      orderId: order._id,
      rawQrPayload: qrPayload,
      userId: testUser._id,
    });
    
    expect(verification.status).toBe('pending_review');
    expect(verification.amountMatch).toBe(true);
    
    // 3. Confirm verification
    await PaymentVerificationService.confirmVerification({
      verificationId: verification._id,
      merchantId,
      staffUserId: testUser._id,
    });
    
    // 4. Verify order is paid
    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.paymentStatus).toBe('paid');
    expect(updatedOrder.paymentDetails.method).toBe('mobile_banking');
  });

  it('should prevent race condition on concurrent confirms', async () => {
    const order = await createTestOrder({ totalAmount: 500 });
    const verification = await createTestVerification({ orderId: order._id });

    // Fire two confirms simultaneously
    const [result1, result2] = await Promise.allSettled([
      PaymentVerificationService.confirmVerification({
        verificationId: verification._id,
        merchantId,
        staffUserId: testUser._id,
      }),
      PaymentVerificationService.confirmVerification({
        verificationId: verification._id,
        merchantId,
        staffUserId: testUser._id,
      }),
    ]);

    // One succeeds, one fails
    expect(result1.status === 'fulfilled' || result2.status === 'fulfilled').toBe(true);
    expect(result1.status === 'rejected' || result2.status === 'rejected').toBe(true);

    const failedResult = result1.status === 'rejected' ? result1 : result2;
    expect(failedResult.reason.statusCode).toBe(409);
    expect(failedResult.reason.message).toContain('already processed');
  });

  it('should reject verification if order total changed', async () => {
    const order = await createTestOrder({ totalAmount: 500 });
    
    // Scan receipt (amount matches)
    const verification = await initiateTestVerification({
      orderId: order._id,
      amount: 500,
    });
    expect(verification.amountMatch).toBe(true);

    // Modify order (void an item)
    await Order.findByIdAndUpdate(order._id, {
      totalAmount: 400,
      items: order.items.slice(0, -1),
    });

    // Try to confirm
    await expect(
      PaymentVerificationService.confirmVerification({
        verificationId: verification._id,
        merchantId,
        staffUserId: testUser._id,
      })
    ).rejects.toThrow('does not match current order total');
  });
});
```

### Task 6.3: Security Tests

**File:** `tests/payment-verification/security.test.js`

- [ ] Test SSRF prevention (crafted URLs)
- [ ] Test cross-tenant FileAsset access
- [ ] Test duplicate reference reuse
- [ ] Test malformed ObjectId input
- [ ] Test unauthorized access (wrong merchant)

---

## Phase 7: Documentation & Deployment (1 day)

### Task 7.1: API Documentation

**File:** `PAYMENT-VERIFICATION-API.md`

- [ ] Document all 5 endpoints with examples
- [ ] Document error codes
- [ ] Document rate limits (if any)
- [ ] Document RBAC requirements

### Task 7.2: Deployment Guide

**File:** `PAYMENT-VERIFICATION-DEPLOYMENT.md`

```markdown
# Deployment Steps

## 1. Pre-deployment
- [ ] Backup production database
- [ ] Test on staging with real receipts
- [ ] Verify all 220 tasks exist in seed script

## 2. Deployment
- [ ] Deploy code (includes PaymentCompletionService extraction)
- [ ] Run RBAC seeder: `npm run seed:roles`
- [ ] Verify task count: `node -e "..."`
- [ ] Restart application

## 3. Post-deployment Verification
- [ ] Test existing payment flow (should be unchanged)
- [ ] Test new verification flow with test receipt
- [ ] Monitor logs for errors
- [ ] Check Sentry/error tracking

## 4. Rollback Plan
If issues detected:
- [ ] Revert code deployment
- [ ] RBAC tasks remain (harmless, no endpoints)
- [ ] No database migration to revert
```

### Task 7.3: Merchant Training Guide

**File:** `PAYMENT-VERIFICATION-USER-GUIDE.md`

- [ ] Screenshot-based guide for scanning receipts
- [ ] Guide for reviewing pending verifications
- [ ] Guide for manual entry (fallback)
- [ ] Common issues & troubleshooting

---

## Final Verification Checklist

### Code Quality
- [ ] All 8 issues verified fixed in implementation
- [ ] No `TODO` or `FIXME` comments
- [ ] All console.logs removed
- [ ] ESLint passes
- [ ] Prettier formatting applied

### Testing
- [ ] All unit tests pass (>80% coverage)
- [ ] All integration tests pass
- [ ] All security tests pass
- [ ] Manual testing with real receipts completed

### Security
- [ ] ✅ Issue 1: Unique index prevents duplicate use
- [ ] ✅ Issue 2: Only E11000 errors caught
- [ ] ✅ Issue 5a: FileAsset ownership validated
- [ ] ✅ Issue 5b: receiptImage type consistent
- [ ] ✅ Issue 6: Race condition prevented
- [ ] ✅ Issue 7: Stale data prevented
- [ ] ✅ Issue 8: Input validation present
- [ ] SSRF prevention confirmed
- [ ] Cross-tenant access blocked

### Documentation
- [ ] API documentation complete
- [ ] Deployment guide ready
- [ ] User guide with screenshots
- [ ] Code comments in complex sections
- [ ] README updated with new module

### RBAC
- [ ] 6 tasks added to seeder
- [ ] Task count: 220 total, 199 merchant
- [ ] Tasks assigned to correct roles
- [ ] Seeder script tested

### Production Readiness
- [ ] Feature flag configured (optional)
- [ ] Error tracking configured
- [ ] Logging levels appropriate
- [ ] Performance testing done
- [ ] Rollback plan documented
- [ ] On-call team briefed

---

## Estimated Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 0: Fixtures | 1-2 days | Merchant access to real receipts |
| Phase 1: Infrastructure | 1 day | None |
| Phase 2: Providers | 2 days | Phase 0 (fixtures), Phase 1 |
| Phase 3: Service | 1 day | Phase 1, Phase 2 |
| Phase 4: API | 1 day | Phase 3 |
| Phase 5: RBAC | 0.5 day | Phase 4 |
| Phase 6: Testing | 2 days | Phase 2-5 |
| Phase 7: Docs | 1 day | Phase 6 |
| **Total** | **8-10 days** | |

---

## Success Criteria

- [ ] Zero regression in existing payment flow
- [ ] Race condition test passes 100/100 concurrent attempts
- [ ] Stale data test catches modified orders
- [ ] SSRF test blocks crafted URLs
- [ ] All 8 critical issues verified fixed
- [ ] Code deployed to production successfully
- [ ] First real receipt verified successfully
- [ ] Merchant training completed
