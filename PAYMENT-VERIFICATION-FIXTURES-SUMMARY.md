# Payment Verification Fixtures — Complete Analysis

**Date:** 2026-08-22  
**Status:** ✅ All Receipts Analyzed — Ready for Implementation Decision

---

## 📦 What We Have

### Total Receipts: 7 files across 3 providers

| # | Provider | File | Type | Key Reference |
|---|----------|------|------|---------------|
| 1 | **CBE Birr** | `5805546309946118754.jpg` | VAT Invoice/Receipt | `DHS81MM04XG` |
| 2 | **Telebirr** | `5805546309946118755.jpg` | Success notification | `FT26185MFWYG` |
| 3 | **Telebirr** | `5805546309946118756.jpg` | Transaction summary | `DG057MNI05` |
| 4 | **Telebirr** | `Aug_28_2026_6-54-00_PM_.pdf` | **Full invoice** ⭐ | `DHS88UMJXQ` |
| 5 | **BOA** | `5805546309946118757.jpg` | Transaction confirmation | `FT26049GWWNG` |
| 6 | **CBE Birr** | `CBEBirr_Receipt_DHS81MM04XG.pdf` | PDF receipt | `DHS81MM04XG` |
| 7 | **CBE Birr** | `CBE-Receipt-FT26240JY4DT.pdf` | PDF receipt | `FT26240JY4DT` |

---

## 🔍 Key Findings

### 1. NO Web URLs for Automated Verification

**Finding:** None of the QR codes contain fetchable web URLs.

| Provider | QR Code Contains | Opens |
|----------|------------------|-------|
| CBE Birr | Receipt reference (`DHS81MM04XG`) | CBE mobile app |
| Telebirr | Invoice number (`DHS88UMJXQ`) | Telebirr SuperApp |
| BOA | Transaction reference (`FT26049GWWNG`) | BOA verification (possibly web or app) |

**Implication:** Original design's SSRF prevention, HTML parsing, and HTTP fetching logic is **not needed**.

---

### 2. Reference Number Formats Identified

```
CBE Birr:
  - Format: Alphanumeric, 12 characters
  - Examples: DHS81MM04XG, FT26240JY4DT
  - Pattern: [A-Z0-9]{12}

Telebirr:
  - Invoice Format: Alphanumeric, 10 characters (DHS88UMJXQ)
  - Transaction Format: FT prefix + 10 chars (FT26185MFWYG)
  - Pattern: (DHS|FT)[A-Z0-9]{8,10}

Bank of Abyssinia:
  - Format: FT prefix + 10 chars
  - Example: FT26049GWWNG
  - Pattern: FT[0-9]{2}[A-Z0-9]{8}
```

**Use Case:** Detect provider from reference format:
```javascript
function detectProvider(reference) {
  if (/^DHS[A-Z0-9]{9}$/.test(reference)) return 'telebirr';
  if (/^FT\d{2}[A-Z0-9]{8}$/.test(reference)) {
    // Both Telebirr and BOA use this format - need additional context
    return 'telebirr_or_boa';
  }
  if (/^[A-Z0-9]{12}$/.test(reference)) return 'cbe';
  return 'unknown';
}
```

---

### 3. Amount Discrepancy Issue (Telebirr Fees)

**Critical Finding:** Telebirr shows **two different amounts**:

```
From Aug_28_2026_6-54-00_PM_.pdf:

1. Base Amount (Settled Amount): 10.00 Birr
   - This is what the MERCHANT RECEIVES
   
2. Total Paid Amount: 11.00 Birr
   - This is what the CUSTOMER PAYS
   
Breakdown:
  - Base: 10.00 Birr
  - Service Fee: 0.87 Birr
  - Service Fee VAT (15%): 0.13 Birr
  - Total: 11.00 Birr
```

**The Problem:**
- Restaurant creates order: **500 ETB**
- Customer pays via Telebirr: **~550 ETB** (with fees)
- Receipt shows total: **550 ETB**
- Restaurant receives: **500 ETB**

**Which amount should match the order?**

**✅ RECOMMENDED SOLUTION:**

Match against the **base amount** (what restaurant receives), NOT the total with fees.

```javascript
// In verification logic
if (provider === 'telebirr') {
  // Extract "የሚከፈል ገንዘብ/Settled Amount" from invoice
  amountToVerify = parsed.settledAmount; // 10 Birr
} else {
  // CBE/BOA: Use total shown
  amountToVerify = parsed.totalAmount;
}

const amountMatch = Math.abs(amountToVerify - order.totalAmount) < 0.01;
```

**Staff Training Required:**
> "When customer shows Telebirr receipt with 550 ETB total, verify against the **base amount** (500 ETB) shown on the invoice detail line, not the total at bottom."

---

### 4. Receipt Field Mapping

#### CBE Birr Fields (from `5805546309946118754.jpg`)

```javascript
{
  provider: 'cbe',
  companyInfo: {
    name: 'Commercial Bank of Ethiopia',
    vatNo: 'CBEBirr',
    address: 'Ras Desta Damtew St, 01, Kirkos',
    swift: 'CBETETAA',
  },
  transaction: {
    orderID: 'DHS81MM04XG', // ← Main reference
    receiptNumber: 'DHS81MM04XG', // Same as order ID
    date: '2026-08-28 18:39',
    debitAccount: null, // Not shown
    creditAccounts: [
      '0923479821',
      '0924448748',
      '0924448748',
    ],
    receiverNames: [
      'natnael zelalem tesmoe',
      'kinubl girma wolde',
      'kinubl girma wolde',
    ],
    status: 'Completed',
  },
  amounts: {
    base: 15.00,
    serviceCharge: 0.00,
    disasterResponseFee: 0.00,
    vat: 0.00,
    tip: 0.00,
    total: 15.00,
  },
  paymentChannel: 'API',
}
```

#### Telebirr Fields (from `Aug_28_2026_6-54-00_PM_.pdf`)

```javascript
{
  provider: 'telebirr',
  companyInfo: {
    name: 'Ethio telecom Share Company',
    tinNo: '0000030603',
    vatRegNo: '012700',
    vatRegDate: '01/01/2003',
    poBox: '1047 Addis Ababa, Ethiopia',
    tel: '251(0) 115 505 678',
  },
  payer: {
    name: 'Nathnael Zelalem Teshome',
    telebirrNo: '2519****9921', // Masked
    accountType: 'Customer',
    tinNo: null,
    vatRegNo: null,
  },
  creditedParty: {
    name: 'Zelalem Teshome Sahelu',
    accountNo: '2519****0663', // Masked
  },
  transaction: {
    invoiceNo: 'DHS88UMJXQ', // ← Main reference
    paymentDate: '28-08-2026 18:42:47',
    status: 'Completed',
  },
  amounts: {
    settledAmount: 10.00, // ← Use this for verification
    stampDuty: 0.00,
    discount: 0.00,
    serviceFee: 0.87,
    serviceFeeVAT: 0.13,
    totalPaid: 11.00, // ← Customer pays this
  },
  payment: {
    mode: 'telebirr',
    reason: 'Send Money to Registered Customer',
    channel: 'API/App',
    customerNote: null,
  },
}
```

#### BOA Fields (from `5805546309946118757.jpg`)

```javascript
{
  provider: 'boa',
  source: {
    account: '1****8634', // Masked
    name: 'JI DAZHEN JI',
  },
  receiver: {
    account: '1****272', // Masked
    name: 'NATNAEL ZELALEM TESHOME',
  },
  transaction: {
    reference: 'FT26049GWWNG', // ← Main reference
    time: '18/02/2026, 18:42:00',
    type: 'Within BOA',
  },
  amount: 35000.00, // No fees shown
  bankName: 'Bank of Abyssinia',
}
```

---

## 💡 Implementation Recommendations

### Option A: Manual Entry (FASTEST - 2 days)

**What staff does:**
1. Customer shows receipt on phone
2. Staff manually types:
   - Provider: [CBE / Telebirr / BOA]
   - Reference: `DHS88UMJXQ`
   - Amount: `10.00` (base amount for Telebirr)
   - Date: `2026-08-28`
3. Optional: Upload screenshot as FileAsset
4. System checks duplicate reference (unique constraint)
5. Admin approves in dashboard
6. Payment marked complete

**Pros:**
- ✅ Fast to implement
- ✅ Works immediately
- ✅ No external dependencies
- ✅ All security fixes still apply

**Cons:**
- ❌ Manual typing (slow, error-prone)
- ❌ Staff could fake entries (but admin reviews)

---

### Option B: QR Scan + Manual Amount (RECOMMENDED - 4 days)

**What staff does:**
1. Customer shows receipt
2. Staff **scans QR code** with tablet/phone
3. System auto-fills:
   - Provider (detected from reference format)
   - Reference (`DHS88UMJXQ` from QR)
4. Staff confirms/types:
   - Amount (from looking at receipt)
   - Date (from looking at receipt)
5. Upload screenshot
6. Admin approves
7. Payment complete

**Pros:**
- ✅ Less typing (just amount + date)
- ✅ Reference auto-filled (no typos)
- ✅ Still fast to implement

**Cons:**
- ❌ Requires QR scanner integration
- ❌ Still manual amount entry

**QR Scanner Libraries:**
```javascript
// Frontend (React/Vue)
npm install html5-qrcode
// or
npm install react-qr-reader

// Backend (Node.js) - if processing uploaded QR images
npm install qrcode-reader
npm install jimp // for image processing
```

---

### Option C: Future API Integration (3-6 months)

**Long-term goal:** Get official API access from banks

**What it would enable:**
1. Scan QR → Extract reference
2. Call bank API: `verifyTransaction(reference)`
3. Get official data (amount, date, status)
4. Auto-verify if matches
5. Admin only reviews exceptions

**Requires:**
- Partnership agreements with CBE, Telebirr, BOA
- API credentials
- Possible fees
- Legal agreements

---

## 🚀 Recommended Implementation Path

### Phase 1: Manual Entry (Week 1)
Build **Option A** to get feature live quickly:
- Manual form for staff
- Duplicate prevention
- Admin approval workflow
- All 8 security fixes

### Phase 2: QR Enhancement (Week 2-3)
Add **Option B** features:
- QR code scanning
- Auto-detect provider
- Pre-fill reference field

### Phase 3: API Integration (Month 3+)
Pursue **Option C** when resources available:
- Contact banks
- Negotiate API access
- Implement automated verification

---

## ✅ Next Steps

1. **Decision:** Choose Option A or Option B for initial release
2. **Start Phase 1A:** Create PaymentVerification model
3. **Start Phase 1B:** Build manual entry service
4. **Test with real receipts:** Have staff practice entering data
5. **Deploy & iterate**

---

## 📊 Files Ready for Implementation

All receipt samples are saved in:
```
tests/fixtures/payment-verification/
├── 5805546309946118754.jpg (CBE - detailed)
├── 5805546309946118755.jpg (Telebirr - notification)
├── 5805546309946118756.jpg (Telebirr - summary)
├── 5805546309946118757.jpg (BOA - detailed)
├── Aug_28_2026_6-54-00_PM_.pdf (Telebirr - FULL INVOICE ⭐)
├── CBEBirr_Receipt_DHS81MM04XG.pdf (CBE - PDF)
└── CBE-Receipt-FT26240JY4DT.pdf (CBE - PDF)
```

**These will be used for:**
- Unit tests (parsing reference formats)
- Integration tests (full workflow)
- Staff training (what to look for on receipts)
- Documentation (screenshots in user guide)

---

**Ready to proceed?** Let me know which option you prefer and I'll start building! 🚀
