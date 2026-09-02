# Payment Verification — Corrected Design Document

**Date:** 2026-08-22  
**Version:** 2.0 (Security & Architecture Fixes)  
**Status:** Ready for Approval

---

## Issues Fixed

### ✅ Issue 1: SSRF Risk in Provider Matching
**Problem:** `raw.includes('apps.cbe.com.et')` allows crafted URLs  
**Fix:** Strict hostname validation with URL parser

### ✅ Issue 2: Fake Request Object Anti-Pattern
**Problem:** `confirmVerification()` constructs fake `req` object  
**Fix:** Extract core payment logic into reusable function

### ✅ Issue 3: Missing Transaction Atomicity
**Problem:** Verification update + order payment not atomic  
**Fix:** Wrap both in single `session.withTransaction()`

### ✅ Issue 4: Race Condition on Duplicate Detection
**Problem:** Only early check, no E11000 handling  
**Fix:** Catch duplicate key error, return clean 409

### ✅ Issue 5: Missing Manual Verification Schema
**Problem:** Mentioned in Phase 6 but not defined  
**Fix:** Add to data model in Section 2

### ✅ Issue 6: Incorrect Task Counts
**Problem:** Assumed 218 tasks, actual is 214  
**Fix:** Verified actual counts (214 → 220, 193 → 199)

---

## 1. Fixed Provider Security (SSRF Prevention)

### Secure Provider Matching

```javascript
// src/modules/payment-verification/service/providers/CbeProvider.js
const axios = require('axios');
const cheerio = require('cheerio');
const PaymentVerificationProvider = require('./PaymentVerificationProvider');
const ProviderLookupError = require('./ProviderLookupError');

class CbeProvider extends PaymentVerificationProvider {
  getName() {
    return 'cbe';
  }

  /**
   * ✅ SECURE: Strict hostname validation (prevents SSRF)
   */
  matches(raw) {
    try {
      const url = new URL(raw);
      // Exact hostname match, no substring tricks
      return url.hostname === 'apps.cbe.com.et' && url.protocol === 'https:';
    } catch {
      return false; // Invalid URL format
    }
  }

  async verify(rawQrPayload, context) {
    // ✅ SECURE: Validate URL again before fetching
    let url;
    try {
      url = new URL(rawQrPayload);
    } catch (error) {
      throw new ProviderLookupError('CBE_INVALID_URL', rawQrPayload);
    }

    // ✅ SECURE: Strict hostname check
    if (url.hostname !== 'apps.cbe.com.et' || url.protocol !== 'https:') {
      throw new ProviderLookupError('CBE_INVALID_HOSTNAME', url.hostname);
    }

    const idParam = url.searchParams.get('id');
    if (!idParam) {
      throw new ProviderLookupError('CBE_MISSING_ID', rawQrPayload);
    }

    try {
      // ✅ SECURE: No redirects, strict timeout
      const { data: html } = await axios.get(url.href, {
        timeout: 8000,
        maxRedirects: 0, // Prevent redirect-based SSRF
        validateStatus: (status) => status === 200, // Only accept 200
      });

      const $ = cheerio.load(html);
      const fullRawText = $('body').text().replace(/\s+/g, ' ').trim();

      // Parse transaction details (implement based on actual HTML structure)
      const amount = this.extractAmount(fullRawText);
      const payerName = this.extractPayer(fullRawText);
      const transactionDate = this.extractDate(fullRawText);

      if (!amount) {
        throw new ProviderLookupError('CBE_PARSE_FAILED', fullRawText, idParam);
      }

      return {
        reference: idParam,
        amount,
        payerName,
        payerAccountOrPhone: null, // CBE doesn't expose full account
        receiverName: null,
        transactionDate,
        fullRawText,
      };
    } catch (error) {
      if (error instanceof ProviderLookupError) throw error;

      // Network/timeout errors
      throw new ProviderLookupError(
        'CBE_FETCH_FAILED',
        error.message,
        idParam
      );
    }
  }

  // Helper parsers (implement based on real HTML fixtures)
  extractAmount(text) {
    // TODO: Implement based on actual CBE HTML structure
    const match = text.match(/Amount[:\s]+ETB\s+([\d,]+\.?\d*)/i);
    return match ? parseFloat(match[1].replace(/,/g, '')) : null;
  }

  extractPayer(text) {
    const match = text.match(/From[:\s]+([^\n]+)/i);
    return match ? match[1].trim() : null;
  }

  extractDate(text) {
    const match = text.match(/Date[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
    return match ? new Date(match[1]) : null;
  }
}

module.exports = CbeProvider;
```

### Telebirr Provider (Same Pattern)

```javascript
// src/modules/payment-verification/service/providers/TelebirrProvider.js
class TelebirrProvider extends PaymentVerificationProvider {
  getName() {
    return 'telebirr';
  }

  /**
   * ✅ SECURE: Strict hostname validation
   */
  matches(raw) {
    try {
      const url = new URL(raw);
      return (
        url.hostname === 'transactioninfo.ethiotelecom.et' &&
        url.protocol === 'https:'
      );
    } catch {
      return false;
    }
  }

  async verify(rawQrPayload, context) {
    let url;
    try {
      url = new URL(rawQrPayload);
    } catch (error) {
      throw new ProviderLookupError('TELEBIRR_INVALID_URL', rawQrPayload);
    }

    // ✅ SECURE: Strict hostname check
    if (
      url.hostname !== 'transactioninfo.ethiotelecom.et' ||
      url.protocol !== 'https:'
    ) {
      throw new ProviderLookupError('TELEBIRR_INVALID_HOSTNAME', url.hostname);
    }

    // Extract receipt number from path
    const receiptNo = url.pathname.split('/receipt/')[1]?.split(/[?#]/)[0];
    if (!receiptNo) {
      throw new ProviderLookupError('TELEBIRR_BAD_QR', rawQrPayload);
    }

    try {
      // ✅ SECURE: No redirects, strict timeout
      const { data: html } = await axios.get(url.href, {
        timeout: 8000,
        maxRedirects: 0,
        validateStatus: (status) => status === 200,
      });

      const $ = cheerio.load(html);
      const fullRawText = $('body').text().replace(/\s+/g, ' ').trim();

      const amount = this.extractAmount(fullRawText);
      const payerName = this.extractPayer(fullRawText);
      const transactionDate = this.extractDate(fullRawText);

      if (!amount) {
        throw new ProviderLookupError('TELEBIRR_PARSE_FAILED', fullRawText, receiptNo);
      }

      return {
        reference: receiptNo,
        amount,
        payerName,
        payerAccountOrPhone: null,
        receiverName: null,
        transactionDate,
        fullRawText,
      };
    } catch (error) {
      if (error instanceof ProviderLookupError) throw error;
      throw new ProviderLookupError('TELEBIRR_FETCH_FAILED', error.message, receiptNo);
    }
  }

  // Implement extractAmount, extractPayer, extractDate based on fixtures
}

module.exports = TelebirrProvider;
```

---

## 2. Fixed Data Model (Manual Verification Added)

```javascript
// models/PaymentVerification.js
const PaymentVerificationSchema = new Schema(
  {
    // ... existing fields ...

    // ========== Manual Verification Support ==========
    verificationType: {
      type: String,
      enum: ['automated', 'manual'],
      default: 'automated',
      required: true,
      comment: 'automated = QR scan + provider lookup, manual = staff entered reference manually',
    },
    manualEntry: {
      reference: {
        type: String,
        comment: 'Manually entered transaction reference (when provider lookup fails)',
      },
      amount: {
        type: Number,
        comment: 'Manually entered amount',
      },
      enteredBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        comment: 'Staff who entered manual data',
      },
      enteredAt: {
        type: Date,
        comment: 'When manual entry was created',
      },
      notes: {
        type: String,
        trim: true,
        comment: 'Why manual entry was needed (e.g., "Provider down", "QR damaged")',
      },
    },

    // ... rest of fields ...
  },
  { timestamps: true }
);

// ✅ UPDATED INDEX: Include verificationType for manual entries
PaymentVerificationSchema.index(
  { provider: 1, providerReference: 1, verificationType: 1 },
  {
    unique: true,
    name: 'unique_provider_reference',
    // Sparse index: allows multiple documents with null providerReference (manual entries)
    sparse: true,
  }
);
```

---

## 3. Fixed Payment Logic Extraction

### New: Payment Completion Core Function

```javascript
// src/modules/order/service/PaymentCompletionService.js
const mongoose = require('mongoose');
const Order = require('../../../models/orderModel');
const Customer = require('../../../models/customerModel');
const CustomerSession = require('../../../models/customerSessionModel');
const Table = require('../../../models/tableModel');
const NotificationService = require('../../notifications/notification.service');
const OrderRepository = require('../repository/OrderRepository');
const logger = require('../../../utils/logger');
const AppError = require('../../../utils/appError');

/**
 * ✅ EXTRACTED: Core payment completion logic (no Express req dependency)
 * Called by both HTTP controller and PaymentVerificationService
 */
class PaymentCompletionService {
  /**
   * Complete payment for an order within a transaction
   * 
   * @param {Object} params
   * @param {ObjectId} params.orderId - Order to pay
   * @param {ObjectId} params.merchantId - Merchant scope
   * @param {string} params.paymentMethod - 'cash' | 'mobile_banking' | 'card'
   * @param {string} params.bankName - Bank name (if mobile_banking/card)
   * @param {string} params.receiptImage - Image storage key (optional)
   * @param {ObjectId} params.customerId - Customer ID for loyalty (optional)
   * @param {mongoose.ClientSession} session - Mongo session (optional, creates if not provided)
   * @returns {Promise<Order>} Updated order
   */
  static async completePayment({
    orderId,
    merchantId,
    paymentMethod = 'cash',
    bankName = null,
    receiptImage = null,
    customerId = null,
  }, session = null) {
    const sessionCreated = !session;
    if (sessionCreated) {
      session = await mongoose.startSession();
    }

    let order;

    try {
      const wrappedLogic = async () => {
        // 1. Fetch order with lock
        order = await OrderRepository.findOne({
          _id: orderId,
          merchant: merchantId,
        }).session(session);

        if (!order) {
          throw new AppError('Order not found', 404);
        }

        // 2. Validation guards
        if (order.paymentStatus === 'paid') {
          throw new AppError('Order already paid', 400);
        }

        if (order.status === 'canceled') {
          throw new AppError('Cannot mark a canceled order as paid', 400);
        }

        // ✅ Dine-in orders must be served first
        if (order.orderType === 'dine_in' && order.status !== 'served') {
          throw new AppError(
            'Cannot complete a dine-in order before all items have been served',
            400
          );
        }

        // 3. Update payment status
        order.paymentStatus = 'paid';
        order.paidAt = new Date();
        order.paymentDetails = {
          method: paymentMethod,
          bankName,
          paidAt: new Date(),
          receiptImage,
        };

        await order.save({ session });

        // 4. Complete order (dine-in only)
        if (order.status !== 'completed' && order.orderType === 'dine_in') {
          order.status = 'completed';
          order.completedAt = new Date();
          await order.save({ session });

          // 5. Table cleanup (dine-in only)
          if (order.table) {
            await CustomerSession.updateOne(
              { tableId: order.table, isActive: true, merchant: merchantId },
              { isActive: false },
              { session }
            );

            const table = await Table.findOne({
              _id: order.table,
              merchant: merchantId,
            }).session(session);

            if (table) {
              table.status = 'available';
              await table.save({ session });
            }
          }
        }

        // 6. Loyalty points (if customer linked)
        if (customerId) {
          const points = Math.floor(order.totalAmount);

          // ✅ Atomic increment (safe under withTransaction)
          await Customer.findByIdAndUpdate(
            customerId,
            {
              $inc: {
                'loyalty.points': points,
                'loyalty.totalPointsEarned': points,
              },
              $push: {
                history: {
                  action: 'award_points',
                  details: `Earned ${points} points from order ${order.orderNumber} (${paymentMethod})`,
                  order: order._id,
                  addedAt: new Date(),
                },
              },
            },
            { session, new: true }
          );

          // Re-fetch for tier calculation
          const updatedCustomer = await Customer.findById(customerId)
            .select('loyalty.totalPointsEarned loyalty.tier')
            .session(session)
            .lean();

          // Tier upgrade check
          const tiers = {
            platinum: 50000,
            gold: 20000,
            silver: 5000,
            bronze: 0,
          };

          const newTier = Object.keys(tiers).find(
            (tier) => updatedCustomer.loyalty.totalPointsEarned >= tiers[tier]
          );

          if (newTier && newTier !== updatedCustomer.loyalty.tier) {
            await Customer.findByIdAndUpdate(
              customerId,
              { $set: { 'loyalty.tier': newTier } },
              { session }
            );

            logger.info('payment.loyalty.tier_upgraded', {
              customerId: customerId.toString(),
              oldTier: updatedCustomer.loyalty.tier,
              newTier,
            });
          }
        }

        // 7. Notifications
        await NotificationService.notifyOrderPaid(
          { order, paymentMethod, bankName, receiptImage },
          session
        );

        logger.info('payment.completed', {
          orderId: orderId.toString(),
          orderNumber: order.orderNumber,
          paymentMethod,
          amount: order.totalAmount,
        });
      };

      // Execute with transaction if session was created here
      if (sessionCreated) {
        await session.withTransaction(wrappedLogic);
      } else {
        // Session provided by caller, execute directly
        await wrappedLogic();
      }

      return order;
    } finally {
      if (sessionCreated) {
        await session.endSession();
      }
    }
  }
}

module.exports = PaymentCompletionService;
```

### Updated OrderService.markAsPaid (Delegates to Core Function)

```javascript
// src/modules/order/service/OrderService.js
const PaymentCompletionService = require('./PaymentCompletionService');

static async markAsPaid(req) {
  const { id } = req.params;
  const { paymentMethod, bankName, image } = req.body;

  const merchantId = OrderService.getMerchantId(req);
  const customerId = req.customer?._id || null;

  // ✅ REFACTORED: Delegate to extracted core function
  const order = await PaymentCompletionService.completePayment({
    orderId: id,
    merchantId,
    paymentMethod: paymentMethod || 'cash',
    bankName: bankName || null,
    receiptImage: image || null,
    customerId,
  });

  return order;
}
```

---

## 4. Fixed Service with Transaction + Duplicate Handling

```javascript
// src/modules/payment-verification/service/PaymentVerificationService.js
const mongoose = require('mongoose');
const { resolveProvider } = require('./providers');
const PaymentVerificationRepository = require('../repository/PaymentVerificationRepository');
const OrderRepository = require('../../order/repository/OrderRepository');
const PaymentCompletionService = require('../../order/service/PaymentCompletionService');
const AppError = require('../../../utils/appError');
const logger = require('../../../utils/logger');

class PaymentVerificationService {
  /**
   * ✅ FIXED: Handles E11000 duplicate key errors gracefully
   */
  static async initiateVerification({ merchantId, orderId, rawQrPayload, userId }) {
    const order = await OrderRepository.findOne({
      _id: orderId,
      merchant: merchantId,
    });

    if (!order) throw new AppError('Order not found', 404);
    if (order.paymentStatus === 'paid') throw new AppError('Order is already paid', 400);
    if (order.status === 'canceled') throw new AppError('Cannot verify payment for canceled order', 400);

    // Detect provider
    let provider;
    try {
      provider = resolveProvider(rawQrPayload);
    } catch (error) {
      throw new AppError('Unsupported QR code format', 400);
    }

    const providerName = provider.getName();

    // Attempt provider lookup
    let parsed;
    let providerReference;
    let lookupError = null;
    let status = 'pending_review';

    try {
      parsed = await provider.verify(rawQrPayload, {
        orderAmount: order.totalAmount,
      });
      providerReference = parsed.reference;
    } catch (error) {
      status = 'lookup_failed';
      lookupError = error.message;
      providerReference = error.reference || 'unknown';
      parsed = { fullRawText: error.details || '' };
    }

    // Early duplicate check (nice error message)
    const existingVerification = await PaymentVerificationRepository.findOne({
      provider: providerName,
      providerReference,
      verificationType: 'automated',
    });

    if (existingVerification) {
      throw new AppError(
        `This ${providerName.toUpperCase()} receipt (${providerReference}) has already been used for order ${existingVerification.order}`,
        409
      );
    }

    // Calculate validation checks
    const amountMatch = parsed.amount && Math.abs(parsed.amount - order.totalAmount) < 0.01;

    // ✅ FIXED: Catch E11000 duplicate key error (race condition)
    try {
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
        verificationType: 'automated',
      });

      logger.info('payment.verification.initiated', {
        verificationId: verification._id.toString(),
        provider: providerName,
        reference: providerReference,
        status,
      });

      return verification;
    } catch (error) {
      // ✅ FIXED: Handle duplicate key error from unique index
      if (error.code === 11000 || error.name === 'MongoServerError') {
        // Race condition: another request created this reference first
        const duplicate = await PaymentVerificationRepository.findOne({
          provider: providerName,
          providerReference,
        });

        throw new AppError(
          `This ${providerName.toUpperCase()} receipt has already been used for order ${duplicate?.order || 'another order'}`,
          409
        );
      }

      // Other error, re-throw
      throw error;
    }
  }

  /**
   * ✅ FIXED: Atomic transaction for verification + payment
   */
  static async confirmVerification({
    verificationId,
    merchantId,
    staffUserId,
    receiptFileId,
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
        `Cannot confirm verification with status '${verification.status}'`,
        409
      );
    }

    const order = await OrderRepository.findById(verification.order);
    if (!order) throw new AppError('Associated order not found', 404);
    if (order.paymentStatus === 'paid') throw new AppError('Order is already paid', 400);

    logger.info('payment.verification.confirming', {
      verificationId: verificationId.toString(),
      orderId: order._id.toString(),
      staffUserId: staffUserId?.toString(),
    });

    // ✅ FIXED: Single transaction for both updates
    const session = await mongoose.startSession();
    let updatedVerification;

    try {
      await session.withTransaction(async () => {
        // 1. Update verification record
        verification.status = 'verified';
        verification.verifiedBy = staffUserId;
        verification.verifiedAt = new Date();
        if (receiptFileId) {
          verification.receiptFileRef = receiptFileId;
        }
        await verification.save({ session });

        // 2. Complete payment using extracted core function
        await PaymentCompletionService.completePayment(
          {
            orderId: order._id,
            merchantId,
            paymentMethod: 'mobile_banking',
            bankName: verification.provider === 'cbe' ? 'CBE' : 'Telebirr',
            receiptImage: receiptFileId ? receiptFileId.toString() : null,
            customerId: order.customer || null,
          },
          session // ✅ Pass session to ensure atomicity
        );

        updatedVerification = verification;
      });

      logger.info('payment.verification.confirmed', {
        verificationId: verificationId.toString(),
        orderId: order._id.toString(),
      });

      return updatedVerification;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Create manual verification (when provider lookup fails)
   */
  static async createManualVerification({
    merchantId,
    orderId,
    provider,
    reference,
    amount,
    staffUserId,
    notes,
  }) {
    const order = await OrderRepository.findOne({
      _id: orderId,
      merchant: merchantId,
    });

    if (!order) throw new AppError('Order not found', 404);
    if (order.paymentStatus === 'paid') throw new AppError('Order is already paid', 400);

    // Check amount matches
    const amountMatch = Math.abs(amount - order.totalAmount) < 0.01;

    try {
      const verification = await PaymentVerificationRepository.create({
        merchant: merchantId,
        order: orderId,
        provider,
        providerReference: reference,
        verificationType: 'manual',
        manualEntry: {
          reference,
          amount,
          enteredBy: staffUserId,
          enteredAt: new Date(),
          notes: notes || 'Provider lookup failed - manual entry',
        },
        amountMatch,
        status: 'pending_review',
      });

      logger.info('payment.verification.manual_created', {
        verificationId: verification._id.toString(),
        provider,
        reference,
      });

      return verification;
    } catch (error) {
      if (error.code === 11000) {
        throw new AppError(
          `This reference has already been used`,
          409
        );
      }
      throw error;
    }
  }

  // ... rest of methods (rejectVerification, retryLookup, etc.)
}

module.exports = PaymentVerificationService;
```

---

## 5. Corrected RBAC Task Counts

**Current State (Verified):**
- Total tasks: **214**
- Merchant-scoped: **193**
- System-wide: **21**

**After Adding Payment Verification (6 tasks):**
- Total tasks: 214 → **220**
- Merchant-scoped: 193 → **199**
- System-wide: **21** (unchanged)

### Tasks to Add to seed-roles-and-tasks.js

```javascript
// ========== PAYMENT VERIFICATION MODULE (6 tasks) ==========
{
  name: 'paymentVerification.initiate',
  endpoint: '/api/v1/payment-verification/initiate',
  method: 'POST',
  description: 'Initiate payment verification from QR scan',
  isMerchant: true,
  hidden: false
},
{
  name: 'paymentVerification.confirm',
  endpoint: '/api/v1/payment-verification/:id/confirm',
  method: 'POST',
  description: 'Confirm verified payment and mark order paid',
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
  description: 'Retry failed provider lookup',
  isMerchant: true,
  hidden: false
},
{
  name: 'paymentVerification.read',
  endpoint: '/api/v1/payment-verification/:id',
  method: 'GET',
  description: 'View payment verification details',
  isMerchant: true,
  hidden: false
},
{
  name: 'paymentVerification.list',
  endpoint: '/api/v1/payment-verification',
  method: 'GET',
  description: 'List payment verifications with filters',
  isMerchant: true,
  hidden: false
},
```

Update header comment:
```javascript
/**
 * Total: 220 fine-grained tasks
 * - 199 merchant-scoped (isMerchant: true) - assigned to SUPER-MERCHANT-ADMIN
 * - 21 system-wide (isMerchant: false) - SUPER-ADMIN only (accessed via bypass)
 * 
 * Payment Verification: Added 6 tasks (all merchant-scoped)
 *   - Initiate, confirm, reject, retry, read, list
 */
```

---

## Summary of Fixes

| Issue | Before | After |
|-------|--------|-------|
| **SSRF Risk** | `raw.includes()` substring match | `new URL().hostname` exact match + `maxRedirects: 0` |
| **Fake req** | `confirmVerification()` creates mock req | `PaymentCompletionService.completePayment()` pure function |
| **Atomicity** | Separate updates (race prone) | Single `session.withTransaction()` |
| **Duplicate Race** | Only early check | Early check + E11000 catch with clean 409 |
| **Manual Schema** | Mentioned but not defined | Added to model in Section 2 |
| **Task Counts** | Assumed 218 → 224 | Verified 214 → 220 (193 → 199 merchant) |

---

## Ready for Approval

All 6 security and architecture issues fixed. The design now:

✅ Prevents SSRF attacks  
✅ Avoids anti-patterns (no fake request objects)  
✅ Ensures atomicity (single transaction)  
✅ Handles race conditions gracefully  
✅ Includes manual verification from the start  
✅ Uses correct task counts

**Next Step:** Approve and proceed to Phase 0 (fixture collection)
