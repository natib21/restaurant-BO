# Payment Verification Frontend Integration Guide

## 📋 Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [API Endpoints Reference](#api-endpoints-reference)
4. [Complete User Workflow](#complete-user-workflow)
5. [Photo Upload Implementation](#photo-upload-implementation)
6. [Error Handling](#error-handling)
7. [TypeScript Types](#typescript-types)
8. [React/Vue Examples](#reactvue-examples)
9. [Testing Checklist](#testing-checklist)

---

## Overview

The Payment Verification system allows staff to verify Ethiopian mobile payments (Telebirr and CBE) for restaurant orders.

### Key Concepts

- **Providers**: `telebirr`, `cbe` (bank), or `cbebirr` (mobile wallet)
- **Verification Types**:
  - `manual_entry_auto_lookup` - Automated lookup succeeded (CBE/CBE Birr)
  - `manual_entry_lookup_failed` - Automated lookup failed (Telebirr currently)
- **Verification Methods**:
  - **QR Code Scan** (Recommended for CBE Birr) - Fast, automatic, includes PDF receipt
  - **Manual Entry** - Fallback for all providers
- **Receipt Photo**: **REQUIRED** for all manual verifications (lookup_failed), optional for auto-lookup

### Base URL
```
Production: https://api.yourrestaurant.com/api/v1
Development: http://localhost:3000/api/v1
```

---

## Authentication

All endpoints require Bearer token authentication.

### Headers Required
```javascript
{
  "Authorization": "Bearer <your_jwt_token>",
  "Content-Type": "application/json" // or multipart/form-data for uploads
}
```

### Getting Token
Login via `/api/v1/auth/login` endpoint:

```javascript
const response = await fetch('https://api.yourrestaurant.com/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'staff@restaurant.com',
    password: 'password123'
  })
});

const data = await response.json();
const token = data.token; // Store this for subsequent requests
```

---

## API Endpoints Reference

### 1. Upload Receipt Photo

**Endpoint:** `POST /api/v1/files/upload`

**Purpose:** Upload receipt image before initiating verification

**Request Type:** `multipart/form-data`

**Required Fields:**
- `file` (File) - The receipt image file
- `entityType` (string) - Must be `"order_payment"`
- `entityId` (string) - The order ID (ObjectId)
- `purpose` (string) - Must be `"receipt"`
- `branchId` (string, optional) - Branch ID if applicable

#### Request Example (JavaScript)

```javascript
const formData = new FormData();
formData.append('file', receiptImageFile); // File object from input
formData.append('entityType', 'order_payment');
formData.append('entityId', orderId);
formData.append('purpose', 'receipt');

const response = await fetch('https://api.yourrestaurant.com/api/v1/files/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
    // Don't set Content-Type - browser sets it automatically with boundary
  },
  body: formData
});

const data = await response.json();
```

#### Success Response (201)
```json
{
  "status": "success",
  "data": {
    "file": {
      "_id": "507f1f77bcf86cd799439011",
      "url": "/api/v1/files/507f1f77bcf86cd799439011/content",
      "entityType": "order_payment",
      "entityId": "507f1f77bcf86cd799439012",
      "purpose": "receipt"
    }
  }
}
```

**Important:** Save the `_id` field - you'll need it for confirmation!

#### Error Responses

**400 - No File**
```json
{
  "status": "fail",
  "message": "No file uploaded"
}
```

**400 - Invalid File Type**
```json
{
  "status": "fail",
  "message": "Only image uploads are supported"
}
```

**400 - Missing entityType**
```json
{
  "status": "fail",
  "message": "entityType is required"
}
```

**413 - File Too Large**
```json
{
  "status": "fail",
  "message": "File too large. Maximum size is 8MB"
}
```

---

### 2. Initiate Payment Verification (QR Code - NEW!)

**Endpoint:** `POST /api/v1/payment-verification/initiate-from-qr`

**Purpose:** Fast verification via QR code scanning (CBE Birr only currently)

**Request Type:** `application/json`

**Required Fields:**
- `orderId` (string) - Order ID to verify payment for
- `qrPayload` (string) - Raw QR code content (URL from scanner)

**Supported QR Formats:**
- **CBE Birr**: `https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI7&PH=251923479921`

#### Request Example

```javascript
const response = await fetch('https://api.yourrestaurant.com/api/v1/payment-verification/initiate-from-qr', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    orderId: '507f1f77bcf86cd799439012',
    qrPayload: 'https://cbepay1.cbe.com.et/aureceipt?TID=DHT71MPGDI7&PH=251923479921'
  })
});

const data = await response.json();
```

#### Success Response (201)

```json
{
  "status": "success",
  "data": {
    "verification": {
      "_id": "507f1f77bcf86cd799439015",
      "merchant": "507f1f77bcf86cd799439001",
      "order": "507f1f77bcf86cd799439012",
      "provider": "cbebirr",
      "providerReference": "DHT71MPGDI7",
      "verificationType": "manual_entry_auto_lookup",
      "status": "pending_review",
      "parseQuality": "high",
      "parsed": {
        "amount": 250.00,
        "currency": "ETB",
        "status": "COMPLETED",
        "timestamp": "2024-08-29T09:00:00.000Z",
        "payerName": "John Customer",
        "payerPhone": "251923479921"
      },
      "amountMatch": true,
      "receiptFileRef": "507f1f77bcf86cd799439016",
      "createdAt": "2024-08-29T10:30:00.000Z",
      "updatedAt": "2024-08-29T10:30:00.000Z"
    },
    "message": "Verification initiated and PDF receipt downloaded successfully"
  }
}
```

**What Happens Automatically:**
1. ✅ Backend validates QR URL (SSRF protection)
2. ✅ Backend extracts transaction ID and phone number
3. ✅ Backend fetches payment data from CBE Birr
4. ✅ Backend downloads PDF receipt
5. ✅ Backend stores PDF as FileAsset
6. ✅ Returns parsed payment data for staff review

**Note:** The `receiptFileRef` field contains the auto-downloaded PDF receipt ID.

#### Error Responses

**400 - Invalid QR Format**
```json
{
  "status": "fail",
  "message": "Invalid QR code format. Expected a valid URL."
}
```

**400 - Untrusted Host (Security)**
```json
{
  "status": "fail",
  "message": "Unrecognized payment provider. Expected cbepay1.cbe.com.et, got malicious-site.com"
}
```

**400 - Missing Parameters**
```json
{
  "status": "fail",
  "message": "QR code is missing transaction ID (TID parameter)"
}
```

**409 - Duplicate Receipt**
```json
{
  "status": "fail",
  "message": "This CBEBIRR receipt (DHT71MPGDI7) has already been used for order 507f1f77bcf86cd799439012"
}
```

**502 - CBE Server Error**
```json
{
  "status": "fail",
  "message": "Failed to download PDF: 502 Bad Gateway"
}
```

**When to Use:**
- ✅ Customer paid via CBE Birr mobile wallet
- ✅ Receipt has QR code
- ✅ Device has camera or QR scanner
- ❌ NOT for Telebirr (use manual entry)
- ❌ NOT for CBE Bank transfers (use manual entry)

---

### 3. Initiate Payment Verification (Manual Entry)

**Endpoint:** `POST /api/v1/payment-verification/initiate`

**Purpose:** Start verification process with manual receipt number entry

**Request Type:** `application/json`

**Required Fields:**
- `orderId` (string) - Order ID to verify payment for
- `provider` (string) - One of: `"telebirr"`, `"cbe"`, or `"cbebirr"`
- `receiptNumber` (string) - Receipt reference number from payment provider

#### Request Example

```javascript
const response = await fetch('https://api.yourrestaurant.com/api/v1/payment-verification/initiate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    orderId: '507f1f77bcf86cd799439012',
    provider: 'telebirr', // or 'cbe'
    receiptNumber: 'DB80L94QPK' // Telebirr format: 10-12 uppercase alphanumeric
  })
});

const data = await response.json();
```

#### Success Response (201)

**For Telebirr (lookup_failed):**
```json
{
  "status": "success",
  "data": {
    "verification": {
      "_id": "507f1f77bcf86cd799439013",
      "merchant": "507f1f77bcf86cd799439001",
      "order": "507f1f77bcf86cd799439012",
      "provider": "telebirr",
      "providerReference": "DB80L94QPK",
      "verificationType": "manual_entry_lookup_failed",
      "status": "lookup_failed",
      "parseQuality": "failed",
      "lookupError": "Telebirr auto-lookup not yet enabled — pending verification against live data",
      "parsed": {
        "fullRawText": "Telebirr auto-lookup not yet enabled — pending verification against live data"
      },
      "amountMatch": false,
      "createdAt": "2024-08-29T10:30:00.000Z",
      "updatedAt": "2024-08-29T10:30:00.000Z"
    }
  }
}
```

**For CBE (successful auto-lookup):**
```json
{
  "status": "success",
  "data": {
    "verification": {
      "_id": "507f1f77bcf86cd799439014",
      "merchant": "507f1f77bcf86cd799439001",
      "order": "507f1f77bcf86cd799439012",
      "provider": "cbe",
      "providerReference": "FT26240JY4DT",
      "verificationType": "manual_entry_auto_lookup",
      "status": "pending_review",
      "parseQuality": "high",
      "parsed": {
        "amount": 250.00,
        "status": "COMPLETED",
        "payerName": "John Doe",
        "transactionDate": "2024-08-29T08:15:00.000Z",
        "fullRawText": "Transaction completed successfully..."
      },
      "amountMatch": true,
      "createdAt": "2024-08-29T10:30:00.000Z",
      "updatedAt": "2024-08-29T10:30:00.000Z"
    }
  }
}
```

#### Error Responses

**400 - Missing Fields**
```json
{
  "status": "fail",
  "message": "orderId, provider, and receiptNumber are required"
}
```

**400 - Invalid Receipt Format (Telebirr)**
```json
{
  "status": "fail",
  "message": "Invalid Telebirr receipt format. Expected 10-12 uppercase letters/numbers (e.g., DB80L94QPK)"
}
```

**400 - Order Already Paid**
```json
{
  "status": "fail",
  "message": "Order is already paid"
}
```

**400 - Canceled Order**
```json
{
  "status": "fail",
  "message": "Cannot verify payment for canceled order"
}
```

**409 - Duplicate Receipt**
```json
{
  "status": "fail",
  "message": "This TELEBIRR receipt (DB80L94QPK) has already been used for order 507f1f77bcf86cd799439012"
}
```

**404 - Order Not Found**
```json
{
  "status": "fail",
  "message": "Order not found"
}
```

---

### 3. Confirm Payment Verification

**Endpoint:** `POST /api/v1/payment-verification/:id/confirm`

**Purpose:** Approve verification and mark order as paid

**Request Type:** `application/json`

**URL Parameter:**
- `:id` - Verification ID from initiate response

**Request Body:**
- `receiptFileId` (string) - **REQUIRED** for manual verifications, optional for auto-lookup

#### Request Example

```javascript
const verificationId = '507f1f77bcf86cd799439013';
const receiptFileId = '507f1f77bcf86cd799439011'; // From upload response

const response = await fetch(`https://api.yourrestaurant.com/api/v1/payment-verification/${verificationId}/confirm`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    receiptFileId: receiptFileId // REQUIRED for manual verifications!
  })
});

const data = await response.json();
```

#### Success Response (200)

```json
{
  "status": "success",
  "data": {
    "verification": {
      "_id": "507f1f77bcf86cd799439013",
      "merchant": "507f1f77bcf86cd799439001",
      "order": "507f1f77bcf86cd799439012",
      "provider": "telebirr",
      "providerReference": "DB80L94QPK",
      "verificationType": "manual_entry_lookup_failed",
      "status": "verified",
      "parseQuality": "failed",
      "verifiedBy": "507f1f77bcf86cd799439003",
      "verifiedAt": "2024-08-29T10:35:00.000Z",
      "receiptFileRef": "507f1f77bcf86cd799439011",
      "parsed": {
        "fullRawText": "Telebirr auto-lookup not yet enabled — pending verification against live data"
      },
      "amountMatch": false,
      "createdAt": "2024-08-29T10:30:00.000Z",
      "updatedAt": "2024-08-29T10:35:00.000Z"
    }
  }
}
```

**Note:** The associated order is now marked as `paid` and status updated to `completed` (for dine-in orders).

#### Error Responses

**400 - Receipt Photo Required**
```json
{
  "status": "fail",
  "message": "A receipt photo is required to confirm manual verifications"
}
```

**400 - Invalid Verification ID**
```json
{
  "status": "fail",
  "message": "Invalid verification ID format"
}
```

**400 - Invalid File ID**
```json
{
  "status": "fail",
  "message": "Invalid receipt file ID format"
}
```

**400 - Amount Mismatch**
```json
{
  "status": "fail",
  "message": "Receipt amount (250 ETB) does not match current order total (300 ETB). Order may have been modified after scan."
}
```

**400 - Order Already Paid**
```json
{
  "status": "fail",
  "message": "Order is already paid"
}
```

**404 - Verification Not Found**
```json
{
  "status": "fail",
  "message": "Verification record not found"
}
```

**404 - Receipt File Not Found**
```json
{
  "status": "fail",
  "message": "Receipt file not found or has been deleted"
}
```

**409 - Already Processed**
```json
{
  "status": "fail",
  "message": "Verification already processed (status: verified)"
}
```

---

### 4. Reject Payment Verification

**Endpoint:** `POST /api/v1/payment-verification/:id/reject`

**Purpose:** Reject verification (invalid receipt, fraud, etc.)

**Request Type:** `application/json`

**URL Parameter:**
- `:id` - Verification ID

**Required Fields:**
- `reason` (string) - Reason for rejection

#### Request Example

```javascript
const verificationId = '507f1f77bcf86cd799439013';

const response = await fetch(`https://api.yourrestaurant.com/api/v1/payment-verification/${verificationId}/reject`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    reason: 'Amount on receipt does not match order total'
  })
});

const data = await response.json();
```

#### Success Response (200)

```json
{
  "status": "success",
  "data": {
    "verification": {
      "_id": "507f1f77bcf86cd799439013",
      "merchant": "507f1f77bcf86cd799439001",
      "order": "507f1f77bcf86cd799439012",
      "provider": "telebirr",
      "providerReference": "DB80L94QPK",
      "verificationType": "manual_entry_lookup_failed",
      "status": "rejected",
      "parseQuality": "failed",
      "verifiedBy": "507f1f77bcf86cd799439003",
      "verifiedAt": "2024-08-29T10:35:00.000Z",
      "rejectionReason": "Amount on receipt does not match order total",
      "createdAt": "2024-08-29T10:30:00.000Z",
      "updatedAt": "2024-08-29T10:35:00.000Z"
    }
  }
}
```

#### Error Responses

**400 - Missing Reason**
```json
{
  "status": "fail",
  "message": "Rejection reason is required"
}
```

**409 - Already Processed**
```json
{
  "status": "fail",
  "message": "Cannot reject verification with status 'verified'"
}
```

---

### 5. List Payment Verifications

**Endpoint:** `GET /api/v1/payment-verification`

**Purpose:** Get list of verifications with filtering and pagination

**Query Parameters:**
- `status` (string, optional) - Filter by status: `pending_review`, `verified`, `rejected`, `lookup_failed`
- `page` (number, optional) - Page number (default: 1)
- `limit` (number, optional) - Items per page (default: 20)

#### Request Example

```javascript
const response = await fetch(
  'https://api.yourrestaurant.com/api/v1/payment-verification?status=pending_review&page=1&limit=10',
  {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

const data = await response.json();
```

#### Success Response (200)

```json
{
  "status": "success",
  "data": {
    "verifications": [
      {
        "_id": "507f1f77bcf86cd799439013",
        "merchant": "507f1f77bcf86cd799439001",
        "order": {
          "_id": "507f1f77bcf86cd799439012",
          "orderNumber": "ORD-2024-001",
          "totalAmount": 250.00,
          "customerName": "John Doe"
        },
        "provider": "telebirr",
        "providerReference": "DB80L94QPK",
        "verificationType": "manual_entry_lookup_failed",
        "status": "pending_review",
        "parseQuality": "failed",
        "createdAt": "2024-08-29T10:30:00.000Z",
        "updatedAt": "2024-08-29T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 45,
      "pages": 5
    }
  }
}
```

---

### 6. Get Single Verification

**Endpoint:** `GET /api/v1/payment-verification/:id`

**Purpose:** Get detailed information about a specific verification

**URL Parameter:**
- `:id` - Verification ID

#### Request Example

```javascript
const verificationId = '507f1f77bcf86cd799439013';

const response = await fetch(
  `https://api.yourrestaurant.com/api/v1/payment-verification/${verificationId}`,
  {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

const data = await response.json();
```

#### Success Response (200)

```json
{
  "status": "success",
  "data": {
    "verification": {
      "_id": "507f1f77bcf86cd799439013",
      "merchant": "507f1f77bcf86cd799439001",
      "order": {
        "_id": "507f1f77bcf86cd799439012",
        "orderNumber": "ORD-2024-001",
        "totalAmount": 250.00,
        "customerName": "John Doe",
        "paymentStatus": "unpaid",
        "status": "served"
      },
      "provider": "telebirr",
      "providerReference": "DB80L94QPK",
      "verificationType": "manual_entry_lookup_failed",
      "status": "pending_review",
      "parseQuality": "failed",
      "parsed": {
        "fullRawText": "Telebirr auto-lookup not yet enabled — pending verification against live data"
      },
      "amountMatch": false,
      "lookupError": "Telebirr auto-lookup not yet enabled — pending verification against live data",
      "receiptFileRef": null,
      "verifiedBy": null,
      "verifiedAt": null,
      "rejectionReason": null,
      "createdAt": "2024-08-29T10:30:00.000Z",
      "updatedAt": "2024-08-29T10:30:00.000Z"
    }
  }
}
```

#### Error Response

**404 - Not Found**
```json
{
  "status": "fail",
  "message": "Verification record not found"
}
```

---

### 7. Get Receipt Photo

**Endpoint:** `GET /api/v1/files/:id/content`

**Purpose:** Retrieve uploaded receipt image

**URL Parameter:**
- `:id` - File ID from upload response

**Authentication:** Required (Bearer token)

#### Request Example

```javascript
const fileId = '507f1f77bcf86cd799439011';

const response = await fetch(
  `https://api.yourrestaurant.com/api/v1/files/${fileId}/content`,
  {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

// Response is the image binary data
const blob = await response.blob();
const imageUrl = URL.createObjectURL(blob);

// Use in <img> tag
// <img src={imageUrl} alt="Receipt" />
```

#### Success Response (200)
- **Content-Type:** `image/jpeg`, `image/png`, etc.
- **Body:** Binary image data
- **Cache-Control:** `public, max-age=86400`

---

## Complete User Workflow

### Scenario 1: CBE Birr QR Code Verification (Recommended - Fastest!)

```javascript
// Step 1: Customer shows CBE Birr receipt QR code
// Step 2: Staff scans QR code with device camera

// QR Scanning function (using html5-qrcode library)
import { Html5QrcodeScanner } from 'html5-qrcode';

const scanQRAndVerify = async (orderId, token) => {
  return new Promise((resolve, reject) => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );
    
    scanner.render(
      async (decodedText) => {
        try {
          // QR scanned - send to backend
          const response = await fetch(
            'https://api.yourrestaurant.com/api/v1/payment-verification/initiate-from-qr',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                orderId: orderId,
                qrPayload: decodedText // Raw QR string
              })
            }
          );
          
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message);
          }
          
          const data = await response.json();
          scanner.clear();
          resolve(data.data.verification);
        } catch (error) {
          reject(error);
        }
      },
      (error) => {
        console.warn('QR scan error:', error);
      }
    );
  });
};

// Step 3: Review parsed payment data and confirm
const confirmQRVerification = async (verificationId, token) => {
  const response = await fetch(
    `https://api.yourrestaurant.com/api/v1/payment-verification/${verificationId}/confirm`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
      // No receiptFileId needed - PDF auto-downloaded!
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  const data = await response.json();
  return data.data.verification;
};

// Full QR workflow
const processCBEBirrPayment = async (orderId, token) => {
  try {
    // 1. Scan QR and initiate (one step!)
    console.log('Scanning QR code...');
    const verification = await scanQRAndVerify(orderId, token);
    console.log('QR scanned! Payment data:', verification.parsed);
    
    // Show staff the parsed data for review:
    // - Amount: verification.parsed.amount
    // - Status: verification.parsed.status
    // - Payer: verification.parsed.payerName
    // - Amount Match: verification.amountMatch
    
    // 2. Staff reviews and confirms
    console.log('Confirming verification...');
    const confirmed = await confirmQRVerification(verification._id, token);
    console.log('Payment verified! Order is now paid.');
    
    return confirmed;
  } catch (error) {
    console.error('CBE Birr verification failed:', error.message);
    throw error;
  }
};
```

**Benefits of QR Method:**
- ✅ Only 2 API calls (vs 3 for manual)
- ✅ No manual typing (reduces errors)
- ✅ PDF receipt automatically downloaded
- ✅ Faster (10 seconds vs 30 seconds)
- ✅ Higher accuracy

---

### Scenario 2: Telebirr Payment Verification (Manual)

```javascript
// Step 1: Customer shows receipt to staff
// Staff takes photo with device camera or selects from gallery

// Step 2: Upload receipt photo
const uploadReceipt = async (imageFile, orderId, token) => {
  const formData = new FormData();
  formData.append('file', imageFile);
  formData.append('entityType', 'order_payment');
  formData.append('entityId', orderId);
  formData.append('purpose', 'receipt');
  
  const response = await fetch('https://api.yourrestaurant.com/api/v1/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  const data = await response.json();
  return data.data.file._id; // Return file ID
};

// Step 3: Staff enters receipt number from the photo
// System initiates verification
const initiateVerification = async (orderId, receiptNumber, token) => {
  const response = await fetch('https://api.yourrestaurant.com/api/v1/payment-verification/initiate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      orderId: orderId,
      provider: 'telebirr',
      receiptNumber: receiptNumber
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  const data = await response.json();
  return data.data.verification;
};

// Step 4: Confirm verification with receipt photo
const confirmVerification = async (verificationId, receiptFileId, token) => {
  const response = await fetch(
    `https://api.yourrestaurant.com/api/v1/payment-verification/${verificationId}/confirm`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        receiptFileId: receiptFileId
      })
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  const data = await response.json();
  return data.data.verification;
};

// Full workflow
const processPayment = async (orderId, receiptImage, receiptNumber, token) => {
  try {
    // 1. Upload photo
    console.log('Uploading receipt photo...');
    const fileId = await uploadReceipt(receiptImage, orderId, token);
    console.log('Photo uploaded:', fileId);
    
    // 2. Initiate verification
    console.log('Initiating verification...');
    const verification = await initiateVerification(orderId, receiptNumber, token);
    console.log('Verification created:', verification._id);
    
    // 3. Confirm with photo
    console.log('Confirming verification...');
    const confirmed = await confirmVerification(verification._id, fileId, token);
    console.log('Payment verified! Order is now paid.');
    
    return confirmed;
  } catch (error) {
    console.error('Payment verification failed:', error.message);
    throw error;
  }
};
```

---

## Photo Upload Implementation

### HTML File Input

```html
<input 
  type="file" 
  id="receiptPhoto" 
  accept="image/*" 
  capture="environment"
/>
```

**Note:** `capture="environment"` opens rear camera on mobile devices

### JavaScript File Handling

```javascript
const fileInput = document.getElementById('receiptPhoto');

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  
  if (!file) return;
  
  // Validate file
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file');
    return;
  }
  
  if (file.size > 8 * 1024 * 1024) { // 8MB
    alert('File too large. Maximum size is 8MB');
    return;
  }
  
  // Preview image
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('preview').src = e.target.result;
  };
  reader.readAsDataURL(file);
  
  // Upload
  try {
    const fileId = await uploadReceipt(file, orderId, token);
    console.log('Upload successful:', fileId);
  } catch (error) {
    alert('Upload failed: ' + error.message);
  }
});
```

### Image Compression (Optional)

```javascript
const compressImage = async (file, maxWidth = 1200, quality = 0.8) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now()
          }));
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

// Usage
const originalFile = event.target.files[0];
const compressedFile = await compressImage(originalFile);
await uploadReceipt(compressedFile, orderId, token);
```

---

## Error Handling

### Comprehensive Error Handler

```javascript
const handlePaymentVerificationError = (error, response) => {
  // Parse error response
  let message = 'An error occurred';
  let code = 'UNKNOWN_ERROR';
  
  if (response) {
    const errorData = response;
    message = errorData.message || message;
    code = errorData.status || code;
  }
  
  // User-friendly messages
  const userMessages = {
    'A receipt photo is required to confirm manual verifications': 
      'Please upload a receipt photo before confirming',
    'Invalid Telebirr receipt format': 
      'Receipt number must be 10-12 uppercase letters/numbers (e.g., DB80L94QPK)',
    'Order is already paid': 
      'This order has already been paid',
    'Verification already processed': 
      'This verification has already been processed',
    'Receipt file not found or has been deleted': 
      'The receipt photo was not found. Please upload again',
    'Amount on receipt does not match current order total': 
      'Receipt amount does not match order total. Please verify',
  };
  
  // Return user-friendly message
  return userMessages[message] || message;
};

// Usage
try {
  await confirmVerification(verificationId, fileId, token);
} catch (error) {
  const userMessage = handlePaymentVerificationError(error, await error.response?.json());
  alert(userMessage);
}
```

### Retry Logic

```javascript
const uploadWithRetry = async (file, orderId, token, maxRetries = 3) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await uploadReceipt(file, orderId, token);
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        console.log(`Upload failed, retrying (${i + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
      }
    }
  }
  
  throw lastError;
};
```

---

## TypeScript Types

```typescript
// Enums
enum PaymentProvider {
  TELEBIRR = 'telebirr',
  CBE = 'cbe',
  CBEBIRR = 'cbebirr'
}

enum VerificationType {
  MANUAL_ENTRY_AUTO_LOOKUP = 'manual_entry_auto_lookup',
  MANUAL_ENTRY_LOOKUP_FAILED = 'manual_entry_lookup_failed',
  QR_SCAN = 'qr_scan'
}

enum VerificationStatus {
  PENDING_REVIEW = 'pending_review',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  LOOKUP_FAILED = 'lookup_failed'
}

enum ParseQuality {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  FAILED = 'failed'
}

// API Response Types
interface ApiResponse<T> {
  status: 'success' | 'fail' | 'error';
  message?: string;
  data?: T;
}

interface FileUploadResponse {
  file: {
    _id: string;
    url: string;
    entityType: string;
    entityId: string;
    purpose: string;
  };
}

interface ParsedData {
  amount?: number;
  payerName?: string;
  payerAccountOrPhone?: string;
  receiverName?: string;
  receiverAccount?: string;
  transactionDate?: string;
  status?: string;
  fullRawText?: string;
}

interface PaymentVerification {
  _id: string;
  merchant: string;
  order: string | {
    _id: string;
    orderNumber: string;
    totalAmount: number;
    customerName?: string;
    paymentStatus: string;
    status: string;
  };
  provider: PaymentProvider;
  providerReference: string;
  verificationType: VerificationType;
  parsed?: ParsedData;
  amountMatch?: boolean;
  accountMatch?: boolean;
  parseQuality: ParseQuality;
  status: VerificationStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  receiptFileRef?: string;
  lookupError?: string;
  retryCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface VerificationListResponse {
  verifications: PaymentVerification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Request Types
interface InitiateVerificationRequest {
  orderId: string;
  provider: PaymentProvider;
  receiptNumber: string;
}

interface ConfirmVerificationRequest {
  receiptFileId?: string;
}

interface RejectVerificationRequest {
  reason: string;
}

// Service Functions
class PaymentVerificationService {
  private baseUrl: string;
  private token: string;
  
  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }
  
  async uploadReceipt(
    file: File,
    orderId: string
  ): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', 'order_payment');
    formData.append('entityId', orderId);
    formData.append('purpose', 'receipt');
    
    const response = await fetch(`${this.baseUrl}/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`
      },
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Upload failed');
    }
    
    const data: ApiResponse<FileUploadResponse> = await response.json();
    return data.data!.file._id;
  }
  
  async initiate(
    request: InitiateVerificationRequest
  ): Promise<PaymentVerification> {
    const response = await fetch(`${this.baseUrl}/payment-verification/initiate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      throw new Error('Initiation failed');
    }
    
    const data: ApiResponse<{ verification: PaymentVerification }> = await response.json();
    return data.data!.verification;
  }
  
  async confirm(
    verificationId: string,
    request: ConfirmVerificationRequest
  ): Promise<PaymentVerification> {
    const response = await fetch(
      `${this.baseUrl}/payment-verification/${verificationId}/confirm`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      }
    );
    
    if (!response.ok) {
      throw new Error('Confirmation failed');
    }
    
    const data: ApiResponse<{ verification: PaymentVerification }> = await response.json();
    return data.data!.verification;
  }
  
  async reject(
    verificationId: string,
    request: RejectVerificationRequest
  ): Promise<PaymentVerification> {
    const response = await fetch(
      `${this.baseUrl}/payment-verification/${verificationId}/reject`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      }
    );
    
    if (!response.ok) {
      throw new Error('Rejection failed');
    }
    
    const data: ApiResponse<{ verification: PaymentVerification }> = await response.json();
    return data.data!.verification;
  }
  
  async list(
    status?: VerificationStatus,
    page: number = 1,
    limit: number = 20
  ): Promise<VerificationListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });
    
    if (status) {
      params.append('status', status);
    }
    
    const response = await fetch(
      `${this.baseUrl}/payment-verification?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error('List failed');
    }
    
    const data: ApiResponse<VerificationListResponse> = await response.json();
    return data.data!;
  }
  
  async getById(verificationId: string): Promise<PaymentVerification> {
    const response = await fetch(
      `${this.baseUrl}/payment-verification/${verificationId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error('Get failed');
    }
    
    const data: ApiResponse<{ verification: PaymentVerification }> = await response.json();
    return data.data!.verification;
  }
}
```

---

## React/Vue Examples

### React Component

```tsx
import React, { useState } from 'react';
import { PaymentVerificationService, PaymentProvider } from './types';

interface PaymentVerificationFormProps {
  orderId: string;
  token: string;
  onSuccess: () => void;
}

const PaymentVerificationForm: React.FC<PaymentVerificationFormProps> = ({
  orderId,
  token,
  onSuccess
}) => {
  const [receiptImage, setReceiptImage] = useState<File | null>(null);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [provider, setProvider] = useState<PaymentProvider>(PaymentProvider.TELEBIRR);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  
  const service = new PaymentVerificationService(
    'https://api.yourrestaurant.com/api/v1',
    token
  );
  
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    
    if (file.size > 8 * 1024 * 1024) {
      setError('File too large. Maximum size is 8MB');
      return;
    }
    
    setReceiptImage(file);
    setError('');
    
    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // Validate
      if (!receiptImage) {
        throw new Error('Please upload a receipt photo');
      }
      
      if (!receiptNumber.trim()) {
        throw new Error('Please enter receipt number');
      }
      
      // 1. Upload photo
      const fileId = await service.uploadReceipt(receiptImage, orderId);
      
      // 2. Initiate verification
      const verification = await service.initiate({
        orderId,
        provider,
        receiptNumber: receiptNumber.trim().toUpperCase()
      });
      
      // 3. Confirm with photo
      await service.confirm(verification._id, { receiptFileId: fileId });
      
      // Success!
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="payment-verification-form">
      <h2>Verify Payment</h2>
      
      {error && (
        <div className="alert alert-error">{error}</div>
      )}
      
      <div className="form-group">
        <label>Payment Provider</label>
        <select 
          value={provider} 
          onChange={(e) => setProvider(e.target.value as PaymentProvider)}
        >
          <option value={PaymentProvider.TELEBIRR}>Telebirr</option>
          <option value={PaymentProvider.CBE}>CBE</option>
        </select>
      </div>
      
      <div className="form-group">
        <label>Receipt Photo *</label>
        <input 
          type="file" 
          accept="image/*" 
          capture="environment"
          onChange={handleImageChange}
          required
        />
        {preview && (
          <img src={preview} alt="Receipt preview" className="receipt-preview" />
        )}
      </div>
      
      <div className="form-group">
        <label>Receipt Number *</label>
        <input 
          type="text" 
          value={receiptNumber}
          onChange={(e) => setReceiptNumber(e.target.value)}
          placeholder="e.g., DB80L94QPK"
          required
        />
        <small>Enter the reference number from the receipt</small>
      </div>
      
      <button type="submit" disabled={loading}>
        {loading ? 'Processing...' : 'Verify Payment'}
      </button>
    </form>
  );
};

export default PaymentVerificationForm;
```

### Vue 3 Component

```vue
<template>
  <form @submit.prevent="handleSubmit" class="payment-verification-form">
    <h2>Verify Payment</h2>
    
    <div v-if="error" class="alert alert-error">{{ error }}</div>
    
    <div class="form-group">
      <label>Payment Provider</label>
      <select v-model="provider">
        <option value="telebirr">Telebirr</option>
        <option value="cbe">CBE</option>
      </select>
    </div>
    
    <div class="form-group">
      <label>Receipt Photo *</label>
      <input 
        type="file" 
        accept="image/*" 
        capture="environment"
        @change="handleImageChange"
        required
      />
      <img v-if="preview" :src="preview" alt="Receipt preview" class="receipt-preview" />
    </div>
    
    <div class="form-group">
      <label>Receipt Number *</label>
      <input 
        v-model="receiptNumber"
        type="text" 
        placeholder="e.g., DB80L94QPK"
        required
      />
      <small>Enter the reference number from the receipt</small>
    </div>
    
    <button type="submit" :disabled="loading">
      {{ loading ? 'Processing...' : 'Verify Payment' }}
    </button>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { PaymentVerificationService } from './services/payment-verification';

interface Props {
  orderId: string;
  token: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  success: [];
}>();

const receiptImage = ref<File | null>(null);
const receiptNumber = ref('');
const provider = ref('telebirr');
const loading = ref(false);
const error = ref('');
const preview = ref('');

const service = new PaymentVerificationService(
  'https://api.yourrestaurant.com/api/v1',
  props.token
);

const handleImageChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    error.value = 'Please select an image file';
    return;
  }
  
  if (file.size > 8 * 1024 * 1024) {
    error.value = 'File too large. Maximum size is 8MB';
    return;
  }
  
  receiptImage.value = file;
  error.value = '';
  
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.value = e.target?.result as string;
  };
  reader.readAsDataURL(file);
};

const handleSubmit = async () => {
  loading.value = true;
  error.value = '';
  
  try {
    if (!receiptImage.value) {
      throw new Error('Please upload a receipt photo');
    }
    
    if (!receiptNumber.value.trim()) {
      throw new Error('Please enter receipt number');
    }
    
    // 1. Upload photo
    const fileId = await service.uploadReceipt(receiptImage.value, props.orderId);
    
    // 2. Initiate verification
    const verification = await service.initiate({
      orderId: props.orderId,
      provider: provider.value as any,
      receiptNumber: receiptNumber.value.trim().toUpperCase()
    });
    
    // 3. Confirm with photo
    await service.confirm(verification._id, { receiptFileId: fileId });
    
    // Success!
    emit('success');
  } catch (err: any) {
    error.value = err.message || 'Verification failed';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.receipt-preview {
  max-width: 300px;
  margin-top: 10px;
}
</style>
```

---

## Testing Checklist

### Manual Testing Steps

#### 1. Upload Receipt Photo
- [ ] Select/capture image from device
- [ ] Verify image preview displays
- [ ] Verify file size validation (>8MB rejected)
- [ ] Verify file type validation (non-images rejected)
- [ ] Verify upload progress indicator
- [ ] Verify success message with file ID
- [ ] Test retry on network failure

#### 2. Initiate Verification
- [ ] Enter valid Telebirr receipt number (10-12 chars)
- [ ] Enter valid CBE receipt number
- [ ] Verify invalid format error for Telebirr
- [ ] Verify duplicate receipt error
- [ ] Verify already-paid order error
- [ ] Verify canceled order error

#### 3. Confirm Verification
- [ ] Confirm with uploaded photo (Telebirr)
- [ ] Verify missing photo error (Telebirr)
- [ ] Confirm without photo (CBE auto-lookup)
- [ ] Verify amount mismatch error
- [ ] Verify already-processed error
- [ ] Verify order marked as paid after confirmation

#### 4. Reject Verification
- [ ] Reject with reason
- [ ] Verify missing reason error
- [ ] Verify already-processed error
- [ ] Verify order remains unpaid after rejection

#### 5. List/Get Verifications
- [ ] List all verifications
- [ ] Filter by status
- [ ] Verify pagination
- [ ] Get single verification details
- [ ] Verify order data populated

#### 6. Error Handling
- [ ] Test network timeout
- [ ] Test server error (500)
- [ ] Test unauthorized (401)
- [ ] Test not found (404)
- [ ] Test validation errors (400)
- [ ] Verify user-friendly error messages

---

## Quick Start Checklist

✅ **Backend Setup**
- API server running
- Authentication configured
- File upload working
- Payment verification routes registered

✅ **Frontend Setup**
- API base URL configured
- Authentication token management
- File upload component
- Error handling implemented

✅ **Testing**
- Upload test images
- Create test orders
- Verify full workflow
- Test error scenarios

✅ **Production**
- HTTPS enabled
- File size limits configured
- Error monitoring
- User training completed
