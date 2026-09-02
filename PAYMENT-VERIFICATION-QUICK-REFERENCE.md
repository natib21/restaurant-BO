# Payment Verification API - Quick Reference

## Base URL
```
Production: https://api.yourrestaurant.com/api/v1
Development: http://localhost:3000/api/v1
```

## Authentication
All requests require: `Authorization: Bearer <token>`

---

## 📸 1. Upload Receipt Photo

```http
POST /files/upload
Content-Type: multipart/form-data
```

**Form Data:**
- `file` - Image file (max 8MB)
- `entityType` - `"order_payment"`
- `entityId` - Order ID
- `purpose` - `"receipt"`

**Response:**
```json
{
  "status": "success",
  "data": {
    "file": {
      "_id": "507f1f77bcf86cd799439011",
      "url": "/api/v1/files/507f1f77bcf86cd799439011/content"
    }
  }
}
```

---

## ✅ 2. Initiate Verification

```http
POST /payment-verification/initiate
Content-Type: application/json
```

**Body:**
```json
{
  "orderId": "507f1f77bcf86cd799439012",
  "provider": "telebirr",  // or "cbe"
  "receiptNumber": "DB80L94QPK"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "verification": {
      "_id": "507f1f77bcf86cd799439013",
      "provider": "telebirr",
      "providerReference": "DB80L94QPK",
      "verificationType": "manual_entry_lookup_failed",
      "status": "lookup_failed"
    }
  }
}
```

---

## ✔️ 3. Confirm Verification

```http
POST /payment-verification/:id/confirm
Content-Type: application/json
```

**Body:**
```json
{
  "receiptFileId": "507f1f77bcf86cd799439011"
}
```

**⚠️ REQUIRED for manual verifications!**

**Response:**
```json
{
  "status": "success",
  "data": {
    "verification": {
      "_id": "507f1f77bcf86cd799439013",
      "status": "verified",
      "verifiedBy": "507f1f77bcf86cd799439003",
      "verifiedAt": "2024-08-29T10:35:00.000Z"
    }
  }
}
```

---

## ❌ 4. Reject Verification

```http
POST /payment-verification/:id/reject
Content-Type: application/json
```

**Body:**
```json
{
  "reason": "Amount mismatch"
}
```

---

## 📋 5. List Verifications

```http
GET /payment-verification?status=pending_review&page=1&limit=20
```

**Query Parameters:**
- `status` (optional): `pending_review`, `verified`, `rejected`, `lookup_failed`
- `page` (optional): Default 1
- `limit` (optional): Default 20

---

## 🔍 6. Get Verification

```http
GET /payment-verification/:id
```

---

## Common Errors

| Code | Message | Solution |
|------|---------|----------|
| 400 | A receipt photo is required to confirm manual verifications | Upload photo first |
| 400 | Invalid Telebirr receipt format | Use 10-12 uppercase alphanumeric |
| 409 | This receipt has already been used | Receipt already verified for another order |
| 404 | Receipt file not found | File was deleted or invalid ID |

---

## JavaScript Example

```javascript
// Full workflow
async function verifyPayment(orderId, receiptImage, receiptNumber, token) {
  // 1. Upload photo
  const formData = new FormData();
  formData.append('file', receiptImage);
  formData.append('entityType', 'order_payment');
  formData.append('entityId', orderId);
  formData.append('purpose', 'receipt');
  
  const uploadRes = await fetch('/api/v1/files/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  const { data: { file } } = await uploadRes.json();
  
  // 2. Initiate
  const initiateRes = await fetch('/api/v1/payment-verification/initiate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      orderId,
      provider: 'telebirr',
      receiptNumber: receiptNumber.toUpperCase()
    })
  });
  const { data: { verification } } = await initiateRes.json();
  
  // 3. Confirm
  await fetch(`/api/v1/payment-verification/${verification._id}/confirm`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ receiptFileId: file._id })
  });
  
  console.log('Payment verified!');
}
```

---

## Receipt Number Formats

- **Telebirr**: 10-12 uppercase letters/numbers (e.g., `DB80L94QPK`)
- **CBE**: Variable format (e.g., `FT26240JY4DT`)

---

## RBAC Tasks

Added to `scripts/seed-roles-and-tasks.js`:

```javascript
{ name: 'paymentVerification.initiate', endpoint: '/api/v1/payment-verification/initiate', method: 'POST' }
{ name: 'paymentVerification.confirm', endpoint: '/api/v1/payment-verification/:id/confirm', method: 'POST' }
{ name: 'paymentVerification.reject', endpoint: '/api/v1/payment-verification/:id/reject', method: 'POST' }
{ name: 'paymentVerification.list', endpoint: '/api/v1/payment-verification', method: 'GET' }
{ name: 'paymentVerification.read', endpoint: '/api/v1/payment-verification/:id', method: 'GET' }
{ name: 'files.upload', endpoint: '/api/v1/files/upload', method: 'POST' }
```

Run: `node scripts/seed-roles-and-tasks.js` to add permissions.

---

## Full Documentation

See `FRONTEND-INTEGRATION-GUIDE.md` for complete guide including:
- TypeScript types
- React/Vue examples
- Error handling
- Image compression
- Retry logic
- Testing checklist
