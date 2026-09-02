# Payment Verification - Quick Reference Card

## 🎯 For Frontend Developers

### Start Here
1. Read: **`FRONTEND-DEVELOPER-PROMPT.md`** (complete implementation guide)
2. Reference: **`FRONTEND-INTEGRATION-GUIDE.md`** (detailed API docs)

### Install This
```bash
npm install html5-qrcode
```

---

## 📱 Three Verification Methods

### Method 1: CBE Birr QR Scan ⭐ FASTEST
```javascript
// 1. Scan QR
const qrData = "https://cbepay1.cbe.com.et/aureceipt?TID=...&PH=...";

// 2. Send to backend
POST /api/v1/payment-verification/initiate-from-qr
{ orderId, qrPayload: qrData }

// 3. Review & confirm
POST /api/v1/payment-verification/:id/confirm
{}

// ✅ Done! (2 API calls, ~10 seconds, PDF included)
```

### Method 2: Telebirr Manual Entry
```javascript
// 1. Upload photo (REQUIRED)
POST /api/v1/files/upload
FormData: file, entityType, entityId, purpose

// 2. Initiate with receipt number
POST /api/v1/payment-verification/initiate
{ orderId, provider: "telebirr", receiptNumber }

// 3. Confirm with photo
POST /api/v1/payment-verification/:id/confirm
{ receiptFileId }

// ✅ Done! (3 API calls, ~30 seconds)
```

### Method 3: CBE Bank Manual Entry
```javascript
// 1. Upload photo (optional)
POST /api/v1/files/upload

// 2. Initiate with receipt number
POST /api/v1/payment-verification/initiate
{ orderId, provider: "cbe", receiptNumber }

// 3. Confirm (with or without photo)
POST /api/v1/payment-verification/:id/confirm
{ receiptFileId? }

// ✅ Done! (2-3 API calls, ~20 seconds)
```

---

## 🔑 API Base URL

```javascript
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1';
```

---

## 🔒 Authentication

All endpoints require:
```javascript
headers: {
  'Authorization': `Bearer ${authToken}`,
  'Content-Type': 'application/json' // or multipart/form-data for uploads
}
```

---

## 📋 Provider Values

```typescript
enum PaymentProvider {
  TELEBIRR = 'telebirr',
  CBE = 'cbe',           // Bank
  CBEBIRR = 'cbebirr'    // Mobile Wallet
}
```

---

## ⚠️ Common Errors

| Error | Meaning | Fix |
|-------|---------|-----|
| 400 "receipt photo required" | Confirming Telebirr without photo | Upload photo first |
| 409 "already been used" | Duplicate receipt | Receipt already verified |
| 400 "Invalid receipt format" | Wrong format | Check provider's expected format |
| 400 "Order already paid" | Duplicate verification | Order already marked as paid |
| 400 "Unrecognized payment provider" | Wrong QR | Only CBE Birr QR supported |

---

## 🎨 UI Flow

### Choose Method Screen
```
┌─────────────────────────┐
│  Verify Payment         │
│  Amount: 250 ETB        │
├─────────────────────────┤
│  📷 Scan CBE Birr QR    │
│  ⌨️  Enter Receipt Number│
└─────────────────────────┘
```

### QR Scan Screen
```
┌─────────────────────────┐
│  Scan Receipt QR Code   │
├─────────────────────────┤
│  ┌───────────────────┐  │
│  │                   │  │
│  │   [QR VIEWFINDER] │  │
│  │                   │  │
│  └───────────────────┘  │
│                         │
│  [Cancel]               │
└─────────────────────────┘
```

### Manual Entry Screen
```
┌─────────────────────────┐
│  Manual Verification    │
├─────────────────────────┤
│  Provider: [Telebirr ▼] │
│  Receipt #: [________]  │
│  Photo: [Choose File]   │
│                         │
│  [Verify] [Cancel]      │
└─────────────────────────┘
```

### Review Screen
```
┌─────────────────────────┐
│  Review Verification    │
├─────────────────────────┤
│  Provider: CBEBIRR      │
│  Receipt: DHT71MPGDI7   │
│  Amount: 250 ETB ✓      │
│  Status: COMPLETED      │
│  Payer: John Customer   │
│  📄 View Receipt        │
│                         │
│  [✓ Approve] [✗ Reject] │
└─────────────────────────┘
```

---

## 📦 Copy-Paste Code

### API Service Class
See `FRONTEND-DEVELOPER-PROMPT.md` line 50-150

### QR Scanner Component
See `FRONTEND-DEVELOPER-PROMPT.md` line 160-200

### Main Component
See `FRONTEND-DEVELOPER-PROMPT.md` line 210-450

---

## ✅ Testing Checklist

Quick test before submitting:
- [ ] QR scanner opens camera
- [ ] QR scan sends to backend successfully
- [ ] Manual entry works for all 3 providers
- [ ] Photo upload shows preview
- [ ] Photo upload enforced for Telebirr
- [ ] Amount match indicator works
- [ ] Confirm marks order as paid
- [ ] Reject with reason works
- [ ] Error messages are user-friendly
- [ ] Works on mobile device

---

## 🆘 Need Help?

1. **Implementation guide:** `FRONTEND-DEVELOPER-PROMPT.md`
2. **Full API docs:** `FRONTEND-INTEGRATION-GUIDE.md`
3. **Status check:** `INTEGRATION-STATUS-SUMMARY.md`
4. **Backend team:** Provide verification ID or error message

---

## 🚀 Ready to Code?

**Time Estimate:** 4-6 hours

**Steps:**
1. Install `html5-qrcode`
2. Copy code from `FRONTEND-DEVELOPER-PROMPT.md`
3. Test with backend API
4. Submit for review

**Documentation:** All 6 guides available in project root

Good luck! 🎉
