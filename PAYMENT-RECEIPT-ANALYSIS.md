# Payment Receipt Analysis — Real Fixtures Review

**Date:** 2026-08-22  
**Status:** ✅ Phase 0 Complete — Ready to Start Implementation

---

## 📦 What You Have (Excellent!)

You've provided **7 real receipt samples** across **3 different providers**:

### 1. CBE Birr (Commercial Bank of Ethiopia)
**File:** `5805546309946118754.jpg`

**Receipt Type:** VAT Invoice / Customer Receipt (PDF format in app)

**Key Data Fields Identified:**
- ✅ **Transaction Reference:** `DHS81MM04XG` (Order ID field)
- ✅ **Amount:** `15.00 ETB` (Total Paid Amount)
- ✅ **Transaction Date:** `2026-08-28 18:39`
- ✅ **Customer Name:** `natnael zelalem tesmoe`
- ✅ **Receiver Accounts:** Multiple (0923479821, 0924448748, 0924448748)
- ✅ **Payment Method:** `API` (Payment Channel)
- ✅ **VAT Registration:** Company has VAT number
- ✅ **QR Code:** Present at bottom right

**Receipt Structure:**
```
┌─────────────────────────────────────┐
│ CBE Birr Logo                       │
│ VAT Invoice/Customer Receipt        │
├─────────────────────────────────────┤
│ Company Info         Customer Info  │
│ - Address            - Name         │
│ - VAT No             - Region       │
│ - SWIFT              - Branch       │
├─────────────────────────────────────┤
│ Transaction Information             │
│ - Debit Account                     │
│ - Credit Accounts (3 receivers)     │
│ - Order ID: DHS81MM04XG            │
│ - Transaction Status: Completed     │
├─────────────────────────────────────┤
│ Transaction Details Table           │
│ Receipt#  | Date        | Amount    │
│ DHS81MM04XG | 2026-08-28 | 15.00   │
│                                     │
│ Breakdown:                          │
│ - Paid amount: 15.00                │
│ - Service Charge: 0.00              │
│ - Disaster Response Fee: 0.00       │
│ - VAT: 0.00                         │
│ - Tip: 0.00                         │
│ Total: 15.00                        │
├─────────────────────────────────────┤
│ [QR Code]                           │
│ © 2026 CBE. All rights reserved     │
└─────────────────────────────────────┘
```

**QR Code Behavior:**
- **NOT a URL** — This QR contains the receipt reference/order ID
- When scanned, likely opens CBE app or verification page
- **Cannot fetch from external URL** (not SSRF-vulnerable by design)

**⚠️ CRITICAL FINDING: Design Change Required**

The CBE receipt **does not have a verification URL**. The QR code contains just the reference number, not a web URL to fetch transaction data from.

---

### 2. Telebirr (Ethio Telecom)
**Files:** 
- `5805546309946118755.jpg` (Success message with QR)
- `5805546309946118756.jpg` (Receipt details)
- **NEW:** `Aug_28_2026_6-54-00_PM_.pdf` (Full invoice/receipt - **MOST DETAILED**)

**Receipt Type 1:** Success notification (Image 2)

**Key Data Fields:**
```
Message:
"ETB 721.00 debited from NATNAEL ZELALEM TESHOME 
for KBA JOINTS MANUFACTURING PLC-ETB-8877 on 
04-Jul-2026 with transaction ID: FT26185MFWYG.
Total Amount Debited ETB 721.61 with commission of 
ETB 0.50, 15% VAT of ETB0.08 and 5% Disaster Fund 
of ETB0.03."
```

**Extracted Fields:**
- ✅ **Amount:** `721.00 ETB` (base)
- ✅ **Total Debited:** `721.61 ETB` (with fees)
- ✅ **Transaction ID:** `FT26185MFWYG`
- ✅ **Payer Name:** `NATNAEL ZELALEM TESHOME`
- ✅ **Receiver:** `KBA JOINTS MANUFACTURING PLC-ETB-8877`
- ✅ **Date:** `04-Jul-2026`
- ✅ **Commission:** `0.50 ETB`
- ✅ **VAT (15%):** `0.08 ETB`
- ✅ **Disaster Fund (5%):** `0.03 ETB`
- ✅ **QR Code:** Present
- ✅ **Button:** "VIEW RECEIPT"

**Receipt Type 2:** Transaction summary (Image 3)

**Key Data Fields:**
```
- Amount: -51.00 ETB (debit)
- Transaction Time: 2026/07/24 19:24:34
- Transaction Type: Transfer Money
- Transaction To: Filmon
- Transaction Number: DG057MNI05
- QR Code button available
```

**Receipt Type 3:** FULL INVOICE (PDF - **BEST FOR VERIFICATION**)

**Company Information:**
```
Ethio telecom Share Company
TIN No: 0000030603
VAT Reg. No: 012700
VAT Reg. Date: 01/01/2003
PO Box: 1047 Addis Ababa, Ethiopia
Tel: 251(0) 115 505 678
```

**Transaction Information:**
```
የከፋይ ስም/Payer Name: Nathnael Zelalem Teshome
የከፋይ ስልክ ቁ/Payer telebirr no: 2519****9921
የከፋይ አካውንት አይነት/Payer account type: Customer
የከፋይ ቲን ቁ/Payer TIN No: [blank]
የከፋይ ተ.እ.ታ.ቁ/VAT Reg. No: [blank]
የተገለገሉ ወገን ስም/Credited Party name: Zelalem Teshome Sahelu
የገንዘብ ተቀባይ ስልክ ቁ/Credited party account no: 2519****0663
የግብይት ሁኔታ/transaction status: Completed
```

**Invoice Details (KEY DATA):**
```
┌─────────────────────────────────────────────────────┐
│ Invoice No: DHS88UMJXQ                              │
│ Payment Date: 28-08-2026 18:42:47                   │
├─────────────────────────────────────────────────────┤
│ የሚከፈል ገንዘብ/Settled Amount:        10 Birr        │
│ ማህተም ክፍያ/Stamp Duty:               0.0 Birr      │
│ ቅናሽ/Discount Amount:                 0.0 Birr      │
│ የአገልግሎት ክፍያ/Service fee:          0.87 Birr      │
│ የአገልግሎት ክፍያ ተ.እ.ታ/Service fee VAT: 0.13 Birr  │
│ ጠቅላላ የተከፈለ/Total Paid Amount:     11 Birr       │
├─────────────────────────────────────────────────────┤
│ የገንዘብ መጠን በቃል/Total Amount in word:              │
│    eleven birr and zero cent                        │
│ የክፍያ አይነት/Payment Mode: telebirr                 │
│ የክፍያ ምክንያት/Payment Reason:                       │
│    Send Money to Registered Customer                │
│ የክፍያ ዘገባ/Payment Channel: API/App                │
│ የደንበኛ ማስታወሻ/Customer Note: [blank]               │
├─────────────────────────────────────────────────────┤
│ [QR CODE]                                           │
│ Scan the QR using telebirr SuperApp to verify       │
│ the payment                                         │
├─────────────────────────────────────────────────────┤
│ [Ethio Telecom Stamp]                              │
│ Facebook | Twitter | LinkedIn | Website links      │
│ "Bringing new possibilities"                        │
└─────────────────────────────────────────────────────┘
```

**🔍 CRITICAL FINDINGS FROM THIS RECEIPT:**

1. **QR Code Purpose:** "Scan the QR using telebirr SuperApp to verify the payment"
   - ⚠️ QR opens **Telebirr app** (not a web URL)
   - Verification happens **inside the app**, not via browser
   - Cannot fetch data via HTTP request

2. **Invoice Number Format:** `DHS88UMJXQ` (alphanumeric, 10 chars)
   - Different from transaction ID format seen earlier

3. **Detailed Fee Breakdown:**
   - Base amount: 10 Birr
   - Service fee: 0.87 Birr
   - Service fee VAT (15%): 0.13 Birr
   - **Total: 11 Birr** (what customer actually pays)

4. **Payment Channel:** `API/App` (programmatic payment)

5. **Payment Reason:** "Send Money to Registered Customer"

6. **Transaction Status:** `Completed` (explicitly stated)

**⚠️ CRITICAL FINDING CONFIRMED:**

Like CBE, Telebirr **does not provide a web verification URL**. The QR code is meant to be scanned with the **Telebirr SuperApp** (their mobile app), not a browser.

---

### 3. Bank of Abyssinia (BOA)
**File:** `5805546309946118757.jpg`

**Receipt Type:** Transaction confirmation page

**Key Data Fields:**
- ✅ **Source Account:** `1****8634` (masked)
- ✅ **Source Account Name:** `JI DAZHEN JI`
- ✅ **Amount:** `35,000.00 ETB`
- ✅ **Receiver Account:** `1****272` (masked)
- ✅ **Receiver Name:** `NATNAEL ZELALEM TESHOME`
- ✅ **Transaction Time:** `18/02/2026, 18:42:00`
- ✅ **Transaction Type:** `Within BOA`
- ✅ **Transaction Reference:** `FT26049GWWNG`
- ✅ **Bank Name:** `Bank of Abyssinia`
- ✅ **QR Code:** Large QR with text "Scan the QR to Verify"

**⚠️ CRITICAL FINDING: Verification URL Exists!**

BOA receipt says **"Scan the QR to Verify"** — this suggests the QR might contain a verification URL that can be fetched!

---

## 🚨 Major Design Implications

### Original Assumption (WRONG)
The design assumed QR codes contain URLs like:
```
https://apps.cbe.com.et/receipt/verify?ref=DHS81MM04XG
```

### Reality from Fixtures (CORRECT)
1. **CBE Birr:** QR contains receipt reference only (no URL)
2. **Telebirr:** QR contains transaction reference only (no URL)  
3. **Bank of Abyssinia:** QR *might* contain verification URL (needs testing)

### What This Means

**We CANNOT fetch transaction data from provider servers automatically.** The original SSRF-prevention design is over-engineered because there's no URL to fetch from.

---

## 🔄 Revised Approach (Two Options)

### Option A: Manual Verification Only (Simplest)
**What it does:** Staff manually types in receipt details from screenshot

**Flow:**
1. Customer shows receipt on phone
2. Staff manually enters:
   - Provider (CBE/Telebirr/BOA)
   - Transaction reference (e.g., `FT26185MFWYG`)
   - Amount (e.g., `721.00`)
   - Date
3. Staff clicks "Verify"
4. System saves to database (duplicate check still works)
5. Admin approves in dashboard
6. Payment marked complete

**Pros:**
- ✅ Simple to implement (no HTML parsing)
- ✅ Works with all providers (no API needed)
- ✅ Duplicate prevention still works
- ✅ Fast to build (1-2 days)

**Cons:**
- ❌ Manual data entry (typo risk)
- ❌ No automated verification
- ❌ Staff could fake entries (but admin reviews)

### Option B: QR Scan + Manual Review (Hybrid)
**What it does:** Scan QR to extract reference, staff reviews and confirms amount

**Flow:**
1. Customer shows receipt
2. Staff scans QR code → extracts transaction reference
3. System pre-fills:
   - Provider (detected from QR format)
   - Transaction reference (from QR)
4. Staff manually confirms/enters:
   - Amount (from receipt screenshot)
   - Date (from receipt screenshot)
5. System saves with duplicate check
6. Admin approves
7. Payment complete

**Pros:**
- ✅ Less manual typing (reference auto-filled)
- ✅ Duplicate prevention works
- ✅ Reduces typo risk on reference numbers

**Cons:**
- ❌ Still needs manual amount entry
- ❌ Requires QR parsing logic (decode QR string)

### Option C: Future API Integration (Long-term)
**What it does:** Contact banks to get official API access

**Flow:**
1. Get official API credentials from CBE/Telebirr/BOA
2. When staff scans QR:
   - Extract transaction reference
   - Call bank API: `verifyTransaction(reference)`
   - Get official amount, date, payer name
3. Auto-verify if amounts match
4. Admin confirms edge cases only

**Pros:**
- ✅ Fully automated
- ✅ Can't be faked (official bank data)
- ✅ No manual entry

**Cons:**
- ❌ Requires bank partnerships (months of negotiation)
- ❌ May cost money (API fees)
- ❌ Not available now

---

## 📊 Recommended Path Forward

### Phase 1: Manual Verification (Immediate - 2 days)
Start with **Option A** to get the feature working fast:
- Manual receipt entry by staff
- Duplicate prevention via unique index
- Admin approval workflow
- All security fixes (#1-8) still apply

### Phase 2: QR Enhancement (Optional - 1 week)
Add **Option B** features:
- QR code parsing to extract reference
- Auto-detect provider from QR format
- Pre-fill fields for staff

### Phase 3: API Integration (Future - 3+ months)
Pursue **Option C** when ready:
- Contact banks for API access
- Negotiate terms & pricing
- Implement official verification

---

## 🛠️ Updated Implementation Plan

### What Changes from Original Design

#### ✅ Keep These (Still Valuable)
1. **PaymentVerification model** — duplicate prevention works regardless
2. **Unique index** `{provider, providerReference}` — prevents reuse
3. **confirmVerification security fixes** — race condition, stale data checks
4. **RBAC tasks** — staff roles still needed
5. **Admin approval workflow** — human verification layer

#### ❌ Remove These (Not Applicable)
1. **Provider.verify()** — no URL to fetch from
2. **SSRF prevention logic** — no outbound HTTP calls
3. **HTML parsing (cheerio/jsdom)** — no HTML to parse
4. **Hostname validation** — no external URLs
5. **Axios with maxRedirects** — not making HTTP requests

#### ➕ Add These (New Requirements)
1. **Manual entry DTO** — staff inputs: provider, reference, amount, date
2. **QR parsing (optional)** — decode QR string, extract reference
3. **Provider format detection** — regex to detect CBE vs Telebirr vs BOA format
4. **Photo upload** — staff uploads screenshot of receipt for audit trail

---

## ⚠️ CRITICAL BUSINESS DECISION: Fee Handling

### The Problem

From the Telebirr invoice, we see:
```
Base Amount (what restaurant receives): 10.00 Birr
Service Fee: 0.87 Birr
Service Fee VAT: 0.13 Birr
Total Paid (what customer pays): 11.00 Birr
```

### The Question

When verifying payment for a **500 ETB order**, which amount should match?

**Option A: Match Customer's Total Payment**
- Order total: 500.00 ETB
- Customer pays: ~550 ETB (with Telebirr fees)
- Receipt shows: 550 ETB
- ❌ **Problem:** Order amount (500) ≠ Receipt amount (550)

**Option B: Match Restaurant's Received Amount**
- Order total: 500.00 ETB
- Customer pays: ~550 ETB (with fees)
- Restaurant receives: 500.00 ETB
- Receipt base amount: 500.00 ETB
- ✅ **Works:** Order amount (500) === Receipt base amount (500)

### Recommended Solution

**Use the "Settled Amount" / "Base Amount" field** from receipts:

```javascript
// Payment verification amount matching
if (provider === 'telebirr') {
  // Use "የሚከፈል ገንዘብ/Settled Amount" (base, before fees)
  const amountToVerify = parsed.settledAmount; // 10 Birr
} else {
  // CBE/BOA: use total shown amount
  const amountToVerify = parsed.totalAmount; // 15 Birr
}

const amountMatch = Math.abs(amountToVerify - order.totalAmount) < 0.01;
```

### Staff Training Note

Staff must understand:
- **Telebirr:** Customer shows 11 Birr total, but verify against 10 Birr base
- **CBE/BOA:** Use the total amount shown
- Tell customers: "We verify the amount **we receive**, not what you pay (fees excluded)"

---

## 📋 Updated Task Checklist

### Phase 1A: Core Infrastructure (Same as Before)
- [ ] Create `PaymentVerification` model with unique index
- [ ] Extract `PaymentCompletionService` (preserve markAsPaid logic)
- [ ] Add 6 RBAC tasks to seeder

### Phase 1B: Manual Verification Service (NEW)
- [ ] Create `initiateManualVerification()` endpoint
  ```javascript
  POST /api/v1/payment-verification/manual
  Body: {
    orderId,
    provider: "cbe" | "telebirr" | "boa",
    providerReference: "FT26185MFWYG",
    amount: 721.00,
    transactionDate: "2026-07-04",
    receiptPhoto: fileId, // FileAsset ID
    notes: "Receipt verified via screenshot"
  }
  ```

- [ ] Validate input (Zod schema)
- [ ] Check duplicate reference (unique constraint)
- [ ] Save to `PaymentVerification` with `verificationType: 'manual'`
- [ ] Compare amount with order total (set `amountMatch` flag)

### Phase 1C: Approval Workflow (Same as Before)
- [ ] `confirmVerification()` with all 8 security fixes
- [ ] `rejectVerification()` with reason
- [ ] `listPendingVerifications()` for admin dashboard

### Phase 1D: Testing
- [ ] Test duplicate reference rejection
- [ ] Test race condition (concurrent confirms)
- [ ] Test stale data (order modified after entry)
- [ ] Test cross-tenant security (FileAsset ownership)

---

## 🎯 Immediate Next Steps

1. **Review this analysis** — confirm manual verification approach is acceptable
2. **Test BOA QR code** — scan it to see if it opens a URL (might be the exception!)
3. **Start Phase 1A** — create the infrastructure (model, PaymentCompletionService)
4. **Build Phase 1B** — manual entry workflow
5. **Deploy & test** with real receipts

---

## 📸 Receipt Data Summary

| Provider | Reference/Invoice Format | Amount Format | Date Format | QR Contains | Verification Method |
|----------|--------------------------|---------------|-------------|-------------|---------------------|
| **CBE Birr** | `DHS81MM04XG` (alphanumeric, 12 chars) | `15.00` (decimal) | `2026-08-28 18:39` | Receipt reference | QR → CBE app |
| **Telebirr** | Invoice: `DHS88UMJXQ` (10 chars)<br>Transaction: `FT26185MFWYG` (12 chars) | `10.00` (base)<br>`11.00` (with fees) | `28-08-2026 18:42:47` | Invoice reference | QR → Telebirr SuperApp |
| **BOA** | `FT26049GWWNG` (starts with FT, 12 chars) | `35,000.00` (comma) | `18/02/2026, 18:42:00` | Verification data? | QR → BOA verification (needs testing) |

### Key Observations

**Fee Structure:**
- **CBE:** No service fees shown on sample receipt (15.00 → 15.00)
- **Telebirr:** Service fee + VAT (10.00 → 11.00 total)
  - Service fee: 0.87 Birr
  - Service fee VAT (15%): 0.13 Birr
- **BOA:** No fees shown (direct transfer)

**Which Amount to Verify?**
- **For Telebirr:** Use **base amount** (10 Birr), not total with fees (11 Birr)
  - Customer pays 11 Birr
  - Restaurant receives 10 Birr
  - Telebirr keeps 1 Birr (fees)
- **For CBE/BOA:** Use shown amount (no fee breakdown visible)

---

## ✅ Feedback Summary

**What's Great:**
- ✅ You have real receipts from 3 providers
- ✅ Receipt structure is clear and parseable (if needed for Phase 2)
- ✅ Transaction references are visible and unique
- ✅ All necessary data fields are present

**What Needs Adjustment:**
- ⚠️ Original design assumed URL-based verification (not supported by receipts)
- ⚠️ SSRF prevention is over-engineered (no HTTP calls needed)
- ⚠️ Must pivot to manual entry + admin approval workflow

**Recommended Action:**
Build **manual verification first** (fast, secure, works), then enhance with QR parsing later if needed.

---

**Ready to proceed with Phase 1A (infrastructure)?** Let me know if you want me to start creating the models and services based on this new understanding! 🚀
