# 🚀 QR Customer Flow - Quick API Reference

## 📍 Base URL
```
http://localhost:8000
```

---

## 1️⃣ **Initialize Session (QR Scan)**

```http
POST /api/v1/sessions/start?data={encoded}&s={signature}
```

**Auth:** None (public)

**Response:**
```json
{
  "sessionToken": "eyJhbGc...",
  "sessionId": "6a95476015b8780e437fa864",
  "tableId": "6a9535346c844d03b3400036",
  "tableNumber": "T-101",
  "merchantId": "6a9532e46c844d03b33ff55b",
  "branchId": "6a9532e46c844d03b33ff55e",
  "merchantName": "Golden Fork Restaurant",
  "branchName": "Downtown Branch"
}
```

**Store:** `sessionToken` for subsequent requests

---

## 2️⃣ **Get Public Menu**

```http
GET /api/v1/menus/public
Authorization: Bearer {sessionToken}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "menuGroups": [
      {
        "_id": "...",
        "name": "Main Course",
        "items": [
          {
            "_id": "6a9536846c844d03b340008b",
            "name": "Grilled Chicken",
            "price": 250,
            "imageUrl": "http://localhost:8000/uploads/menu/grilled-chicken.jpg",
            "imagePath": "/uploads/menu/grilled-chicken.jpg",
            "description": "...",
            "isAvailable": true,
            "ingredients": [...],
            "allergens": ["gluten"],
            "options": [
              {
                "optionGroupName": "Size",
                "required": true,
                "choices": [
                  {
                    "choiceName": "Regular",
                    "priceModifier": 0
                  },
                  {
                    "choiceName": "Large",
                    "priceModifier": 50
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

**Alternative Endpoints:**
- `GET /api/v1/menus/public/food` - Food only
- `GET /api/v1/menus/public/beverages` - Drinks only
- `GET /api/v1/menus/public/combos` - Combo deals

---

## 3️⃣ **Place Order**

```http
POST /api/v1/orders
Authorization: Bearer {sessionToken}
Content-Type: application/json
```

**Request Body:**
```json
{
  "items": [
    {
      "menuItem": "6a9536846c844d03b340008b",
      "name": "Grilled Chicken",
      "quantity": 2,
      "price": 250,
      "selectedOptions": [
        {
          "optionGroupName": "Size",
          "choiceName": "Large",
          "priceModifier": 50
        }
      ],
      "specialInstructions": "Well done, no pepper"
    }
  ],
  "orderType": "dine-in",
  "customerName": "John Doe",
  "customerPhone": "+251912345678",
  "notes": "Serve appetizers first"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "order": {
      "_id": "6a95476015b8780e437fa865",
      "orderNumber": "ORD-20260822-0042",
      "status": "pending",
      "paymentStatus": "unpaid",
      "items": [...],
      "subtotal": 665,
      "tax": 99.75,
      "total": 764.75,
      "estimatedReadyTime": "2026-08-22T14:50:00.000Z"
    }
  }
}
```

---

## 4️⃣ **Track Order Status**

```http
GET /api/v1/orders/{orderId}
Authorization: Bearer {sessionToken}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "order": {
      "_id": "6a95476015b8780e437fa865",
      "orderNumber": "ORD-20260822-0042",
      "status": "preparing",
      "paymentStatus": "unpaid",
      "items": [
        {
          "name": "Grilled Chicken",
          "itemStatus": "preparing",
          "estimatedReadyTime": "..."
        }
      ],
      "total": 764.75
    }
  }
}
```

**Status Values:**
- `pending` → `accepted` → `preparing` → `ready` → `served` → `completed`

---

## 5️⃣ **Create Customer Account (Optional)**

```http
POST /api/v1/customers/login
Authorization: Bearer {sessionToken}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "John Doe",
  "phone": "+251912345678",
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "customer": {
      "_id": "6a95476015b8780e437fa866",
      "name": "John Doe",
      "phone": "+251912345678",
      "loyalty": {
        "points": 0,
        "tier": "bronze"
      }
    },
    "isNewCustomer": true
  }
}
```

---

## 6️⃣ **Connect Telegram (Optional)**

**Telegram Bot URL:**
```
https://t.me/YourRestaurantBot?start={merchantId}_{customerId}
```

**Example:**
```
https://t.me/GoldenForkBot?start=6a9532e46c844d03b33ff55b_6a95476015b8780e437fa866
```

Customer clicks link → Opens Telegram → Starts bot → Automatic connection

**Check Status:**
```http
GET /api/v1/customers/me
Authorization: Bearer {sessionToken}
```

**Response includes telegram status:**
```json
{
  "customer": {
    "telegram": {
      "username": "johndoe",
      "optIn": true,
      "connectedAt": "2026-08-22T14:35:00.000Z"
    }
  }
}
```

---

## 7️⃣ **View Order History**

```http
GET /api/v1/customers/my-orders?page=1&limit=10
Authorization: Bearer {sessionToken}
```

**Response:**
```json
{
  "status": "success",
  "results": 5,
  "total": 23,
  "data": {
    "orders": [
      {
        "_id": "...",
        "orderNumber": "ORD-20260822-0042",
        "status": "completed",
        "total": 764.75,
        "items": [...],
        "createdAt": "2026-08-22T14:30:00.000Z"
      }
    ]
  }
}
```

---

## 8️⃣ **Submit Feedback**

```http
POST /api/v1/feedback
Authorization: Bearer {sessionToken}
Content-Type: application/json
```

**Request Body:**
```json
{
  "rating": 5,
  "comment": "Amazing food and excellent service!",
  "categories": ["food_quality", "service"],
  "channel": "qr_table",
  "order": "6a95476015b8780e437fa865",
  "isPublic": true
}
```

**Categories:**
- `food_quality`, `service`, `cleanliness`, `ambiance`
- `delivery_time`, `value_for_money`, `other`

**Response:**
```json
{
  "status": "success",
  "data": {
    "feedback": {
      "_id": "...",
      "rating": 5,
      "status": "pending",
      "createdAt": "..."
    }
  }
}
```

---

## 🔑 Key Points

### **Authentication**
- Step 1 (Start Session): **No auth required** - QR signature validates request
- Steps 2-4 (Menu/Orders): **Session token required** - Pass in Authorization header

### **Session Token Format**
```javascript
headers: {
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
}
```

### **QR URL Structure**
```
http://localhost:5173/qr?data=<base64_json>&s=<hmac_signature>

Decoded data: {
  "m": "merchantId",
  "b": "branchId", 
  "t": "tableId"
}
```

### **Image URLs**
Menu items return:
- `imageUrl`: Full URL → `http://localhost:8000/uploads/menu/item.jpg`
- `imagePath`: Relative path → `/uploads/menu/item.jpg`

Use `imageUrl` for direct display in `<img>` tags.

### **Order Types**
For QR menu orders, always use: `"orderType": "dine-in"`

### **Price Calculation**
```
Item Total = (unitPrice + sum(priceModifiers)) × quantity
Order Subtotal = sum(all item totals)
Tax = subtotal × tax_rate
Order Total = subtotal + tax
```

---

## 🚨 Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid QR signature` | QR tampered/expired | Regenerate QR code |
| `Session expired` | Timeout (2 hours) | Scan QR again |
| `Table already occupied` | Active session exists | Staff frees table |
| `Item unavailable` | Out of stock / disabled | Choose different item |
| `Unauthorized` | Missing/invalid token | Check Authorization header |

---

## 📱 Frontend Code Examples

### Initialize Session
```javascript
const response = await fetch(
  `${API_BASE}/api/v1/sessions/start?data=${qrData}&s=${signature}`,
  { method: 'POST' }
);
const { data } = await response.json();
localStorage.setItem('sessionToken', data.sessionToken);
```

### Fetch Menu
```javascript
const response = await fetch(`${API_BASE}/api/v1/menus/public`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await response.json();
const menuGroups = data.menuGroups;
```

### Place Order
```javascript
const response = await fetch(`${API_BASE}/api/v1/orders`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ items, orderType: 'dine-in' })
});
const { data } = await response.json();
const order = data.order;
```

### Track Order (with polling)
```javascript
const pollInterval = setInterval(async () => {
  const response = await fetch(`${API_BASE}/api/v1/orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const { data } = await response.json();
  updateOrderStatus(data.order);
  
  if (data.order.status === 'completed') {
    clearInterval(pollInterval);
  }
}, 5000); // Poll every 5 seconds
```

### Create Customer Account
```javascript
const response = await fetch(`${API_BASE}/api/v1/customers/login`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ name, phone, email })
});
const { data } = await response.json();
localStorage.setItem('customerId', data.customer._id);
```

### Connect Telegram
```javascript
function openTelegramBot() {
  const merchantId = localStorage.getItem('merchantId');
  const customerId = localStorage.getItem('customerId');
  const botUrl = `https://t.me/YourRestaurantBot?start=${merchantId}_${customerId}`;
  window.open(botUrl, '_blank');
}
```

### Get Order History
```javascript
const response = await fetch(
  `${API_BASE}/api/v1/customers/my-orders?page=1&limit=10`,
  { headers: { 'Authorization': `Bearer ${token}` } }
);
const { data } = await response.json();
const orders = data.orders;
```

### Submit Feedback
```javascript
const response = await fetch(`${API_BASE}/api/v1/feedback`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    rating: 5,
    comment: 'Great food!',
    categories: ['food_quality'],
    channel: 'qr_table',
    order: orderId,
    isPublic: true
  })
});
const { data } = await response.json();
```

---

## ✅ Complete Flow Sequence

```
1. Customer scans QR
   ↓
2. POST /sessions/start (get sessionToken)
   ↓
3. GET /menus/public (with sessionToken)
   ↓
4. Customer selects items
   ↓
5. POST /orders (with sessionToken)
   ↓
6. GET /orders/:id (poll for status updates)
   ↓
7. [OPTIONAL] POST /customers/login (create account)
   ↓
8. [OPTIONAL] Connect Telegram (open bot link)
   ↓
9. [OPTIONAL] GET /customers/my-orders (view history)
   ↓
10. [OPTIONAL] POST /feedback (submit feedback)
   ↓
11. Order completed → Payment → Session ends
```

---

## 🔄 Optional Features Flow

### **Customer Account Creation:**
```
After first order → Prompt signup
   ↓
POST /customers/login { name, phone, email }
   ↓
Store customerId
   ↓
Unlock: order history, loyalty, Telegram, feedback
```

### **Telegram Integration:**
```
Show "Connect Telegram" button
   ↓
Generate: https://t.me/BotName?start={merchantId}_{customerId}
   ↓
Customer opens link → Starts bot
   ↓
Backend auto-updates customer.telegram
   ↓
Customer receives order notifications
```

### **Order History:**
```
GET /customers/my-orders?page=1&limit=10
   ↓
Display past orders with reorder button
   ↓
Click reorder → Pre-fill order form
```

### **Feedback Submission:**
```
Order completed → Show feedback prompt
   ↓
POST /feedback { rating, comment, order }
   ↓
Earn loyalty points (if account exists)
```

---

**Ready to integrate?** See [QR-CUSTOMER-WORKFLOW.md](./QR-CUSTOMER-WORKFLOW.md) for detailed explanations.
