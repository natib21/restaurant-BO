# Payment Receipt Verification Implementation Guide
## CBE & Telebirr Integration — Tailored to Your Architecture

**Date:** 2026-08-22  
**Status:** Implementation Planning  
**Complexity:** Medium (Provider scraping + Order flow integration)

---

## Executive Summary

This feature adds **server-side payment verification** for CBE and Telebirr mobile banking receipts. Staff scan a customer's payment receipt QR, your backend fetches the transaction details from the bank, compares it with the order, and the merchant confirms or rejects.

**Key Design Principles:**
1. ✅ Reuses your existing `OrderService.markAsPaid()` flow
2. ✅ Follows your module structure (controller/service/repository/model/routes)
3. ✅ Integrates with your existing file upload system
4. ✅ Leverages your audit plugin for compliance
5. ✅ Uses your transaction patterns (mongoose sessions)
6. ✅ Fits your RBAC system (new tasks for verification endpoints)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Model](#2-data-model)
3. [Module Structure](#3-module-structure)
4. [Provider Abstraction](#4-provider-abstraction)
5. [Service Layer](#5-service-layer)
6. [Integration with Existing Order Flow](#6-integration-with-existing-order-flow)
7. [API Endpoints](#7-api-endpoints)
8. [RBAC Tasks](#8-rbac-tasks)
9. [Implementation Phases](#9-implementation-phases)
10. [Testing Strategy](#10-testing-strategy)
11. [Risks & Mitigations](#11-risks--mitigations)
12. [Production Considerations](#12-production-considerations)

---

## 1. Architecture Overview

### Current Payment Flow (As-Is)
```
Staff → Upload Receipt Image (optional) → Call markAsPaid
         ↓
    OrderService.markAsPaid()
         ↓
    Updates: paymentStatus='paid', paymentDetails.receiptImage
         ↓
    Completes dine-in orders, awards loyalty points
```

### New Payment Verification Flow (To-Be)
```
Staff → Scan QR → Frontend extracts raw string
         ↓
    POST /api/v1/payment-verification/initiate
    { orderId, rawQrPayload }
         ↓
    Backend → Detect provider (CBE/Telebirr)
         ↓
    Provider.verify() → Scrapes bank HTML → Parses data
         ↓
    Creates PaymentVerification record (status: pending_review)
         ↓
    Frontend → Shows parsed data side-by-side with order
         ↓
    Merchant reviews → Confirms or Rejects
         ↓
    POST /api/v1/payment-verification/:id/confirm
    { receiptFileRef } // optional photo upload
         ↓
    Calls existing OrderService.markAsPaid()
         ↓
    Updates PaymentVerification (status: verified)
```

**Key Insight:** This is a **verification layer** on top of your existing `markAsPaid()` — not a replacement.

---

## 2. Data Model

###  PaymentVerification Model

**Location:** `models/PaymentVerification.js`

```javascript
const mongoose = require('mongoose');
const { Schema } = mongoose;
const auditPlugin = require('../utils/auditPlugin');

const PaymentVerificationSchema = new Schema(
  {
    // ========== Identifiers ==========
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },

    // ========== Provider Info ==========
    provider: {
      type: String,
      enum: ['cbe', 'telebirr'],
      required: true,
      index: true,
    },
    providerReference: {
      type: String,
      required: true,
      index: true,
      comment: 'FT code (CBE) or receipt number (Telebirr) — extracted from QR',
    },
    rawQrPayload: {
      type: String,
      required: true,
      comment: 'Exact QR string from scanner (for debugging/audit)',
    },

    // ========== Parsed Transaction Data ==========
    parsed: {
      amount: { type: Number, min: 0 },
      payerName: { type: String, trim: true },
      payerAccountOrPhone: { type: String, trim: true },
      receiverName: { type: String, trim: true },
      receiverAccount: { type: String, trim: true },
      transactionDate: { type: Date },
      fullRawText: {
        type: String,
        comment: 'Full scraped HTML text — for manual dispute review',
      },
    },

    // ========== Validation Checks ==========
    amountMatch: {
      type: Boolean,
      comment: 'Does parsed.amount === order.totalAmount?',
    },
    accountMatch: {
      type: Boolean,
      comment: 'Does receiverAccount match merchant account? (if available)',
    },

    // ========== Status Workflow ==========
    status: {
      type: String,
      enum: ['pending_review', 'verified', 'rejected', 'lookup_failed'],
      default: 'pending_review',
      required: true,
      index: true,
    },

    // ========== Verification Outcome ==========
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      comment: 'Staff who confirmed/rejected',
    },
    verifiedAt: { type: Date },
    rejectionReason: {
      type: String,
      trim: true,
      comment: 'Why merchant rejected this verification',
    },

    // ========== File Reference ==========
    receiptFileRef: {
      type: Schema.Types.ObjectId,
      ref: 'FileAsset',
      comment: 'Reference to uploaded receipt photo/PDF (from your files module)',
    },

    // ========== Error Handling ==========
    lookupError: {
      type: String,
      comment: 'Error message when provider lookup fails (for debugging)',
    },
    retryCount: {
      type: Number,
      default: 0,
      comment: 'Number of times lookup was retried',
    },
  },
  {
    timestamps: true,
  }
);

// ========== CRITICAL INDEX ==========
// Prevents the same receipt being used for multiple orders (fraud prevention)
PaymentVerificationSchema.index(
  { provider: 1, providerReference: 1 },
  {
    unique: true,
    name: 'unique_provider_reference',
  }
);

// Compound indexes for common queries
PaymentVerificationSchema.index({ merchant: 1, status: 1, createdAt: -1 });
PaymentVerificationSchema.index({ merchant: 1, order: 1 });

// ========== Apply Audit Plugin ==========
PaymentVerificationSchema.plugin(auditPlugin, {
  resource: 'PaymentVerification',
  auditedFields: [
    'status',
    'verifiedBy',
    'verifiedAt',
    'rejectionReason',
    'receiptFileRef',
  ],
});

module.exports = mongoose.model('PaymentVerification', PaymentVerificationSchema);
```

**Key Design Decisions:**

1. **Unique Index on (provider, providerReference):** Prevents fraud (same receipt used twice)
2. **Status Enum:** Mirrors your order status workflow pattern
3. **Audit Plugin:** Leverages your existing audit trail system
4. **FileAsset Reference:** Integrates with your existing file upload module
5. **Merchant Scoping:** Follows your multi-tenant pattern

---

## 3. Module Structure

```
src/modules/payment-verification/
├── controller/
│   └── payment-verification.controller.js
├── service/
│   ├── PaymentVerificationService.js
│   └── providers/
│       ├── PaymentVerificationProvider.js (abstract base)
│       ├── CbeProvider.js
│       ├── TelebirrProvider.js
│       ├── index.js (provider registry)
│       └── parsers/
│           ├── cbe-parser.js (HTML parsing utilities)
│           └── telebirr-parser.js
├── repository/
│   └── PaymentVerificationRepository.js
├── dto/
│   └── payment-verification.dto.js (Zod validators)
├── payment-verification.routes.js
└── index.js (module exports)
```

**Matches your existing module pattern** (order, kitchen, menu modules follow same structure)

---

## 4. Provider Abstraction

### Base Provider Interface

**File:** `src/modules/payment-verification/service/providers/PaymentVerificationProvider.js`

```javascript
/**
 * Abstract base class for payment verification providers
 * Each provider (CBE, Telebirr) implements this interface
 */
class PaymentVerificationProvider {
  /**
   * Check if this provider can handle the given QR payload
   * @param {string} rawQrPayload - Raw string from QR scanner
   * @returns {boolean}
   */
  matches(rawQrPayload) {
    throw new Error('Provider.matches() must be implemented');
  }

  /**
   * Verify transaction by fetching data from provider's endpoint
   * @param {string} rawQrPayload - Raw QR string
   * @param {Object} context - Additional context (merchant account, etc.)
   * @returns {Promise<VerificationResult>}
   * @throws {ProviderLookupError} when lookup/parsing fails
   */
  async verify(rawQrPayload, context) {
    throw new Error('Provider.verify() must be implemented');
  }

  /**
   * Get provider name
   * @returns {string} 'cbe' | 'telebirr'
   */
  getName() {
    throw new Error('Provider.getName() must be implemented');
  }
}

module.exports = PaymentVerificationProvider;
```

### Provider Errors

**File:** `src/modules/payment-verification/service/providers/ProviderLookupError.js`

```javascript
class ProviderLookupError extends Error {
  constructor(code, details, reference = null) {
    super(`Provider lookup failed: ${code}`);
    this.name = 'ProviderLookupError';
    this.code = code; // 'CBE_PARSE_FAILED', 'TELEBIRR_TIMEOUT', etc.
    this.details = details; // Full HTML/error for debugging
    this.reference = reference; // Transaction reference (if extracted)
    this.isOperational = true;
  }
}

module.exports = ProviderLookupError;
```

---

## 5. Service Layer

### PaymentVerificationService

**File:** `src/modules/payment-verification/service/PaymentVerificationService.js`

```javascript
const { resolveProvider } = require('./providers');
const PaymentVerificationRepository = require('../repository/PaymentVerificationRepository');
const OrderRepository = require('../../order/repository/OrderRepository');
const OrderService = require('../../order/service/OrderService');
const AppError = require('../../../utils/appError');
const logger = require('../../../utils/logger');
const ProviderLookupError = require('./providers/ProviderLookupError');

class PaymentVerificationService {
  /**
   * Initiate verification by scanning QR and fetching provider data
   * Creates a PaymentVerification record (pending_review or lookup_failed)
   */
  static async initiateVerification({ merchantId, orderId, rawQrPayload, userId }) {
    // 1. Validate order exists and is unpaid
    const order = await OrderRepository.findOne({
      _id: orderId,
      merchant: merchantId,
    });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    if (order.paymentStatus === 'paid') {
      throw new AppError('Order is already paid', 400);
    }

    if (order.status === 'canceled') {
      throw new AppError('Cannot verify payment for canceled order', 400);
    }

    // 2. Detect provider
    let provider;
    try {
      provider = resolveProvider(rawQrPayload);
    } catch (error) {
      throw new AppError('Unsupported QR code format', 400);
    }

    const providerName = provider.getName();

    logger.info('payment.verification.initiated', {
      merchantId: merchantId.toString(),
      orderId: orderId.toString(),
      provider: providerName,
      userId: userId?.toString(),
    });

    // 3. Attempt provider lookup
    let parsed;
    let providerReference;
    let lookupError = null;
    let status = 'pending_review';

    try {
      const context = {
        merchantAccount: order.merchant?.bankAccount, // if you store this
        orderAmount: order.totalAmount,
      };

      parsed = await provider.verify(rawQrPayload, context);
      providerReference = parsed.reference;

      logger.info('payment.verification.provider_lookup_success', {
        provider: providerName,
        reference: providerReference,
        amount: parsed.amount,
      });
    } catch (error) {
      // Provider lookup failed — still create record for manual fallback
      status = 'lookup_failed';
      lookupError = error.message;
      providerReference = error.reference || 'unknown';

      logger.warn('payment.verification.provider_lookup_failed', {
        provider: providerName,
        error: error.message,
        code: error.code,
      });

      parsed = {
        fullRawText: error.details || '',
      };
    }

    // 4. Check for duplicate reference (early — DB index will catch race conditions)
    const existingVerification = await PaymentVerificationRepository.findOne({
      provider: providerName,
      providerReference,
    });

    if (existingVerification) {
      throw new AppError(
        `This ${providerName.toUpperCase()} receipt has already been used for order ${existingVerification.order}`,
        409
      );
    }

    // 5. Calculate validation checks
    const amountMatch =
      parsed.amount && Math.abs(parsed.amount - order.totalAmount) < 0.01;

    // 6. Create verification record
    const verification = await PaymentVerificationRepository.create({
      merchant: merchantId,
      order: orderId,
      provider: providerName,
      providerReference,
      rawQrPayload,
      parsed,
      amountMatch,
      status,
      lookupError,
    });

    logger.info('payment.verification.record_created', {
      verificationId: verification._id.toString(),
      status: verification.status,
      amountMatch: verification.amountMatch,
    });

    return verification;
  }

  /**
   * Confirm verification and mark order as paid
   * Calls your existing OrderService.markAsPaid() workflow
   */
  static async confirmVerification({
    verificationId,
    merchantId,
    staffUserId,
    receiptFileId, // Optional: FileAsset._id from your file upload
  }) {
    // 1. Fetch verification record
    const verification = await PaymentVerificationRepository.findOne({
      _id: verificationId,
      merchant: merchantId,
    });

    if (!verification) {
      throw new AppError('Verification record not found', 404);
    }

    if (verification.status !== 'pending_review') {
      throw new AppError(
        `Cannot confirm verification with status '${verification.status}'`,
        409
      );
    }

    // 2. Fetch order
    const order = await OrderRepository.findById(verification.order);

    if (!order) {
      throw new AppError('Associated order not found', 404);
    }

    if (order.paymentStatus === 'paid') {
      throw new AppError('Order is already paid', 400);
    }

    logger.info('payment.verification.confirming', {
      verificationId: verificationId.toString(),
      orderId: order._id.toString(),
      staffUserId: staffUserId?.toString(),
    });

    // 3. Update verification status
    verification.status = 'verified';
    verification.verifiedBy = staffUserId;
    verification.verifiedAt = new Date();
    if (receiptFileId) {
      verification.receiptFileRef = receiptFileId;
    }
    await verification.save();

    // 4. Mark order as paid using your existing service
    // This handles: paymentStatus, loyalty points, table cleanup, notifications, etc.
    const mockReq = {
      params: { id: order._id.toString() },
      body: {
        paymentMethod: verification.provider === 'cbe' ? 'mobile_banking' : 'mobile_banking',
        bankName: verification.provider === 'cbe' ? 'CBE' : 'Telebirr',
      },
      user: staffUserId ? { _id: staffUserId } : null,
      merchant: { _id: merchantId },
      customer: order.customer ? { _id: order.customer } : null,
    };

    await OrderService.markAsPaid(mockReq);

    logger.info('payment.verification.confirmed', {
      verificationId: verificationId.toString(),
      orderId: order._id.toString(),
    });

    return verification;
  }

  /**
   * Reject verification (merchant doesn't trust the receipt)
   */
  static async rejectVerification({
    verificationId,
    merchantId,
    staffUserId,
    reason,
  }) {
    const verification = await PaymentVerificationRepository.findOne({
      _id: verificationId,
      merchant: merchantId,
    });

    if (!verification) {
      throw new AppError('Verification record not found', 404);
    }

    if (verification.status !== 'pending_review') {
      throw new AppError(
        `Cannot reject verification with status '${verification.status}'`,
        409
      );
    }

    verification.status = 'rejected';
    verification.verifiedBy = staffUserId;
    verification.verifiedAt = new Date();
    verification.rejectionReason = reason;
    await verification.save();

    logger.info('payment.verification.rejected', {
      verificationId: verificationId.toString(),
      reason,
    });

    return verification;
  }

  /**
   * Retry lookup for failed verifications
   */
  static async retryLookup({ verificationId, merchantId }) {
    const verification = await PaymentVerificationRepository.findOne({
      _id: verificationId,
      merchant: merchantId,
    });

    if (!verification) {
      throw new AppError('Verification record not found', 404);
    }

    if (verification.status !== 'lookup_failed') {
      throw new AppError('Can only retry failed lookups', 400);
    }

    // Re-run initiate logic but update existing record
    const provider = resolveProvider(verification.rawQrPayload);
    const order = await OrderRepository.findById(verification.order);

    try {
      const parsed = await provider.verify(verification.rawQrPayload, {
        orderAmount: order.totalAmount,
      });

      verification.parsed = parsed;
      verification.providerReference = parsed.reference;
      verification.amountMatch =
        Math.abs(parsed.amount - order.totalAmount) < 0.01;
      verification.status = 'pending_review';
      verification.lookupError = null;
      verification.retryCount += 1;

      await verification.save();

      logger.info('payment.verification.retry_success', {
        verificationId: verificationId.toString(),
      });
    } catch (error) {
      verification.lookupError = error.message;
      verification.retryCount += 1;
      await verification.save();

      logger.warn('payment.verification.retry_failed', {
        verificationId: verificationId.toString(),
        error: error.message,
      });

      throw new AppError('Retry failed: ' + error.message, 500);
    }

    return verification;
  }

  /**
   * Get verification by ID
   */
  static async getById(verificationId, merchantId) {
    const verification = await PaymentVerificationRepository.findOne({
      _id: verificationId,
      merchant: merchantId,
    })
      .populate('order', 'orderNumber totalAmount status paymentStatus')
      .populate('verifiedBy', 'firstName lastName email')
      .populate('receiptFileRef', 'storageKey mimeType originalName');

    if (!verification) {
      throw new AppError('Verification record not found', 404);
    }

    return verification;
  }

  /**
   * List verifications for an order
   */
  static async listByOrder(orderId, merchantId) {
    return PaymentVerificationRepository.find({
      order: orderId,
      merchant: merchantId,
    }).sort({ createdAt: -1 });
  }
}

module.exports = PaymentVerificationService;
```

---

## 6. Integration with Existing Order Flow

### How It Fits

**Your Current Flow:**
```javascript
// In orders.routes.js
router.post('/:id/pay', upload.single('image'), markAsPaid);

// In order.controller.js
async markAsPaid(req, res) {
  const order = await OrderService.markAsPaid(req);
  res.status(200).json({ success: true, data: { order } });
}
```

**New Flow Adds a Pre-Step:**
```
Before: Staff → Upload receipt → markAsPaid

After:  Staff → Scan QR → initiateVerification → Review → confirmVerification
                                                              ↓
                                                        markAsPaid (reused)
```

### No Changes to OrderService.markAsPaid()

✅ Your existing `markAsPaid()` logic remains **100% unchanged**  
✅ Payment verification is an **optional verification layer**  
✅ Staff can still use the old flow (direct payment without verification)

---

## 7. API Endpoints

### Routes File

**File:** `src/modules/payment-verification/payment-verification.routes.js`

```javascript
const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const validate = require('../../common/middleware/validate.middleware');
const paymentVerificationController = require('./controller/payment-verification.controller');
const {
  initiateVerificationSchema,
  confirmVerificationSchema,
  rejectVerificationSchema,
} = require('./dto/payment-verification.dto');

// All routes require authentication
router.use(protect);

/**
 * POST /api/v1/payment-verification/initiate
 * Scan QR and fetch provider data
 */
router.post(
  '/initiate',
  restrictTo('waiter', 'admin', 'superAdmin'),
  validate(initiateVerificationSchema, 'body'),
  paymentVerificationController.initiateVerification
);

/**
 * POST /api/v1/payment-verification/:id/confirm
 * Merchant confirms verification → marks order paid
 */
router.post(
  '/:id/confirm',
  restrictTo('waiter', 'admin', 'superAdmin'),
  validate(confirmVerificationSchema, 'body'),
  paymentVerificationController.confirmVerification
);

/**
 * POST /api/v1/payment-verification/:id/reject
 * Merchant rejects verification
 */
router.post(
  '/:id/reject',
  restrictTo('waiter', 'admin', 'superAdmin'),
  validate(rejectVerificationSchema, 'body'),
  paymentVerificationController.rejectVerification
);

/**
 * POST /api/v1/payment-verification/:id/retry
 * Retry failed lookup
 */
router.post(
  '/:id/retry',
  restrictTo('waiter', 'admin', 'superAdmin'),
  paymentVerificationController.retryLookup
);

/**
 * GET /api/v1/payment-verification/:id
 * Get verification details
 */
router.get(
  '/:id',
  restrictTo('waiter', 'admin', 'superAdmin'),
  paymentVerificationController.getById
);

/**
 * GET /api/v1/payment-verification
 * List verifications (with filters)
 */
router.get(
  '/',
  restrictTo('waiter', 'admin', 'superAdmin'),
  paymentVerificationController.list
);

module.exports = router;
```

### Register in Main Routes

**File:** `src/routes/index.js` (add after orders):

```javascript
const paymentVerificationRoutes = require('../modules/payment-verification/payment-verification.routes');

// ... existing routes

router.use('/api/v1/payment-verification', paymentVerificationRoutes);
```

---

## 8. RBAC Tasks

### Add to seed-roles-and-tasks.js

```javascript
// ========== PAYMENT VERIFICATION MODULE (6 tasks) ==========
{
  name: 'paymentVerification.initiate',
  endpoint: '/api/v1/payment-verification/initiate',
  method: 'POST',
  description: 'Initiate payment verification from QR',
  isMerchant: true,
  hidden: false
},
{
  name: 'paymentVerification.confirm',
  endpoint: '/api/v1/payment-verification/:id/confirm',
  method: 'POST',
  description: 'Confirm verified payment',
  isMerchant: true,
  hidden: false
},
{
  name: 'paymentVerification.reject',
  endpoint: '/api/v1/payment-verification/:id/reject',
  method: 'POST',
  description: 'Reject payment verification',
  isMerchant: true,
  hidden: false
},
{
  name: 'paymentVerification.retry',
  endpoint: '/api/v1/payment-verification/:id/retry',
  method: 'POST',
  description: 'Retry failed lookup',
  isMerchant: true,
  hidden: false
},
{
  name: 'paymentVerification.read',
  endpoint: '/api/v1/payment-verification/:id',
  method: 'GET',
  description: 'View verification details',
  isMerchant: true,
  hidden: false
},
{
  name: 'paymentVerification.list',
  endpoint: '/api/v1/payment-verification',
  method: 'GET',
  description: 'List payment verifications',
  isMerchant: true,
  hidden: false
},
```

**Updated counts:**
- Total tasks: 218 → **224**
- Merchant-scoped: 193 → **199**

---

## 9. Implementation Phases

### Phase 0: Research & Fixtures (1-2 days)

**DO NOT CODE YET**

1. ✅ Collect **5 real CBE receipts** from different transactions
2. ✅ Collect **5 real Telebirr receipts** (both telebirr→telebirr and telebirr→bank)
3. ✅ Scan QR codes manually (use any QR scanner app)
4. ✅ Visit the URLs, save the HTML responses as fixture files
5. ✅ Document the actual field structure (don't assume from this guide)

**Output:** `tests/fixtures/payment-verification/` folder with:
- `cbe-sample-1.html` through `cbe-sample-5.html`
- `telebirr-sample-1.html` through `telebirr-sample-5.html`
- `qr-strings.json` (mapping sample → actual QR string)

### Phase 1: Scaffold (1 day)

1. ✅ Create module folder structure
2. ✅ Create PaymentVerification model with indexes
3. ✅ Create repository (CRUD methods)
4. ✅ Create empty controller/service
5. ✅ Register routes (no implementation yet)
6. ✅ Add RBAC tasks to seeder
7. ✅ Run seeder to create tasks

**Milestone:** Module exists, routes return 501 Not Implemented

### Phase 2: CBE Provider (2-3 days)

1. ✅ Implement CbeProvider.matches()
2. ✅ Implement CBE HTML parser (based on your fixtures)
3. ✅ Write unit tests (mock axios with fixture HTML)
4. ✅ Test against all 5 CBE samples
5. ✅ Implement CbeProvider.verify()

**Milestone:** CBE provider works on test fixtures (95%+ parse accuracy)

### Phase 3: Telebirr Provider (2-3 days)

1. ✅ Implement TelebirrProvider.matches()
2. ✅ Implement Telebirr HTML parser (handle both layout variants)
3. ✅ Write unit tests
4. ✅ Test against all 5 Telebirr samples
5. ✅ Implement TelebirrProvider.verify()

**Milestone:** Telebirr provider works on test fixtures

### Phase 4: Service Integration (2 days)

1. ✅ Implement PaymentVerificationService.initiateVerification()
2. ✅ Implement PaymentVerificationService.confirmVerification()
3. ✅ Wire up to existing OrderService.markAsPaid()
4. ✅ Write integration tests
5. ✅ Test duplicate reference detection

**Milestone:** Full flow works end-to-end in tests

### Phase 5: Controller & Routes (1 day)

1. ✅ Implement all controller methods
2. ✅ Add Zod validators
3. ✅ Add error handling
4. ✅ Test all endpoints with Postman/curl

**Milestone:** API endpoints work, return proper errors

### Phase 6: Manual Fallback (1 day)

1. ✅ Add `manualVerification` field to PaymentVerification model
2. ✅ Implement manual entry endpoint (skip provider lookup)
3. ✅ Document staff workflow for bank outages

**Milestone:** System works even when provider endpoints are down

### Phase 7: Production Testing (2-3 days)

1. ✅ Test with real QR codes in staging
2. ✅ Monitor provider endpoint availability
3. ✅ Test error scenarios (wrong QR, duplicate, amount mismatch)
4. ✅ Load test (100+ verifications/hour)
5. ✅ Security audit (injection attacks, race conditions)

**Milestone:** Ready for production deployment

---

## 10. Testing Strategy

### Unit Tests

```javascript
// tests/payment-verification/providers/cbe-provider.test.js
describe('CbeProvider', () => {
  it('matches CBE QR URLs', () => {
    const provider = new CbeProvider();
    expect(provider.matches('https://apps.cbe.com.et:100/?id=...')).toBe(true);
    expect(provider.matches('https://telebirr...')).toBe(false);
  });

  it('parses CBE HTML correctly', async () => {
    const html = fs.readFileSync('tests/fixtures/payment-verification/cbe-sample-1.html', 'utf8');
    axios.get = jest.fn().mockResolvedValue({ data: html });

    const provider = new CbeProvider();
    const result = await provider.verify('https://apps.cbe.com.et:100/?id=FT123', {});

    expect(result.amount).toBe(450);
    expect(result.payerName).toBeTruthy();
    expect(result.reference).toBe('FT123');
  });
});
```

### Integration Tests

```javascript
// tests/payment-verification/payment-verification-integration.test.js
describe('Payment Verification Integration', () => {
  it('full flow: initiate → confirm → order paid', async () => {
    // Create unpaid order
    const order = await Order.create({ ... });

    // Mock provider response
    mockProvider.verify.mockResolvedValue({
      reference: 'FT123',
      amount: order.totalAmount,
      payerName: 'John Doe',
    });

    // Initiate
    const verification = await PaymentVerificationService.initiateVerification({
      merchantId: merchant._id,
      orderId: order._id,
      rawQrPayload: 'https://apps.cbe.com.et:100/?id=FT123',
    });

    expect(verification.status).toBe('pending_review');
    expect(verification.amountMatch).toBe(true);

    // Confirm
    await PaymentVerificationService.confirmVerification({
      verificationId: verification._id,
      merchantId: merchant._id,
      staffUserId: staff._id,
    });

    // Verify order paid
    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.paymentStatus).toBe('paid');

    // Verify verification record updated
    const updatedVerification = await PaymentVerification.findById(verification._id);
    expect(updatedVerification.status).toBe('verified');
  });

  it('rejects duplicate reference', async () => {
    // Create first verification
    await PaymentVerification.create({
      merchant: merchant._id,
      order: order1._id,
      provider: 'cbe',
      providerReference: 'FT123',
      status: 'verified',
    });

    // Try to use same reference
    await expect(
      PaymentVerificationService.initiateVerification({
        merchantId: merchant._id,
        orderId: order2._id,
        rawQrPayload: 'https://apps.cbe.com.et:100/?id=FT123',
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: /already been used/,
    });
  });
});
```

---

## 11. Risks & Mitigations

### Risk 1: Provider Endpoints Change/Break

**Probability:** High  
**Impact:** High (verification stops working)

**Mitigation:**
1. ✅ Store full HTML in `parsed.fullRawText` for debugging
2. ✅ Implement `status: 'lookup_failed'` + manual fallback
3. ✅ Monitor parse failure rate (alert if >10%)
4. ✅ Log raw HTML on parse failures
5. ✅ Document manual verification process for staff

### Risk 2: Legal/ToS Gray Area

**Probability:** Medium  
**Impact:** Critical (potential legal issues)

**Mitigation:**
1. ⚠️ Consult legal/compliance team before launch
2. ⚠️ Add rate limiting (max 10 lookups/minute per merchant)
3. ⚠️ Document that this is "receipt verification" not payment processing
4. ⚠️ Consider official API partnerships with CBE/Telebirr (long-term)

### Risk 3: Fraud (Photoshopped Receipts)

**Probability:** Medium  
**Impact:** Medium (financial loss)

**Mitigation:**
1. ✅ Server-side verification (not client-side trust)
2. ✅ Unique reference constraint (can't reuse same receipt)
3. ✅ Amount matching required
4. ✅ Audit trail (who verified, when)
5. ✅ Manual review step (merchant must confirm)

### Risk 4: Race Conditions (Concurrent Verifications)

**Probability:** Low  
**Impact:** Medium (duplicate receipt use)

**Mitigation:**
1. ✅ Unique database index (provider + reference)
2. ✅ Mongoose transactions in confirmVerification
3. ✅ Early duplicate check in service

---

## 12. Production Considerations

### Monitoring

```javascript
// Add to your logger
logger.info('payment.verification.initiated', { merchantId, orderId, provider });
logger.warn('payment.verification.provider_lookup_failed', { provider, error });
logger.info('payment.verification.confirmed', { verificationId, orderId });
```

### Alerts

1. **Parse Failure Rate > 10%:** Provider HTML changed
2. **Lookup Timeout Rate > 20%:** Provider endpoint down
3. **Duplicate Reference Attempts:** Potential fraud

### Feature Flags

```javascript
// In merchant model or feature config
{
  features: {
    paymentVerification: {
      enabled: true,
      providers: ['cbe', 'telebirr'],
      requiresManualReview: true, // Force human confirmation even on perfect match
    }
  }
}
```

### Documentation

1. ✅ Staff training guide (how to scan, what to check)
2. ✅ Troubleshooting guide (lookup failed → manual entry)
3. ✅ API reference for frontend team
4. ✅ Security/audit documentation

---

## Summary

This implementation:

✅ **Reuses your existing patterns:** Module structure, RBAC, audit plugin, transactions  
✅ **Integrates cleanly:** Wraps existing `markAsPaid()`, no breaking changes  
✅ **Handles failures gracefully:** `lookup_failed` + manual fallback  
✅ **Prevents fraud:** Unique reference constraint, server-side verification  
✅ **Maintainable:** Provider abstraction, comprehensive tests  

**Estimated Time:** 2-3 weeks (including testing)  
**Complexity:** Medium (mostly HTML scraping + flow integration)  
**Risk Level:** Medium (depends on provider stability)

---

**Next Steps:**

1. ✅ Get product owner approval
2. ✅ Collect real receipt samples (Phase 0)
3. ✅ Scaffold module (Phase 1)
4. ✅ Implement providers (Phases 2-3)
5. ✅ Integrate with order flow (Phase 4-5)
6. ✅ Add manual fallback (Phase 6)
7. ✅ Production testing (Phase 7)

Want me to start with Phase 0 (fixture collection script) or Phase 1 (module scaffold)?
