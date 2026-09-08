# QR Session Quick Start Guide

**For Customer-Facing QR Ordering Frontend**

---

## QR Code Structure

Your QR code contains (base64-encoded):
```json
{
  "m": "merchantId",
  "b": "branchId",
  "t": "tableId"
}
```

Plus a signature for security.

---

## Step 1: Start Session

### Request
```http
POST /api/v1/sessions/start?data=eyJt...&s=4092fe5d...
```

**Query Parameters:**
- `data`: Base64URL-encoded JSON `{"m":"...","b":"...","t":"..."}`
- `s`: HMAC-SHA256 signature (hex)

### Response ✅
```json
{
  "status": "success",
  "data": {
    "sessionToken": "abc123def456...",
    "table": "6a9535346c844d03b3400036",
    "tableNumber": "T-01",
    "branchId": "6a9532e46c844d03b33ff55e",  ← ✅ YES, branchId IS included
    "merchantId": "6a9532e46c844d03b33ff55b",
    "message": "Welcome!"
  }
}
```

---

## Step 2: Get Menu

### Request
```http
GET /api/v1/menu/public
Cookie: sessionToken=abc123def456...
```

### Response
```json
{
  "status": "success",
  "data": {
    "restaurant": "My Restaurant",
    "generatedAt": "2026-08-31T08:57:12.995Z",
    "totalItems": 13,
    "tableNumber": "T-01",
    "menus": [
      {
        "id": "6a9533328bc68bc64ec6b679",
        "name": "Grilled Chicken Breast",
        "description": "...",
        "image": "http://localhost:8000/api/v1/files/.../content",
        "price": 245,
        "variants": [...],
        "type": "food",
        "isVeg": false,
        "isSpicy": false,
        "isAlcoholic": false,
        "prepTime": "15-25 min",
        "ingredients": [...],
        "allergens": ["dairy"],
        "rating": 4.5,
        "displayedIn": "Lunch Specials"
      }
    ],
    "specialOffers": [...]
  }
}
```

---

## Step 3: Place Order

### Request
```http
POST /api/v1/orders/place
Cookie: sessionToken=abc123def456...
Content-Type: application/json

{
  "items": [
    {
      "menuItem": "6a9533328bc68bc64ec6b679",
      "quantity": 2,
      "notes": "No onions"
    }
  ],
  "orderType": "dine_in",
  "customerName": "John Doe",
  "customerPhone": "+251912345678"
}
```

### Response
```json
{
  "status": "success",
  "data": {
    "order": {
      "orderNumber": "#T01-123",
      "status": "pending",
      "totalAmount": 490,
      ...
    }
  }
}
```

---

## What You Get From Session

| Field | Type | Use For |
|-------|------|---------|
| **sessionToken** | string | Authentication (Cookie or Header) |
| **table** | ObjectId | Table reference (internal) |
| **tableNumber** | string | Display to user ("You're at Table T-01") |
| **branchId** | ObjectId | ✅ Branch context (for analytics, routing) |
| **merchantId** | ObjectId | Restaurant context |
| **message** | string | Welcome message |

---

## Why You Need branchId

1. **Analytics:**
   - Track orders by branch
   - Branch-specific performance metrics

2. **Multi-Branch Support:**
   - Restaurant chains with multiple locations
   - Branch-specific menus
   - Branch-specific promotions

3. **Routing:**
   - Send orders to correct kitchen
   - Staff notifications to correct branch

4. **Reporting:**
   - Branch sales reports
   - Inventory by branch
   - Staff performance by branch

---

## Frontend Implementation

```javascript
// Parse QR code (your QR scanner library)
const qrData = {
  data: "eyJtIjoiNmE5NTMyZTQ2Yzg0...",
  s: "4092fe5d56b7a53b38852dd..."
};

// 1. Start session
const sessionResponse = await fetch(
  `/api/v1/sessions/start?data=${qrData.data}&s=${qrData.s}`,
  { method: 'POST' }
);

const { sessionToken, tableNumber, branchId, merchantId } = 
  (await sessionResponse.json()).data;

// 2. Save for later
localStorage.setItem('sessionToken', sessionToken);
localStorage.setItem('tableNumber', tableNumber);
localStorage.setItem('branchId', branchId);  // ✅
localStorage.setItem('merchantId', merchantId);

// 3. Get menu
const menuResponse = await fetch('/api/v1/menu/public', {
  headers: {
    'Cookie': `sessionToken=${sessionToken}`
  }
});

const { menus, specialOffers } = (await menuResponse.json()).data;

// 4. Display menu
console.log(`Welcome to Table ${tableNumber}`);
console.log(`Branch: ${branchId}`);  // For internal tracking
menus.forEach(item => {
  console.log(`${item.name} - ETB ${item.price}`);
});
```

---

## Testing with Postman/cURL

### Start Session
```bash
curl -X POST "http://localhost:8000/api/v1/sessions/start?data=eyJtIjoiNmE5NTMyZTQ2Yzg0NGQwM2IzM2ZmNTViIiwiYiI6IjZhOTUzMmU0NmM4NDRkMDNiMzNmZjU1ZSIsInQiOiI2YTk1MzUzNDZjODQ0ZDAzYjM0MDAwMzYifQ&s=4092fe5d56b7a53b38852d2dd12900ac5d49a2cff28e29aeb69687ee05baa55e11:24"
```

### Get Menu (with session token from response)
```bash
curl -X GET "http://localhost:8000/api/v1/menu/public" \
  -H "Cookie: sessionToken=<YOUR_TOKEN>"
```

---

## Security Notes

1. **QR Signature:**
   - Each QR has HMAC-SHA256 signature
   - Prevents fake QR codes
   - Uses branch secret key

2. **Session Token:**
   - 32-byte random hex
   - Expires after 4 hours
   - Tied to specific table

3. **Table Status:**
   - Automatically marked as "occupied"
   - Prevents double-scanning
   - Staff can manually free table

---

## Common Errors

| Error | Code | Reason | Fix |
|-------|------|--------|-----|
| "Invalid QR code" | 400 | Missing data or signature | Check QR format |
| "Corrupted QR code" | 400 | Invalid base64 | Regenerate QR |
| "QR missing data" | 400 | Missing m/b/t fields | Include all fields |
| "Fake QR code" | 403 | Signature mismatch | Use correct secret key |
| "Table not found" | 404 | Invalid table ID | Check table exists |
| "Table is in use" | 409 | Already occupied | Wait or ask staff |
| "Branch QR secret key missing" | 404 | No secret configured | Contact admin |

---

## Summary

✅ **branchId IS included in session response**
✅ **You get: sessionToken, table, tableNumber, branchId, merchantId**
✅ **Use sessionToken for all subsequent requests**
✅ **Display tableNumber to customer**
✅ **Use branchId for analytics and routing**

