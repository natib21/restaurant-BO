# Payment Verification - Complete Frontend Integration Guide

## 📋 Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Complete API Endpoints](#complete-api-endpoints)
4. [User Workflows](#user-workflows)
5. [Implementation Examples](#implementation-examples)
6. [Error Handling](#error-handling)
7. [TypeScript Definitions](#typescript-definitions)
8. [Testing Guide](#testing-guide)

---

## Overview

### What This System Does

Staff can verify Ethiopian mobile payments (Telebirr and CBE) for restaurant orders using:
1. **QR Code Scanning** (CBE only) - Fast, automatic, includes PDF receipt
2. **Manual Entry** (Both providers) - Fallback method

### Key Features

- ✅ Automatic payment data lookup for CBE
- ✅ Automatic PDF receipt download for CBE QR codes
- ✅ Required receipt photo for Telebirr
- ✅ Duplicate receipt prevention
- ✅ Amount validation
- ✅ Real-time status tracking

### Base URLs

```javascript
const API_BASE_URL = {
  production: 'https://api.yourrestaurant.com/api/v1',
  staging: 'https://staging-api.yourrestaurant.com/api/v1',
  development: 'http://localhost:3000/api/v1'
};
```

---

## Authentication

### Required Headers

```javascript
const headers = {
  'Authorization': `Bearer ${authToken}`,
  'Content-Type': 'application/json', // or multipart/form-data for file uploads
};
```

### Getting Auth Token

```javascript
// Login endpoint
POST /api/v1/auth/login

// Request
{
  "email": "staff@restaurant.com",
  "password": "password123"
}

// Response
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Staff",
      "email": "staff@restaurant.com",
      "role": "staff"
    }
  }
}
```

Store the token securely:
```javascript
localStorage.setItem('authToken', response.token);
// or
sessionStorage.setItem('authToken', response.token);
```

---

## Complete API Endpoints

### 1. Upload Receipt Photo

**Use When:** Before initiating verification (especially for Telebirr)

```http
POST /api/v1/files/upload
Content-Type: multipart/form-data
```

**Request (Form Data):**
```javascript
const formData = new FormData();
formData.append('file', receiptPhotoFile); // File object from input
formData.append('entityType', 'order_payment');
formData.append('entityId', orderId); // Order ID
formData.append('purpose', 'receipt');
```

**Response (Success - 201):**
```json
{
  "status": "success",
  "data": {
    "file": {
      "_id": "507f1f77bcf86cd799439014",
      "filename": "receipt-1705234567890.jpg",
      "mimeType": "image/jpeg",
      "sizeBytes": 245678,
      "url": "https://cdn.yourrestaurant.com/receipts/xyz.jpg",
      "entityType": "order_payment",
      "entityId": "507f1f77bcf86cd799439012",
      "purpose": "receipt",
      "uploadedAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

**Response (Error - 400):**
```json
{
  "status": "fail",
  "message": "File is required"
}
```

**Supported File Types:**
- Images: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- Max size: 10 MB

---

### 2. Initiate Verification from QR Code (NEW - CBE Only)

**Use When:** Staff scans CBE receipt QR code

**Advantages:**
- ✅ Fastest method (one API call)
- ✅ Automatically downloads PDF receipt
- ✅ No manual typing needed
- ✅ Higher accuracy

```http
POST /api/v1/payment-verification/initiate-from-qr
Content-Type: application/json
```

**Request:**
```json
{
  "orderId": "507f1f77bcf86cd799439012",
  "qrPayload": "https://apps.cbe.com.et:100/?id=FT26240JY4DT"
}
```

**Field Descriptions:**
- `orderId` (required): The order being paid for
- `qrPayload` (required): Raw QR code string (the URL from QR scanner)

**Response (Success - 201):**
```json
{
  "status": "success",
  "data": {
    "verification": {
      "_id": "507f1f77bcf86cd799439015",
      "merchant": "507f1f77bcf86cd799439011",
      "order": "507f1f77bcf86cd799439012",
      "provider": "cbe",
      "providerReference": "FT26240JY4DT",
      "verificationType": "manual_entry_auto_lookup",
      "status": "pending_review",
      "parsed": {
        "amount": 250.00,
        "currency": "ETB",
        "status": "COMPLETED",
        "timestamp": "2024-01-15T09:00:00Z",
        "payerName": "John Customer",
        "payerAccount": "1234567890"
      },
      "amountMatch": true,
      "accountMatch": null,
      "parseQuality": "high",
      "receiptFileRef": "507f1f77bcf86cd799439016",
      "lookupError": null,
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    },
    "message": "Verification initiated and PDF receipt downloaded successfully"
  }
}
```

**Response Fields Explained:**

- **`status`**: Current verification state
  - `pending_review` - Needs staff approval (most common)
  - `lookup_failed` - Auto-lookup failed, photo required
  - `rejected` - Auto-rejected (payment failed at provider)

- **`parsed`**: Data extracted from CBE receipt
  - `amount` - Payment amount in ETB
  - `status` - Payment status at provider (`COMPLETED`, `FAILED`, `PENDING`)
  - `payerName` - Customer name who paid
  - `payerAccount` - Payment account number

- **`amountMatch`**: Whether payment amount matches order total
  - `true` - ✅ Amounts match (safe to approve)
  - `false` - ⚠️ Mismatch (needs review)

- **`parseQuality`**: Confidence level of data extraction
  - `high` - All data extracted successfully
  - `low` - Some data missing or unclear
  - `failed` - Could not extract data

- **`receiptFileRef`**: PDF receipt file ID (auto-downloaded)
  - Can be used to view/download PDF: `/api/v1/files/{receiptFileRef}/download`

**Response (Error - 400 - Invalid QR):**
```json
{
  "status": "fail",
  "message": "Unrecognized payment provider. Expected apps.cbe.com.et, got malicious-site.com"
}
```

**Response (Error - 404 - Order Not Found):**
```json
{
  "status": "fail",
  "message": "Order not found"
}
```

**Response (Error - 409 - Duplicate):**
```json
{
  "status": "fail",
  "message": "This CBE receipt (FT26240JY4DT) has already been used for order 507f1f77bcf86cd799439012"
}
```

**When to Use This Endpoint:**
- ✅ Customer paid via CBE
- ✅ Receipt has a QR code
- ✅ Staff has camera/QR scanner
- ❌ NOT for Telebirr (use manual entry instead)

---

### 3. Initiate Verification (Manual Entry)

**Use When:** 
- Staff manually types receipt number
- Telebirr payments (required, no QR support yet)
- CBE fallback (if QR code unreadable)

```http
POST /api/v1/payment-verification/initiate
Content-Type: application/json
```

**Request:**
```json
{
  "orderId": "507f1f77bcf86cd799439012",
  "provider": "telebirr",
  "receiptNumber": "DB80L94QPK"
}
```

**Field Descriptions:**
- `orderId` (required): Order being verified
- `provider` (required): `"telebirr"` or `"cbe"`
- `receiptNumber` (required): Receipt reference number from customer

**Response (Success - 201):**
```json
{
  "status": "success",
  "data": {
    "verification": {
      "_id": "507f1f77bcf86cd799439015",
      "merchant": "507f1f77bcf86cd799439011",
      "order": "507f1f77bcf86cd799439012",
      "provider": "telebirr",
      "providerReference": "DB80L94QPK",
      "verificationType": "manual_entry_lookup_failed",
      "status": "lookup_failed",
      "parsed": {
        "fullRawText": "Telebirr auto-lookup not yet enabled"
      },
      "amountMatch": false,
      "parseQuality": "failed",
      "lookupError": "Telebirr auto-lookup not yet enabled",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

**Response (Error - 400 - Invalid Receipt Format):**
```json
{
  "status": "fail",
  "message": "Invalid CBE receipt format. Expected 8-15 alphanumeric characters"
}
```

**Response (Error - 409 - Duplicate):**
```json
{
  "status": "fail",
  "message": "This TELEBIRR receipt (DB80L94QPK) has already been used for order 507f1f77bcf86cd799439012"
}
```

---

### 4. Confirm/Approve Verification

**Use When:** Staff reviews and approves the payment verification

```http
POST /api/v1/payment-verification/:id/confirm
Content-Type: application/json
```

**URL Parameters:**
- `:id` - Verification ID (from initiate response)

**Request (With Receipt Photo - Required for Telebirr):**
```json
{
  "receiptFileId": "507f1f77bcf86cd799439014"
}
```

**Request (Without Photo - OK for CBE auto-lookup):**
```json
{}
```

**Field Descriptions:**
- `receiptFileId` (conditional): File ID from upload endpoint
  - **REQUIRED** if `verificationType === 'manual_entry_lookup_failed'` (Telebirr)
  - **OPTIONAL** if auto-lookup succeeded (CBE QR or manual with successful lookup)

**Response (Success - 200):**
```json
{
  "status": "success",
  "data": {
    "verification": {
      "_id": "507f1f77bcf86cd799439015",
      "status": "approved",
      "verifiedBy": "507f1f77bcf86cd799439011",
      "verifiedAt": "2024-01-15T10:35:00Z",
      "receiptFileRef": "507f1f77bcf86cd799439014",
      "order": {
        "_id": "507f1f77bcf86cd799439012",
        "orderNumber": "ORD-2024-001",
        "paymentStatus": "paid",
        "status": "confirmed"
      }
    }
  }
}
```

**What Happens When You Confirm:**
1. ✅ Verification status → `approved`
2. ✅ Order `paymentStatus` → `paid`
3. ✅ Order `status` → advances (e.g., `payment_pending` → `confirmed`)
4. ✅ Customer gets payment confirmation email
5. ✅ Kitchen gets notified to start preparing

**Response (Error - 400 - Missing Photo for Telebirr):**
```json
{
  "status": "fail",
  "message": "A receipt photo is required to confirm manual verifications"
}
```

**Response (Error - 400 - Invalid Photo):**
```json
{
  "status": "fail",
  "message": "Receipt photo not found or does not belong to this merchant"
}
```

**Response (Error - 404 - Verification Not Found):**
```json
{
  "status": "fail",
  "message": "Verification record not found"
}
```

**Response (Error - 409 - Already Processed):**
```json
{
  "status": "fail",
  "message": "This verification has already been approved"
}
```

---

### 5. Reject Verification

**Use When:** Payment is invalid, fraudulent, or doesn't match order

```http
POST /api/v1/payment-verification/:id/reject
Content-Type: application/json
```

**URL Parameters:**
- `:id` - Verification ID

**Request:**
```json
{
  "reason": "Amount doesn't match order total (paid 200 ETB, order is 250 ETB)"
}
```

**Field Descriptions:**
- `reason` (required): Explanation for rejection (shown to customer)

**Response (Success - 200):**
```json
{
  "status": "success",
  "data": {
    "verification": {
      "_id": "507f1f77bcf86cd799439015",
      "status": "rejected",
      "rejectionReason": "Amount doesn't match order total",
      "verifiedBy": "507f1f77bcf86cd799439011",
      "verifiedAt": "2024-01-15T10:35:00Z"
    }
  }
}
```

**What Happens When You Reject:**
1. ❌ Verification status → `rejected`
2. ❌ Order stays as `payment_pending`
3. 📧 Customer gets notification to retry payment
4. 📝 Rejection reason logged for audit

**Response (Error - 400 - Missing Reason):**
```json
{
  "status": "fail",
  "message": "Rejection reason is required"
}
```

---

### 6. List Verifications

**Use When:** Viewing pending verifications queue or history

```http
GET /api/v1/payment-verification?status=pending_review&page=1&limit=20
```

**Query Parameters:**
- `status` (optional): Filter by status
  - `pending_review` - Needs staff action
  - `lookup_failed` - Needs photo upload
  - `approved` - Completed
  - `rejected` - Declined
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)

**Response (Success - 200):**
```json
{
  "status": "success",
  "data": {
    "verifications": [
      {
        "_id": "507f1f77bcf86cd799439015",
        "provider": "cbe",
        "providerReference": "FT26240JY4DT",
        "status": "pending_review",
        "parsed": {
          "amount": 250.00,
          "status": "COMPLETED",
          "payerName": "John Customer"
        },
        "amountMatch": true,
        "order": {
          "_id": "507f1f77bcf86cd799439012",
          "orderNumber": "ORD-2024-001",
          "totalAmount": 250.00
        },
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "pages": 3
    }
  }
}
```

**Example Use Cases:**

```javascript
// Get pending verifications (staff action needed)
GET /api/v1/payment-verification?status=pending_review

// Get all verifications today
GET /api/v1/payment-verification?page=1&limit=50

// Get approved verifications (history)
GET /api/v1/payment-verification?status=approved&page=1
```

---

### 7. Get Single Verification

**Use When:** Viewing verification details

```http
GET /api/v1/payment-verification/:id
```

**URL Parameters:**
- `:id` - Verification ID

**Response (Success - 200):**
```json
{
  "status": "success",
  "data": {
    "verification": {
      "_id": "507f1f77bcf86cd799439015",
      "merchant": "507f1f77bcf86cd799439011",
      "order": {
        "_id": "507f1f77bcf86cd799439012",
        "orderNumber": "ORD-2024-001",
        "totalAmount": 250.00,
        "status": "confirmed",
        "paymentStatus": "paid"
      },
      "provider": "cbe",
      "providerReference": "FT26240JY4DT",
      "verificationType": "manual_entry_auto_lookup",
      "status": "approved",
      "parsed": {
        "amount": 250.00,
        "currency": "ETB",
        "status": "COMPLETED",
        "timestamp": "2024-01-15T09:00:00Z",
        "payerName": "John Customer",
        "payerAccount": "1234567890"
      },
      "amountMatch": true,
      "parseQuality": "high",
      "verifiedBy": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "Staff Member",
        "email": "staff@restaurant.com"
      },
      "verifiedAt": "2024-01-15T10:35:00Z",
      "receiptFileRef": {
        "_id": "507f1f77bcf86cd799439016",
        "filename": "cbe-receipt-FT26240JY4DT.pdf",
        "url": "https://cdn.yourrestaurant.com/receipts/xyz.pdf",
        "mimeType": "application/pdf"
      },
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:35:00Z"
    }
  }
}
```

**Response (Error - 404):**
```json
{
  "status": "fail",
  "message": "Verification record not found"
}
```

---

### 8. Download Receipt File

**Use When:** Viewing uploaded receipt photo or auto-downloaded PDF

```http
GET /api/v1/files/:fileId/download
```

**URL Parameters:**
- `:fileId` - File ID (from `receiptFileRef` field)

**Response:**
- Direct file download (binary)
- Content-Type: `image/jpeg`, `application/pdf`, etc.
- Content-Disposition: `attachment; filename="receipt.jpg"`

**Example Usage:**

```html
<!-- In HTML -->
<a 
  href="/api/v1/files/507f1f77bcf86cd799439016/download"
  target="_blank"
  download
>
  Download Receipt
</a>

<!-- Or open in new tab -->
<button onclick="window.open('/api/v1/files/507f1f77bcf86cd799439016/download')">
  View Receipt
</button>
```

---

## User Workflows

### Workflow A: CBE Payment with QR Code (Recommended)

**Best for:** Fast, accurate verification with automatic PDF

```
1. Customer pays via CBE → Gets receipt with QR code
2. Customer shows phone to staff
3. Staff opens verification screen
4. Staff clicks "Scan QR Code"
5. Staff scans QR with camera
   ↓
   Frontend: POST /initiate-from-qr { orderId, qrPayload }
   ↓
6. Backend automatically:
   - Validates QR
   - Fetches payment data
   - Downloads PDF receipt
   - Returns verification result
7. Frontend shows parsed payment data:
   - Amount: 250 ETB ✓ Match
   - Status: COMPLETED
   - Payer: John Customer
   - PDF: [View Receipt]
8. Staff reviews and clicks "Approve"
   ↓
   Frontend: POST /:id/confirm {}
   ↓
9. Order marked as paid
10. Customer notified
11. Kitchen starts preparing
```

**API Calls:** 2 (initiate-from-qr, confirm)  
**Time:** ~10 seconds  
**Accuracy:** Very High (no manual typing)

---

### Workflow B: Telebirr Payment (Manual Entry + Photo)

**Best for:** Telebirr payments (no auto-lookup yet)

```
1. Customer pays via Telebirr → Gets receipt number
2. Customer shows receipt to staff
3. Staff opens verification screen
4. Staff selects "Telebirr" as provider
5. Staff takes photo of receipt
   ↓
   Frontend: POST /files/upload (multipart)
   ↓
6. Staff types receipt number (e.g., DB80L94QPK)
7. Staff clicks "Verify Payment"
   ↓
   Frontend: POST /initiate { orderId, provider: "telebirr", receiptNumber }
   ↓
8. Backend returns:
   - status: "lookup_failed"
   - lookupError: "Auto-lookup not enabled"
9. Staff clicks "Confirm with Photo"
   ↓
   Frontend: POST /:id/confirm { receiptFileId }
   ↓
10. Order marked as paid
11. Customer notified
12. Kitchen starts preparing
```

**API Calls:** 3 (upload, initiate, confirm)  
**Time:** ~30 seconds  
**Accuracy:** Medium (depends on photo quality + manual typing)

---

### Workflow C: CBE Payment (Manual Entry Fallback)

**Best for:** QR code damaged/unreadable

```
1. Customer pays via CBE → Gets receipt reference
2. Customer shows SMS/screen to staff
3. Staff opens verification screen
4. Staff selects "CBE" as provider
5. Staff types receipt number (e.g., FT26240JY4DT)
6. Staff clicks "Verify Payment"
   ↓
   Frontend: POST /initiate { orderId, provider: "cbe", receiptNumber }
   ↓
7. Backend automatically:
   - Fetches payment data from CBE
   - Returns parsed result
8. Frontend shows:
   - Amount: 250 ETB ✓ Match
   - Status: COMPLETED
   - Payer: John Customer
9. Staff reviews and clicks "Approve"
   ↓
   Frontend: POST /:id/confirm {}
   ↓
10. Order marked as paid
11. Customer notified
```

**API Calls:** 2 (initiate, confirm)  
**Time:** ~20 seconds  
**Accuracy:** High (auto-lookup)  
**Note:** Photo upload optional but recommended

---

## Implementation Examples

### Example 1: Complete React Component (CBE QR + Manual Entry)

```jsx
import React, { useState, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

const API_BASE = 'http://localhost:3000/api/v1';

function PaymentVerification({ order, onSuccess }) {
  const [mode, setMode] = useState('choose'); // 'choose' | 'qr' | 'manual' | 'review'
  const [provider, setProvider] = useState('cbe');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptPhoto, setReceiptPhoto] = useState(null);
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const token = localStorage.getItem('authToken');
  
  // QR Scanner setup
  useEffect(() => {
    if (mode !== 'qr') return;
    
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );
    
    scanner.render(
      async (decodedText) => {
        setLoading(true);
        try {
          // Call QR initiate endpoint
          const response = await fetch(`${API_BASE}/payment-verification/initiate-from-qr`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              orderId: order._id,
              qrPayload: decodedText,
            }),
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            throw new Error(data.message || 'QR verification failed');
          }
          
          setVerification(data.data.verification);
          setMode('review');
          scanner.clear();
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.warn('QR scan error:', error);
      }
    );
    
    return () => scanner.clear();
  }, [mode, order._id, token]);
  
  // Upload photo
  const handlePhotoUpload = async (file) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityType', 'order_payment');
      formData.append('entityId', order._id);
      formData.append('purpose', 'receipt');
      
      const response = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Upload failed');
      }
      
      setReceiptPhoto(data.data.file);
      return data.data.file._id;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };
  
  // Manual entry verification
  const handleManualVerify = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Upload photo first if Telebirr
      let photoId = receiptPhoto?._id;
      if (provider === 'telebirr' && !photoId) {
        throw new Error('Receipt photo is required for Telebirr');
      }
      
      // Initiate verification
      const response = await fetch(`${API_BASE}/payment-verification/initiate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: order._id,
          provider,
          receiptNumber,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Verification failed');
      }
      
      setVerification(data.data.verification);
      setMode('review');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Confirm verification
  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const body = {};
      
      // Include photo if required
      if (verification.verificationType === 'manual_entry_lookup_failed' && receiptPhoto) {
        body.receiptFileId = receiptPhoto._id;
      }
      
      const response = await fetch(
        `${API_BASE}/payment-verification/${verification._id}/confirm`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Confirmation failed');
      }
      
      onSuccess(data.data.verification);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Reject verification
  const handleReject = async () => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `${API_BASE}/payment-verification/${verification._id}/reject`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason }),
        }
      );
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Rejection failed');
      }
      
      alert('Payment verification rejected');
      setMode('choose');
      setVerification(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Render: Choose verification method
  if (mode === 'choose') {
    return (
      <div className="verification-container">
        <h2>Verify Payment for Order #{order.orderNumber}</h2>
        <p className="order-total">Amount Due: {order.totalAmount} ETB</p>
        
        <div className="method-buttons">
          <button 
            className="btn btn-primary"
            onClick={() => setMode('qr')}
          >
            📷 Scan CBE QR Code
          </button>
          
          <button 
            className="btn btn-secondary"
            onClick={() => setMode('manual')}
          >
            ⌨️ Enter Receipt Number Manually
          </button>
        </div>
        
        {error && <div className="alert alert-error">{error}</div>}
      </div>
    );
  }
  
  // Render: QR Scanner
  if (mode === 'qr') {
    return (
      <div className="verification-container">
        <h2>Scan CBE Receipt QR Code</h2>
        
        <div id="qr-reader" style={{ width: '100%' }}></div>
        
        <button 
          className="btn btn-secondary"
          onClick={() => setMode('choose')}
          disabled={loading}
        >
          ← Back
        </button>
        
        {loading && <div className="loading">Processing QR code...</div>}
        {error && <div className="alert alert-error">{error}</div>}
      </div>
    );
  }
  
  // Render: Manual Entry
  if (mode === 'manual') {
    return (
      <div className="verification-container">
        <h2>Manual Verification</h2>
        
        <div className="form-group">
          <label>Payment Provider:</label>
          <select 
            value={provider} 
            onChange={(e) => setProvider(e.target.value)}
            disabled={loading}
          >
            <option value="cbe">Commercial Bank of Ethiopia (CBE)</option>
            <option value="telebirr">Telebirr</option>
          </select>
        </div>
        
        <div className="form-group">
          <label>Receipt Number:</label>
          <input 
            type="text"
            value={receiptNumber}
            onChange={(e) => setReceiptNumber(e.target.value.toUpperCase())}
            placeholder={provider === 'cbe' ? 'FT26240JY4DT' : 'DB80L94QPK'}
            disabled={loading}
          />
          <small>Enter the reference number from customer's receipt</small>
        </div>
        
        {provider === 'telebirr' && (
          <div className="form-group">
            <label>Receipt Photo: <span className="required">*Required</span></label>
            <input 
              type="file"
              accept="image/*"
              onChange={(e) => {
                if (e.target.files[0]) {
                  handlePhotoUpload(e.target.files[0]);
                }
              }}
              disabled={loading}
            />
            {receiptPhoto && (
              <div className="photo-preview">
                ✓ Photo uploaded: {receiptPhoto.filename}
              </div>
            )}
          </div>
        )}
        
        {provider === 'cbe' && (
          <div className="form-group">
            <label>Receipt Photo: <span className="optional">Optional</span></label>
            <input 
              type="file"
              accept="image/*"
              onChange={(e) => {
                if (e.target.files[0]) {
                  handlePhotoUpload(e.target.files[0]);
                }
              }}
              disabled={loading}
            />
            {receiptPhoto && (
              <div className="photo-preview">
                ✓ Photo uploaded: {receiptPhoto.filename}
              </div>
            )}
            <small>Recommended for audit trail</small>
          </div>
        )}
        
        <div className="button-group">
          <button 
            className="btn btn-primary"
            onClick={handleManualVerify}
            disabled={loading || !receiptNumber || (provider === 'telebirr' && !receiptPhoto)}
          >
            {loading ? 'Verifying...' : 'Verify Payment'}
          </button>
          
          <button 
            className="btn btn-secondary"
            onClick={() => setMode('choose')}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
        
        {error && <div className="alert alert-error">{error}</div>}
      </div>
    );
  }
  
  // Render: Review & Confirm
  if (mode === 'review' && verification) {
    const isLookupFailed = verification.verificationType === 'manual_entry_lookup_failed';
    const needsPhoto = isLookupFailed && !verification.receiptFileRef && !receiptPhoto;
    
    return (
      <div className="verification-container">
        <h2>Review Payment Verification</h2>
        
        <div className="verification-details">
          <div className="detail-row">
            <span className="label">Provider:</span>
            <span className="value">{verification.provider.toUpperCase()}</span>
          </div>
          
          <div className="detail-row">
            <span className="label">Receipt Number:</span>
            <span className="value">{verification.providerReference}</span>
          </div>
          
          <div className="detail-row">
            <span className="label">Status:</span>
            <span className={`badge badge-${verification.status}`}>
              {verification.status.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          
          {verification.parsed?.amount && (
            <>
              <div className="detail-row">
                <span className="label">Payment Amount:</span>
                <span className="value">
                  {verification.parsed.amount} {verification.parsed.currency || 'ETB'}
                </span>
              </div>
              
              <div className="detail-row">
                <span className="label">Order Amount:</span>
                <span className="value">{order.totalAmount} ETB</span>
              </div>
              
              <div className="detail-row">
                <span className="label">Amount Match:</span>
                <span className={`badge ${verification.amountMatch ? 'badge-success' : 'badge-error'}`}>
                  {verification.amountMatch ? '✓ Match' : '✗ Mismatch'}
                </span>
              </div>
            </>
          )}
          
          {verification.parsed?.payerName && (
            <div className="detail-row">
              <span className="label">Payer:</span>
              <span className="value">{verification.parsed.payerName}</span>
            </div>
          )}
          
          {verification.parsed?.status && (
            <div className="detail-row">
              <span className="label">Payment Status:</span>
              <span className="value">{verification.parsed.status}</span>
            </div>
          )}
          
          {verification.lookupError && (
            <div className="alert alert-warning">
              <strong>Note:</strong> {verification.lookupError}
            </div>
          )}
          
          {verification.receiptFileRef && (
            <div className="detail-row">
              <span className="label">Receipt:</span>
              <a 
                href={`${API_BASE}/files/${verification.receiptFileRef}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-link"
              >
                📄 View Receipt
              </a>
            </div>
          )}
          
          {needsPhoto && (
            <div className="alert alert-error">
              <strong>Receipt photo required!</strong> Please upload a photo before confirming.
              <input 
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files[0]) {
                    handlePhotoUpload(e.target.files[0]);
                  }
                }}
              />
            </div>
          )}
        </div>
        
        <div className="button-group">
          <button 
            className="btn btn-success"
            onClick={handleConfirm}
            disabled={loading || needsPhoto || (verification.amountMatch === false)}
          >
            {loading ? 'Confirming...' : '✓ Approve Payment'}
          </button>
          
          <button 
            className="btn btn-danger"
            onClick={handleReject}
            disabled={loading}
          >
            ✗ Reject
          </button>
          
          <button 
            className="btn btn-secondary"
            onClick={() => {
              setMode('choose');
              setVerification(null);
            }}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
        
        {error && <div className="alert alert-error">{error}</div>}
      </div>
    );
  }
  
  return null;
}

export default PaymentVerification;
```

**Usage:**

```jsx
import PaymentVerification from './PaymentVerification';

function OrderDetails({ order }) {
  const handleVerificationSuccess = (verification) => {
    alert('Payment verified successfully!');
    // Refresh order data
    fetchOrder(order._id);
  };
  
  return (
    <div>
      <h1>Order #{order.orderNumber}</h1>
      
      {order.paymentStatus === 'pending' && (
        <PaymentVerification 
          order={order}
          onSuccess={handleVerificationSuccess}
        />
      )}
    </div>
  );
}
```

---

### Example 2: Verification Queue (List Pending)

```jsx
import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:3000/api/v1';

function VerificationQueue() {
  const [verifications, setVerifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const token = localStorage.getItem('authToken');
  
  useEffect(() => {
    fetchPendingVerifications();
  }, []);
  
  const fetchPendingVerifications = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/payment-verification?status=pending_review&limit=50`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message);
      }
      
      setVerifications(data.data.verifications);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  
  return (
    <div className="verification-queue">
      <h2>Pending Verifications ({verifications.length})</h2>
      
      {verifications.length === 0 ? (
        <p>No pending verifications</p>
      ) : (
        <table className="verification-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Provider</th>
              <th>Receipt #</th>
              <th>Amount</th>
              <th>Match</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {verifications.map((v) => (
              <tr key={v._id}>
                <td>{v.order.orderNumber}</td>
                <td>{v.provider.toUpperCase()}</td>
                <td>{v.providerReference}</td>
                <td>{v.parsed?.amount || '-'} ETB</td>
                <td>
                  <span className={`badge ${v.amountMatch ? 'badge-success' : 'badge-error'}`}>
                    {v.amountMatch ? '✓' : '✗'}
                  </span>
                </td>
                <td>{new Date(v.createdAt).toLocaleString()}</td>
                <td>
                  <button 
                    className="btn btn-sm btn-primary"
                    onClick={() => window.location.href = `/verifications/${v._id}`}
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default VerificationQueue;
```

---

## Error Handling

### Common Errors and Solutions

| Status | Error Message | Cause | Solution |
|--------|--------------|-------|----------|
| 400 | "orderId and qrPayload are required" | Missing request fields | Include all required fields |
| 400 | "Invalid QR code format" | QR is not a valid URL | Ensure QR scanner returns full URL |
| 400 | "Unrecognized payment provider" | QR from wrong source | Only scan CBE QR codes (apps.cbe.com.et) |
| 400 | "Invalid CBE receipt format" | Receipt number wrong format | CBE: 8-15 alphanumeric, Telebirr: 10-12 |
| 400 | "A receipt photo is required" | Confirming Telebirr without photo | Upload photo before confirming |
| 401 | "You are not logged in" | Missing/invalid token | Re-authenticate |
| 404 | "Order not found" | Invalid order ID | Verify order exists |
| 409 | "Receipt already used" | Duplicate verification | This receipt was already processed |
| 502 | "Failed to download PDF" | CBE server error | Try manual entry or retry later |

### Error Handling Pattern

```javascript
async function apiCall(url, options) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
      // Server returned error
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    
    return data;
  } catch (error) {
    if (error.message.includes('Failed to fetch')) {
      // Network error
      throw new Error('Network error. Please check your connection.');
    }
    
    if (error.message.includes('401')) {
      // Auth error
      localStorage.removeItem('authToken');
      window.location.href = '/login';
      throw new Error('Session expired. Please login again.');
    }
    
    // Re-throw other errors
    throw error;
  }
}
```

---

## TypeScript Definitions

```typescript
// types.ts

export type PaymentProvider = 'telebirr' | 'cbe';

export type VerificationStatus = 
  | 'pending_review'
  | 'lookup_failed'
  | 'approved'
  | 'rejected';

export type VerificationType = 
  | 'manual_entry_auto_lookup'
  | 'manual_entry_lookup_failed';

export type ParseQuality = 'high' | 'low' | 'failed';

export interface ParsedPaymentData {
  amount?: number;
  currency?: string;
  status?: 'COMPLETED' | 'FAILED' | 'PENDING';
  timestamp?: string;
  payerName?: string;
  payerAccount?: string;
  fullRawText?: string;
}

export interface FileAsset {
  _id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  entityType: string;
  entityId: string;
  purpose: string;
  uploadedAt: string;
}

export interface PaymentVerification {
  _id: string;
  merchant: string;
  order: {
    _id: string;
    orderNumber: string;
    totalAmount: number;
    status: string;
    paymentStatus: string;
  };
  provider: PaymentProvider;
  providerReference: string;
  verificationType: VerificationType;
  status: VerificationStatus;
  parsed: ParsedPaymentData;
  amountMatch: boolean;
  accountMatch?: boolean | null;
  parseQuality: ParseQuality;
  receiptFileRef?: FileAsset | string;
  lookupError?: string | null;
  rejectionReason?: string | null;
  verifiedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  status: 'success' | 'fail' | 'error';
  data?: T;
  message?: string;
  errors?: any[];
}

export interface PaginatedResponse<T> {
  verifications: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// API Functions

export async function uploadReceiptPhoto(
  file: File,
  orderId: string,
  token: string
): Promise<FileAsset> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('entityType', 'order_payment');
  formData.append('entityId', orderId);
  formData.append('purpose', 'receipt');
  
  const response = await fetch('/api/v1/files/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  
  const data: ApiResponse<{ file: FileAsset }> = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || 'Upload failed');
  }
  
  return data.data!.file;
}

export async function initiateFromQR(
  orderId: string,
  qrPayload: string,
  token: string
): Promise<PaymentVerification> {
  const response = await fetch('/api/v1/payment-verification/initiate-from-qr', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ orderId, qrPayload }),
  });
  
  const data: ApiResponse<{ verification: PaymentVerification }> = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || 'QR verification failed');
  }
  
  return data.data!.verification;
}

export async function initiateManual(
  orderId: string,
  provider: PaymentProvider,
  receiptNumber: string,
  token: string
): Promise<PaymentVerification> {
  const response = await fetch('/api/v1/payment-verification/initiate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ orderId, provider, receiptNumber }),
  });
  
  const data: ApiResponse<{ verification: PaymentVerification }> = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || 'Verification failed');
  }
  
  return data.data!.verification;
}

export async function confirmVerification(
  verificationId: string,
  receiptFileId: string | undefined,
  token: string
): Promise<PaymentVerification> {
  const response = await fetch(
    `/api/v1/payment-verification/${verificationId}/confirm`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(receiptFileId ? { receiptFileId } : {}),
    }
  );
  
  const data: ApiResponse<{ verification: PaymentVerification }> = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || 'Confirmation failed');
  }
  
  return data.data!.verification;
}

export async function rejectVerification(
  verificationId: string,
  reason: string,
  token: string
): Promise<PaymentVerification> {
  const response = await fetch(
    `/api/v1/payment-verification/${verificationId}/reject`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    }
  );
  
  const data: ApiResponse<{ verification: PaymentVerification }> = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || 'Rejection failed');
  }
  
  return data.data!.verification;
}

export async function listVerifications(
  status: VerificationStatus | undefined,
  page: number,
  limit: number,
  token: string
): Promise<PaginatedResponse<PaymentVerification>> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(status && { status }),
  });
  
  const response = await fetch(
    `/api/v1/payment-verification?${params}`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
    }
  );
  
  const data: ApiResponse<PaginatedResponse<PaymentVerification>> = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || 'Failed to fetch verifications');
  }
  
  return data.data!;
}

export async function getVerification(
  verificationId: string,
  token: string
): Promise<PaymentVerification> {
  const response = await fetch(
    `/api/v1/payment-verification/${verificationId}`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
    }
  );
  
  const data: ApiResponse<{ verification: PaymentVerification }> = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || 'Failed to fetch verification');
  }
  
  return data.data!.verification;
}
```

---

## Testing Guide

### Manual Testing Checklist

#### CBE QR Code Flow
- [ ] Scan valid CBE QR code
- [ ] Verify payment data auto-populated
- [ ] Check PDF receipt auto-downloaded
- [ ] Confirm amount matches order
- [ ] Approve verification
- [ ] Verify order marked as paid

#### Manual Entry Flow (Telebirr)
- [ ] Upload receipt photo
- [ ] Enter receipt number
- [ ] Initiate verification
- [ ] See "lookup_failed" status
- [ ] Confirm with photo
- [ ] Verify order marked as paid

#### Manual Entry Flow (CBE)
- [ ] Enter CBE receipt number
- [ ] Verify auto-lookup succeeds
- [ ] Review parsed data
- [ ] Approve without photo
- [ ] Verify order marked as paid

#### Error Scenarios
- [ ] Try duplicate receipt → See 409 error
- [ ] Try invalid QR (wrong host) → See 400 error
- [ ] Try confirming Telebirr without photo → See 400 error
- [ ] Try with invalid receipt format → See 400 error

#### Edge Cases
- [ ] Amount mismatch → Cannot approve
- [ ] Network timeout → Graceful error
- [ ] Camera permission denied → Fallback to manual
- [ ] Expired token → Redirect to login

---

## Summary

### Key Endpoints

1. **POST /api/v1/payment-verification/initiate-from-qr** - QR scan (CBE)
2. **POST /api/v1/payment-verification/initiate** - Manual entry
3. **POST /api/v1/payment-verification/:id/confirm** - Approve
4. **POST /api/v1/payment-verification/:id/reject** - Reject
5. **GET /api/v1/payment-verification** - List verifications
6. **GET /api/v1/payment-verification/:id** - Get details
7. **POST /api/v1/files/upload** - Upload receipt photo
8. **GET /api/v1/files/:id/download** - Download receipt

### Recommended Flow

**For CBE:**
1. Scan QR → initiate-from-qr → confirm (2 API calls)

**For Telebirr:**
1. Upload photo → initiate → confirm (3 API calls)

### Need Help?

- **Backend Issues:** Check server logs at `/var/log/restaurant-api.log`
- **Frontend Issues:** Check browser console for errors
- **API Questions:** See `/api/v1/docs` (if Swagger enabled)
- **Support:** Contact backend team with verification ID

---

**Document Version:** 2.0  
**Last Updated:** January 2025  
**Status:** ✅ Complete and ready for implementation
