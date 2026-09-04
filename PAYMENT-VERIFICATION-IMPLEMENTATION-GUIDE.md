# Ethiopian Payment Verification Implementation Guide

## 1. Goal

Build a secure payment-evidence verification system for Ethiopian payment providers without replacing the current backend architecture or introducing a payment gateway, OCR, or automatic charging flow.

This feature should support:
- Telebirr
- Commercial Bank of Ethiopia (CBE)
- CBE Birr

The system will verify external payment evidence and defer the real payment completion to the existing order payment flow. It will not directly charge customers, mark an order as paid without review, or rely on image OCR.

---

## 2. What We Keep from the Existing Code

These are the parts that already fit the architecture and should be preserved.

### 2.1 Keep the verification domain model and service structure
Keep:
- models/PaymentVerification.js
- src/modules/payment-verification/service/PaymentVerificationService.js
- src/modules/payment-verification/controller/payment-verification.controller.js
- src/modules/payment-verification/payment-verification.routes.js

Why:
- The current domain already models payment evidence and review.
- It is the right place to add stronger evidence validation and approval workflow.

### 2.2 Keep the provider adapter pattern
Keep:
- src/modules/payment-verification/service/providers/BaseProvider.js
- src/modules/payment-verification/service/providers/TelebirrProvider.js
- src/modules/payment-verification/service/providers/CBEProvider.js
- src/modules/payment-verification/service/providers/CBEBirrProvider.js

Why:
- This pattern is a good extension point for provider-specific parsing.
- We only need to harden it with safer validation and more accurate normalization.

### 2.3 Keep the order payment lifecycle
Keep:
- models/orderModel.js
- src/modules/order/service/OrderService.js
- src/modules/payment-verification/service/PaymentCompletionService.js

Why:
- Order payment status is still a business summary and should remain under the existing order flow.
- Payment verification should not replace this layer; it should strengthen it.

### 2.4 Keep the file asset model
Keep:
- models/FileAsset.js
- src/modules/files/file.controller.js
- src/modules/files/file.routes.js

Why:
- Official bank PDFs and uploaded evidence should use the existing file system.
- The file layer is already the correct place for storing and serving evidence files.

### 2.5 Keep the auth/session structure
Keep:
- src/common/guards/auth.guard.js
- src/modules/customers/customer-session.guard.js

Why:
- Staff and customer access boundaries are already defined.
- Payment verification should remain scoped to merchant and order access rules.

### 2.6 Keep audit and activity history patterns
Keep:
- audit plugin usage in models
- existing logging and audit patterns across the app

Why:
- Verification actions must be reviewable and traceable.

---

## 3. What We Update and Extend

### 3.1 Extend PaymentVerification with stronger evidence tracking
Update:
- models/PaymentVerification.js

Add fields such as:
- submittedByType
- submittedByUserId
- submissionMethod
- originalReference
- normalizedReference
- rawQrPayload
- sourceUrl
- officialDocumentAssetId
- extractedRawText
- extractionMethod
- normalizedTransaction
- matchResult
- failureCode
- reviewStatus
- reviewedBy
- reviewedAt

Keep:
- provider
- order
- merchant
- status
- verifiedBy
- verifiedAt
- rejectionReason
- receiptFileRef

Reason:
- The current schema is solid, but the verification process needs richer metadata for real-world provider evidence review.

### 3.2 Add a dedicated PaymentAttempt model
New file:
- models/PaymentAttempt.js

Purpose:
- Track each payment evidence submission separately.
- Preserve prior submissions for audit and retries.
- Prevent duplicate reference misuse.

### 3.3 Harden the verification workflow in the service
Update:
- src/modules/payment-verification/service/PaymentVerificationService.js

Add:
- normalized reference generation
- duplicate prevention using normalized provider + reference
- state transitions such as submitted → processing → pending_review → verified/rejected/failed
- submission actor classification
- amount and provider validation before approval

### 3.4 Add SSRF-safe provider URL processing
Update or add:
- src/modules/payment-verification/utils/pdf-downloader.js
- provider parsing utilities under src/modules/payment-verification/service/providers

Add:
- domain allowlist checks
- HTTPS-only enforcement
- localhost/private IP blocking
- redirect validation
- timeout limits
- file size limits
- file signature checks for PDFs

### 3.5 Add native PDF extraction and parsing
New or extended services:
- src/modules/payment-verification/service/PdfExtractionService.js

Purpose:
- Download official PDFs safely
- Parse embedded text without OCR
- Extract transaction reference, amount, date, and account data
- Store extracted material for review

Important rule:
- No OCR fallback
- No image-to-text extraction for receipts

### 3.6 Add transaction normalization and matching layer
New services:
- src/modules/payment-verification/service/TransactionNormalizer.js
- src/modules/payment-verification/service/PaymentMatcher.js

Responsibilities:
- normalize reference strings
- normalize amount and currency values
- compare provider transaction data with the order total
- validate merchant/receiver/account metadata when available
- produce clear matchResult and warnings

### 3.7 Add provider configuration and feature flags
Update config:
- src/config/env.js or equivalent env config files

Add values such as:
- TELEBIRR_ALLOWED_DOMAINS
- CBE_ALLOWED_DOMAINS
- CBE_BIRR_ALLOWED_DOMAINS
- PAYMENT_MAX_DOWNLOAD_SIZE_MB
- PAYMENT_MAX_REDIRECTS
- PAYMENT_REQUEST_TIMEOUT_MS
- PAYMENT_RETRY_MAX
- PAYMENT_RETRY_DELAY_MS

### 3.8 Strengthen review permissions
Update auth and route policy:
- src/common/guards/auth.guard.js

Add rules:
- customers cannot approve their own payment evidence
- staff can only approve orders inside their merchant scope
- only authorized roles can confirm or reject evidence

---

## 4. What We Do Not Add

Do not add the following in this phase:
- payment gateway checkout flow
- direct money transfer logic
- card processing or payout logic
- OCR-based receipt scanning
- image recognition workflows
- automatic order paid on submission without confirmation
- client-side trust of payment inputs

---

## 5. Implementation Task Breakdown

## Phase 0 — Audit and freeze the current behavior

| Priority | Task | Type | Files |
|---|---|---|---|
| P0 | Confirm current payment verification flow | Review | models/PaymentVerification.js, src/modules/payment-verification/service/PaymentVerificationService.js |
| P0 | Confirm current order payment completion flow | Review | models/orderModel.js, src/modules/order/service/OrderService.js |
| P0 | Confirm merchant and auth boundaries for staff/customer access | Review | src/common/guards/auth.guard.js, src/modules/customers/customer-session.guard.js |

## Phase 1 — Strengthen the evidence model

| Priority | Task | Type | Files |
|---|---|---|---|
| P0 | Extend PaymentVerification with submission and match metadata | Update | models/PaymentVerification.js |
| P0 | Add normalized reference and provider transaction metadata | Update | models/PaymentVerification.js |
| P0 | Add provider + reference uniqueness requirements | Update | models/PaymentVerification.js |
| P1 | Add PaymentAttempt model for per-submission history | New | models/PaymentAttempt.js |
| P1 | Add indexes for order/status/merchant queries | Update | models/PaymentVerification.js |

## Phase 2 — Provider hardening

| Priority | Task | Type | Files |
|---|---|---|---|
| P0 | Validate supported provider reference patterns | Update | provider files in src/modules/payment-verification/service/providers |
| P0 | Add domain allowlist and SSRF protections | Update | provider files, src/modules/payment-verification/utils/pdf-downloader.js |
| P0 | Add safe PDF download & size validation | Update | src/modules/payment-verification/utils/pdf-downloader.js |
| P1 | Add native text extraction service | New | src/modules/payment-verification/service/PdfExtractionService.js |
| P1 | Add provider-specific parsing normalization | Update | provider files |

## Phase 3 — Evidence submission workflow

| Priority | Task | Type | Files |
|---|---|---|---|
| P0 | Implement payment evidence submission flow | Update | src/modules/payment-verification/service/PaymentVerificationService.js |
| P0 | Support manual references and QR scans safely | Update | controller and service |
| P0 | Prevent duplicate provider references | Update | PaymentVerificationService.js |
| P1 | Add retry and failure code handling | Update | service layer |
| P1 | Add clear status transitions and audit logs | Update | models/PaymentVerification.js |

## Phase 4 — Matching and confirmation logic

| Priority | Task | Type | Files |
|---|---|---|---|
| P0 | Create safe transaction normalizer | New | src/modules/payment-verification/service/TransactionNormalizer.js |
| P0 | Create payment matcher against order total and merchant context | New | src/modules/payment-verification/service/PaymentMatcher.js |
| P0 | Add server-side amount validity checks before approval | Update | PaymentVerificationService.js |
| P0 | Validate approval permissions and prevent double approval | Update | controller + service |
| P1 | Add matchResult and warnings payload | Update | models/PaymentVerification.js |

## Phase 5 — Order integration and completion

| Priority | Task | Type | Files |
|---|---|---|---|
| P0 | Keep order payment status as the final summary state | Keep/Update | models/orderModel.js |
| P0 | Keep order completion logic separate from evidence verification | Keep/Update | src/modules/order/service/OrderService.js |
| P0 | Keep payment completion under verified evidence only | Update | src/modules/payment-verification/service/PaymentCompletionService.js |
| P1 | Ensure table/session cleanup remains independent from payment proof | Update | order modules |

## Phase 6 — File retention and evidence review

| Priority | Task | Type | Files |
|---|---|---|---|
| P1 | Store provider PDF and evidence files using FileAsset | Update | models/FileAsset.js, src/modules/files/file.controller.js |
| P1 | Attach official document reference to verification records | Update | models/PaymentVerification.js |
| P1 | Restrict access to merchant-scoped proof files | Update | file controller and route guards |

## Phase 7 — Testing and hardening

| Priority | Task | Type | Files |
|---|---|---|---|
| P0 | Add duplicate reference test cases | New | tests/payment-verification |
| P0 | Add amount mismatch rejection tests | New | tests/payment-verification |
| P0 | Add provider parser validation tests | New | tests/payment-verification |
| P0 | Add secure download and PDF validation tests | New | tests/payment-verification |
| P1 | Add authorization and access scope tests | New | tests/payment-verification |
| P1 | Add manual review and retry tests | New | tests/payment-verification |

---

## 6. Keep vs Update vs New

### Keep as-is
- Payment verification domain structure
- Order summary model and payment completion logic
- FileAsset implementation
- Auth guards and merchant scoping
- Audit logging approach

### Update carefully
- PaymentVerification schema metadata
- verification submission flow
- duplicate prevention logic
- provider validation and URL handling
- review permissions
- match and validation result payloads

### Add new
- PaymentAttempt model
- TransactionNormalizer
- PaymentMatcher
- PdfExtractionService
- provider allowlist and SSRF config
- retry/failure handling logic

---

## 7. Recommended Implementation Sequence

1. Extend the PaymentVerification schema and add richer metadata.
2. Add PaymentAttempt and attempt history tracking.
3. Harden provider parsing and safe external document fetching.
4. Add matching and validation normalization services.
5. Update the payment verification service workflow to follow review-first logic.
6. Protect confirm/reject actions with strict permission checks.
7. Keep order mark-as-paid as the final completion step, not the evidence submission step.
8. Add tests for duplicate references, amount mismatch, provider validation, and security.

---

## 8. Acceptance Criteria

The final implementation should ensure:
- a customer or staff member can submit payment evidence safely
- verification is processed server-side, not trusted from client input
- duplicate provider references are blocked
- the backend compares the provider transaction to the order total
- only authorized users can confirm or reject a verification
- a verified transaction can complete payment through the existing order flow
- official PDFs and evidence are stored using the FileAsset pattern
- there is no automatic charging and no OCR-based receipt parsing

---

## 9. Risks and Guardrails

### Risk 1: amount manipulation
Mitigation:
- compare against server-side order total at confirmation time
- do not trust client-submitted amount values

### Risk 2: duplicate transactions
Mitigation:
- add provider + normalized reference uniqueness checks
- keep an attempt history model

### Risk 3: public provider changes
Mitigation:
- keep provider parsing isolated
- allow provider-specific adapters to change independently

### Risk 4: document fetch safety
Mitigation:
- enforce allowed domains, blocked IP ranges, and secure file validation

### Risk 5: business fraud / manipulated receipts
Mitigation:
- require merchant approval
- keep audit records and rejection reasons

---

## 10. Final Recommendation

The correct path for this repo is to keep the existing payment verification architecture, extend it carefully, and avoid rewriting the working order/payment system.

That means:
- keep the current model/service/controller structure
- keep the existing order payment lifecycle
- keep the FileAsset pattern for evidence storage
- keep RBAC and merchant scoping
- add stronger provider validation, transaction normalization, and review logic
- treat payment evidence as proof, not as immediate payment execution

This keeps the implementation incremental, compatible, and production-friendly.

---

## 11. Practical Summary

### What we do new
- PaymentAttempt model
- transaction normalizer and matcher
- PDF extraction and validation
- SSRF-safe external fetchers
- stronger state handling and review workflow

### What we update
- PaymentVerification schema
- PaymentVerificationService flow
- provider implementations
- controller and route policy
- config and env defaults

### What we keep
- PaymentVerification domain concept
- provider adapter pattern
- order payment lifecycle
- FileAsset usage
- auth and merchant scoping
- audit logging

This is the right implementation roadmap for the current system.
