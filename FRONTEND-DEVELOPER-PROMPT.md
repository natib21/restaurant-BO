# Payment Verification Frontend Implementation Task

## 📋 Overview

Implement Ethiopian mobile payment verification system for the restaurant staff app. The system supports three payment providers with both QR scanning and manual entry methods.

---

## 🎯 What You Need to Build

### Three Payment Verification Flows:

1. **CBE Birr (Mobile Wallet) - QR Scan** ⭐ Recommended
   - Scan QR code from customer's CBE Birr receipt
   - Automatic data extraction and PDF download
   - Fastest method (2 API calls, ~10 seconds)

2. **Telebirr - Manual Entry**
   - Staff types receipt number
   - Photo upload required
   - 3 API calls, ~30 seconds

3. **CBE Bank - Manual Entry**
   - Staff types receipt number
   - Photo upload optional
   - 2 API calls, ~20 seconds

---

## 📚 Available Documentation

All technical details are in: **`FRONTEND-INTEGRATION-GUIDE.md`**

This document contains:
- ✅ Complete API endpoint documentation
- ✅ Request/response examples for all endpoints
- ✅ Error handling patterns
- ✅ TypeScript type definitions
- ✅ React and Vue code examples
- ✅ Complete workflow examples

---

## 🚀 Step-by-Step Implementation Guide

### Step 1: Install Required Dependencies

```bash
# For QR code scanning
npm install html5-qrcode

# For TypeScript (optional but recommended)
npm install --save-dev @types/html5-qrcode
```

### Step 2: Set Up API Configuration

Create an API service file:

```typescript
// services/payment-verification.ts

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1';

export enum PaymentProvider {
  TELEBIRR = 'telebirr',
  CBE = 'cbe',
  CBEBIRR = 'cbebirr'
}

export class PaymentVerificationAPI {
  private token: string;
  
  constructor(authToken: string) {
    this.token = authToken;
  }
  
  // Upload receipt photo
  async uploadReceipt(file: File, orderId?: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', 'order_payment');
    // Only include entityId if it's a valid ObjectId (24-char hex string)
    if (orderId && /^[0-9a-fA-F]{24}$/.test(orderId)) {
      formData.append('entityId', orderId);
    }
    // If orderId is invalid (e.g., "manual-order"), omit it - backend will set to null
    formData.append('purpose', 'receipt');
    
    const response = await fetch(`${API_BASE_URL}/files/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Upload failed');
    }
    
    const data = await response.json();
    return data.data.file._id;
  }
  
  // QR-based verification (CBE Birr)
  async initiateFromQR(orderId: string, qrPayload: string) {
    const response = await fetch(`${API_BASE_URL}/payment-verification/initiate-from-qr`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ orderId, qrPayload })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'QR verification failed');
    }
    
    const data = await response.json();
    return data.data.verification;
  }
  
  // Manual entry verification
  async initiate(orderId: string, provider: PaymentProvider, receiptNumber: string) {
    const response = await fetch(`${API_BASE_URL}/payment-verification/initiate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ orderId, provider, receiptNumber })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Verification failed');
    }
    
    const data = await response.json();
    return data.data.verification;
  }
  
  // Confirm verification
  async confirm(verificationId: string, receiptFileId?: string) {
    const response = await fetch(
      `${API_BASE_URL}/payment-verification/${verificationId}/confirm`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(receiptFileId ? { receiptFileId } : {})
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Confirmation failed');
    }
    
    const data = await response.json();
    return data.data.verification;
  }
  
  // Reject verification
  async reject(verificationId: string, reason: string) {
    const response = await fetch(
      `${API_BASE_URL}/payment-verification/${verificationId}/reject`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Rejection failed');
    }
    
    const data = await response.json();
    return data.data.verification;
  }
}
```

### Step 3: Create QR Scanner Component

```tsx
// components/QRScanner.tsx

import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface QRScannerProps {
  onScanSuccess: (qrData: string) => void;
  onCancel: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onCancel }) => {
  const [error, setError] = useState('');
  
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      },
      false
    );
    
    scanner.render(
      (decodedText) => {
        scanner.clear();
        onScanSuccess(decodedText);
      },
      (errorMessage) => {
        // Scanning error - not critical
        console.warn('QR scan error:', errorMessage);
      }
    );
    
    return () => {
      scanner.clear().catch(console.error);
    };
  }, [onScanSuccess]);
  
  return (
    <div className="qr-scanner">
      <h3>Scan Receipt QR Code</h3>
      <div id="qr-reader" style={{ width: '100%' }}></div>
      {error && <div className="error">{error}</div>}
      <button onClick={onCancel} className="btn-secondary">
        Cancel
      </button>
    </div>
  );
};
```

### Step 4: Create Main Payment Verification Component

```tsx
// components/PaymentVerification.tsx

import React, { useState } from 'react';
import { QRScanner } from './QRScanner';
import { PaymentVerificationAPI, PaymentProvider } from '../services/payment-verification';

interface Props {
  orderId: string;
  orderAmount: number;
  authToken: string;
  onSuccess: () => void;
}

export const PaymentVerification: React.FC<Props> = ({ 
  orderId, 
  orderAmount, 
  authToken, 
  onSuccess 
}) => {
  const [mode, setMode] = useState<'choose' | 'qr' | 'manual' | 'review'>('choose');
  const [provider, setProvider] = useState<PaymentProvider>(PaymentProvider.CBEBIRR);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptPhoto, setReceiptPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [verification, setVerification] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const api = new PaymentVerificationAPI(authToken);
  
  // Handle photo upload
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    
    setReceiptPhoto(file);
    setError('');
    
    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPhotoPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };
  
  // Handle QR scan
  const handleQRScan = async (qrData: string) => {
    setLoading(true);
    setError('');
    
    try {
      const result = await api.initiateFromQR(orderId, qrData);
      setVerification(result);
      setMode('review');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle manual verification
  const handleManualSubmit = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Upload photo if provided
      let photoId: string | undefined;
      if (receiptPhoto) {
        // Pass orderId only if it's valid (24-char hex), otherwise undefined
        const validOrderId = /^[0-9a-fA-F]{24}$/.test(orderId) ? orderId : undefined;
        photoId = await api.uploadReceipt(receiptPhoto, validOrderId);
      }
      
      // Telebirr requires photo
      if (provider === PaymentProvider.TELEBIRR && !photoId) {
        setError('Receipt photo is required for Telebirr');
        return;
      }
      
      // Initiate verification
      const result = await api.initiate(orderId, provider, receiptNumber.trim().toUpperCase());
      setVerification(result);
      
      // Store photo ID for confirmation
      if (photoId) {
        (result as any)._uploadedPhotoId = photoId;
      }
      
      setMode('review');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle confirmation
  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    
    try {
      const photoId = (verification as any)._uploadedPhotoId;
      await api.confirm(verification._id, photoId);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle rejection
  const handleReject = async () => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;
    
    setLoading(true);
    setError('');
    
    try {
      await api.reject(verification._id, reason);
      alert('Payment verification rejected');
      setMode('choose');
      setVerification(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Render: Choose method
  if (mode === 'choose') {
    return (
      <div className="payment-verification">
        <h2>Verify Payment</h2>
        <p>Order Amount: {orderAmount} ETB</p>
        
        <div className="method-buttons">
          <button 
            className="btn-primary"
            onClick={() => setMode('qr')}
          >
            📷 Scan CBE Birr QR Code
          </button>
          
          <button 
            className="btn-secondary"
            onClick={() => setMode('manual')}
          >
            ⌨️ Enter Receipt Number
          </button>
        </div>
        
        {error && <div className="alert-error">{error}</div>}
      </div>
    );
  }
  
  // Render: QR Scanner
  if (mode === 'qr') {
    return (
      <QRScanner 
        onScanSuccess={handleQRScan}
        onCancel={() => setMode('choose')}
      />
    );
  }
  
  // Render: Manual Entry
  if (mode === 'manual') {
    return (
      <div className="payment-verification">
        <h2>Manual Verification</h2>
        
        <div className="form-group">
          <label>Provider:</label>
          <select 
            value={provider} 
            onChange={(e) => setProvider(e.target.value as PaymentProvider)}
          >
            <option value={PaymentProvider.CBEBIRR}>CBE Birr (Mobile Wallet)</option>
            <option value={PaymentProvider.TELEBIRR}>Telebirr</option>
            <option value={PaymentProvider.CBE}>CBE Bank</option>
          </select>
        </div>
        
        <div className="form-group">
          <label>Receipt Number:</label>
          <input 
            type="text"
            value={receiptNumber}
            onChange={(e) => setReceiptNumber(e.target.value)}
            placeholder={provider === PaymentProvider.TELEBIRR ? 'DB80L94QPK' : 'FT26240JY4DT'}
          />
        </div>
        
        <div className="form-group">
          <label>
            Receipt Photo: 
            {provider === PaymentProvider.TELEBIRR && <span className="required">*Required</span>}
          </label>
          <input 
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoChange}
          />
          {photoPreview && <img src={photoPreview} alt="Preview" className="preview" />}
        </div>
        
        <div className="button-group">
          <button 
            onClick={handleManualSubmit}
            disabled={loading || !receiptNumber || (provider === PaymentProvider.TELEBIRR && !receiptPhoto)}
            className="btn-primary"
          >
            {loading ? 'Verifying...' : 'Verify Payment'}
          </button>
          
          <button onClick={() => setMode('choose')} className="btn-secondary">
            Cancel
          </button>
        </div>
        
        {error && <div className="alert-error">{error}</div>}
      </div>
    );
  }
  
  // Render: Review & Confirm
  if (mode === 'review' && verification) {
    return (
      <div className="payment-verification">
        <h2>Review Verification</h2>
        
        <div className="details">
          <div className="row">
            <strong>Provider:</strong> {verification.provider.toUpperCase()}
          </div>
          <div className="row">
            <strong>Receipt:</strong> {verification.providerReference}
          </div>
          
          {verification.parsed?.amount && (
            <>
              <div className="row">
                <strong>Payment Amount:</strong> {verification.parsed.amount} ETB
              </div>
              <div className="row">
                <strong>Order Amount:</strong> {orderAmount} ETB
              </div>
              <div className="row">
                <strong>Match:</strong> 
                <span className={verification.amountMatch ? 'success' : 'error'}>
                  {verification.amountMatch ? '✓ Match' : '✗ Mismatch'}
                </span>
              </div>
            </>
          )}
          
          {verification.parsed?.payerName && (
            <div className="row">
              <strong>Payer:</strong> {verification.parsed.payerName}
            </div>
          )}
          
          {verification.receiptFileRef && (
            <div className="row">
              <a 
                href={`/api/v1/files/${verification.receiptFileRef}/download`}
                target="_blank"
                rel="noopener noreferrer"
              >
                📄 View Receipt
              </a>
            </div>
          )}
        </div>
        
        <div className="button-group">
          <button 
            onClick={handleConfirm}
            disabled={loading}
            className="btn-success"
          >
            ✓ Approve Payment
          </button>
          
          <button 
            onClick={handleReject}
            disabled={loading}
            className="btn-danger"
          >
            ✗ Reject
          </button>
        </div>
        
        {error && <div className="alert-error">{error}</div>}
      </div>
    );
  }
  
  return null;
};
```

### Step 5: Usage Example

```tsx
// In your order details page

import { PaymentVerification } from './components/PaymentVerification';

function OrderDetails({ order }) {
  const authToken = localStorage.getItem('authToken');
  
  const handleVerificationSuccess = () => {
    alert('Payment verified successfully!');
    // Refresh order data
    fetchOrder(order._id);
  };
  
  return (
    <div>
      <h1>Order #{order.orderNumber}</h1>
      
      {order.paymentStatus === 'unpaid' && (
        <PaymentVerification 
          orderId={order._id}
          orderAmount={order.totalAmount}
          authToken={authToken}
          onSuccess={handleVerificationSuccess}
        />
      )}
    </div>
  );
}
```

---

## ✅ Testing Checklist

### Before Submitting Your Implementation:

#### QR Code Flow (CBE Birr)
- [ ] QR scanner opens camera successfully
- [ ] Scanning CBE Birr QR code sends data to backend
- [ ] Payment data displays correctly (amount, status, payer)
- [ ] Amount match indicator shows correctly
- [ ] PDF receipt link works (if available)
- [ ] Confirm button marks order as paid
- [ ] Reject button works with reason

#### Manual Entry Flow (Telebirr)
- [ ] Provider dropdown shows all 3 providers
- [ ] Photo upload works with preview
- [ ] File size validation works (8MB limit)
- [ ] File type validation works (images only)
- [ ] Receipt number input validates format
- [ ] Cannot submit Telebirr without photo
- [ ] Verification data displays correctly
- [ ] Confirm with photo works
- [ ] Order marked as paid after confirmation

#### Manual Entry Flow (CBE/CBE Birr)
- [ ] Photo upload is optional
- [ ] Receipt number validation works
- [ ] Auto-lookup returns parsed data
- [ ] Confirm without photo works (if auto-lookup succeeded)

#### Error Handling
- [ ] Network errors show user-friendly messages
- [ ] Duplicate receipt error handled
- [ ] Invalid receipt format error shown
- [ ] Already paid order prevents verification
- [ ] Loading states show during API calls
- [ ] Errors don't crash the app

---

## 🎨 Styling Guidelines

### Provider Colors
```css
.provider-telebirr { background: #FF6B35; }
.provider-cbe { background: #004E89; }
.provider-cbebirr { background: #00A896; }
```

### Status Indicators
```css
.status-pending { color: #FFA500; }
.status-verified { color: #28A745; }
.status-rejected { color: #DC3545; }
.amount-match { color: #28A745; }
.amount-mismatch { color: #DC3545; }
```

---

## 📱 Mobile Considerations

### Camera Permissions
```javascript
// Request camera permission
if ('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices) {
  // Camera API available
} else {
  alert('Camera not available on this device');
}
```

### Responsive Design
- QR scanner should be full-width on mobile
- Buttons should be large enough for touch (min 44px)
- Form inputs should have proper mobile keyboard types
- Photo preview should be scrollable

---

## 🔐 Security Notes

### Never Do This:
```javascript
// ❌ DON'T store raw QR URLs
localStorage.setItem('qrUrl', qrData);

// ❌ DON'T fetch CBE directly from frontend
fetch(qrData); // NEVER!
```

### Always Do This:
```javascript
// ✅ Send to YOUR backend
api.initiateFromQR(orderId, qrData);

// ✅ Store only verification IDs
localStorage.setItem('lastVerificationId', verification._id);
```

---

## 📊 Success Metrics

Track these metrics:
- **QR scan success rate** (should be >95%)
- **Average verification time** (QR: <10s, Manual: <30s)
- **Error rate** (should be <5%)
- **User workflow completion rate**

---

## 🆘 Need Help?

### Documentation References:
1. **Full API docs:** `FRONTEND-INTEGRATION-GUIDE.md`
2. **Backend implementation:** `CBE-BIRR-IMPLEMENTATION-SUMMARY.md`
3. **QR verification guide:** `CBE-QR-VERIFICATION-GUIDE.md`

### Common Issues:

**QR scanner not working:**
- Check camera permissions
- Use HTTPS (required for camera access)
- Test with different QR code library if needed

**Photo upload failing:**
- Check file size (<8MB)
- Verify Content-Type header not set for multipart
- Test with different image formats

**API errors:**
- Verify auth token is valid
- Check API base URL is correct
- Ensure server is running and accessible

---

## 🚀 Ready to Start?

1. Read `FRONTEND-INTEGRATION-GUIDE.md` for complete API details
2. Install dependencies (`html5-qrcode`)
3. Copy the code examples above
4. Implement the components
5. Test all three verification flows
6. Submit for code review

**Estimated Time:** 4-6 hours for complete implementation

Good luck! 🎉
