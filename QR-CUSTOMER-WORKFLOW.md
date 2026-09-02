# 🍽️ Customer QR Menu Workflow Guide

## 📋 Complete Flow: QR Scan → Menu → Order → Payment

---

## 🎯 Step-by-Step Customer Journey

### **Step 1: Customer Scans QR Code**

**What happens:**
- Customer scans QR code on the table
- QR contains encoded URL with merchant, branch, and table IDs

**QR URL Example:**
```
http://localhost:5173/qr?data=eyJtIjoiNmE5NTMyZTQ2Yzg0NGQwM2IzM2ZmNTViIiwiYiI6IjZhOTUzMmU0NmM4NDRkMDNiMzNmZjU1ZSIsInQiOiI2YTk1MzUzNDZjODQ0ZDAzYjM0MDAwMzYifQ&s=4092fe5d56b7a53b38852d2dd12900ac5d49a2cff28e29aeb69687ee05baa55e11:24
```

**URL Structure:**
- `data`: Base64 encoded JSON with `{m: merchantId, b: branchId, t: tableId}`
- `s`: HMAC signature for security validation

---

### **Step 2: Initialize Table Session**

**Frontend Action:**
Your frontend decodes the QR data and calls the session start endpoint.

#### **API Call:**
```http
POST /api/v1/sessions/start?data=<encoded_data>&s=<signature>
```

**Request:**
```javascript
// Query params (from QR code)
{
  data: "eyJtIjoiNmE5NTMyZTQ2Yzg0NGQwM2IzM2ZmNTViIiwiYiI6IjZhOTUzMmU0NmM4NDRkMDNiMzNmZjU1ZSIsInQiOiI2YTk1MzUzNDZjODQ0ZDAzYjM0MDAwMzYifQ",
  s: "4092fe5d56b7a53b38852d2dd12900ac5d49a2cff28e29aeb69687ee05baa55e11:24"
}
```

#### **Backend Response:**
```json
{
  "status": "success",
  "data": {
    "sessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "sessionId": "6a95476015b8780e437fa864",
    "tableId": "6a9535346c844d03b3400036",
    "tableNumber": "T-101",
    "merchantId": "6a9532e46c844d03b33ff55b",
    "branchId": "6a9532e46c844d03b33ff55e",
    "merchantName": "Golden Fork Restaurant",
    "branchName": "Downtown Branch",
    "expiresAt": "2026-08-22T18:00:00.000Z"
  }
}
```

**What to Store in Frontend:**
```javascript
// Store these in localStorage or sessionStorage
localStorage.setItem('sessionToken', response.data.sessionToken);
localStorage.setItem('sessionId', response.data.sessionId);
localStorage.setItem('merchantId', response.data.merchantId);
localStorage.setItem('branchId', response.data.branchId);
localStorage.setItem('tableId', response.data.tableId);
localStorage.setItem('tableNumber', response.data.tableNumber);
```

---

### **Step 3: Fetch Public Menu**

Now that you have a valid session token, fetch the menu.

#### **API Call:**
```http
GET /api/v1/menus/public
```

**Headers:**
```javascript
{
  'Authorization': 'Bearer <sessionToken>',
  'Content-Type': 'application/json'
}
```

#### **Backend Response:**
```json
{
  "status": "success",
  "results": 3,
  "data": {
    "menuGroups": [
      {
        "_id": "6a9536846c844d03b340008a",
        "name": "Main Course",
        "description": "Our signature dishes",
        "isActive": true,
        "displayOrder": 1,
        "items": [
          {
            "_id": "6a9536846c844d03b340008b",
            "name": "Grilled Chicken",
            "description": "Tender grilled chicken with herbs",
            "price": 250,
            "imageUrl": "http://localhost:8000/uploads/menu/grilled-chicken.jpg",
            "imagePath": "/uploads/menu/grilled-chicken.jpg",
            "category": "Main",
            "isAvailable": true,
            "preparationTime": 15,
            "allergens": ["gluten"],
            "isVegetarian": false,
            "isVegan": false,
            "spicyLevel": 2,
            "ingredients": [
              {
                "name": "Chicken Breast",
                "quantity": 200,
                "unit": "g"
              },
              {
                "name": "Olive Oil",
                "quantity": 15,
                "unit": "ml"
              }
            ],
            "options": [
              {
                "optionGroupName": "Size",
                "required": true,
                "choices": [
                  {
                    "choiceName": "Regular",
                    "priceModifier": 0,
                    "isAvailable": true
                  },
                  {
                    "choiceName": "Large",
                    "priceModifier": 50,
                    "isAvailable": true
                  }
                ]
              },
              {
                "optionGroupName": "Add-ons",
                "required": false,
                "choices": [
                  {
                    "choiceName": "Extra Sauce",
                    "priceModifier": 10,
                    "isAvailable": true
                  }
                ]
              }
            ],
            "combos": []
          }
        ]
      },
      {
        "_id": "6a9536846c844d03b340008c",
        "name": "Beverages",
        "description": "Refreshing drinks",
        "isActive": true,
        "displayOrder": 2,
        "items": [
          {
            "_id": "6a9536846c844d03b340008d",
            "name": "Fresh Orange Juice",
            "description": "100% natural orange juice",
            "price": 45,
            "imageUrl": "http://localhost:8000/uploads/menu/orange-juice.jpg",
            "imagePath": "/uploads/menu/orange-juice.jpg",
            "category": "Beverage",
            "isAvailable": true,
            "preparationTime": 5,
            "isVegetarian": true,
            "isVegan": true,
            "ingredients": [
              {
                "name": "Orange",
                "quantity": 3,
                "unit": "pieces"
              }
            ],
            "options": [],
            "combos": []
          }
        ]
      }
    ]
  }
}
```

**Key Response Fields:**
- ✅ `imageUrl`: Full URL for displaying images (e.g., `http://localhost:8000/uploads/menu/item.jpg`)
- ✅ `imagePath`: Relative path (for backup/fallback)
- ✅ `ingredients`: List of ingredients (from Recipe OR staticIngredients field)
- ✅ `allergens`: Array of allergen tags
- ✅ `options`: Customization options with price modifiers
- ✅ `combos`: Combo deals (if applicable)
- ✅ `isAvailable`: Real-time availability status

**Alternative Endpoints:**
```http
# Get only food items
GET /api/v1/menus/public/food

# Get only beverages
GET /api/v1/menus/public/beverages

# Get only combos
GET /api/v1/menus/public/combos
```

---

### **Step 4: Customer Places Order**

Customer selects items from menu and places an order.

#### **API Call:**
```http
POST /api/v1/orders
```

**Headers:**
```javascript
{
  'Authorization': 'Bearer <sessionToken>',
  'Content-Type': 'application/json'
}
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
        },
        {
          "optionGroupName": "Add-ons",
          "choiceName": "Extra Sauce",
          "priceModifier": 10
        }
      ],
      "specialInstructions": "Well done, no pepper"
    },
    {
      "menuItem": "6a9536846c844d03b340008d",
      "name": "Fresh Orange Juice",
      "quantity": 1,
      "price": 45,
      "selectedOptions": []
    }
  ],
  "orderType": "dine-in",
  "customerName": "John Doe",
  "customerPhone": "+251912345678",
  "notes": "Please serve appetizers first"
}
```

**Field Explanations:**
- `items`: Array of menu items with selections
- `menuItem`: MenuItem ObjectId from the menu response
- `selectedOptions`: Customer's customization choices
- `orderType`: Must be `"dine-in"` for table orders
- `customerName`: Optional (for better service)
- `customerPhone`: Optional (for notifications)

#### **Backend Response:**
```json
{
  "status": "success",
  "data": {
    "order": {
      "_id": "6a95476015b8780e437fa865",
      "orderNumber": "ORD-20260822-0042",
      "merchant": "6a9532e46c844d03b33ff55b",
      "branch": "6a9532e46c844d03b33ff55e",
      "table": "6a9535346c844d03b3400036",
      "tableNumber": "T-101",
      "session": "6a95476015b8780e437fa864",
      "orderType": "dine-in",
      "source": "qr-menu",
      "status": "pending",
      "paymentStatus": "unpaid",
      "items": [
        {
          "menuItem": "6a9536846c844d03b340008b",
          "name": "Grilled Chicken",
          "quantity": 2,
          "unitPrice": 250,
          "priceModifiers": 60,
          "totalPrice": 620,
          "selectedOptions": [...],
          "itemStatus": "pending"
        },
        {
          "menuItem": "6a9536846c844d03b340008d",
          "name": "Fresh Orange Juice",
          "quantity": 1,
          "unitPrice": 45,
          "priceModifiers": 0,
          "totalPrice": 45,
          "itemStatus": "pending"
        }
      ],
      "subtotal": 665,
      "tax": 99.75,
      "total": 764.75,
      "createdAt": "2026-08-22T14:30:00.000Z",
      "estimatedReadyTime": "2026-08-22T14:50:00.000Z"
    }
  }
}
```

**What Happens in Backend:**
1. ✅ Validates session token
2. ✅ Checks menu item availability
3. ✅ Validates stock (if inventory enabled)
4. ✅ Calculates prices with modifiers
5. ✅ Generates unique order number
6. ✅ Creates kitchen tickets (if KDS enabled)
7. ✅ Deducts inventory (if enabled)
8. ✅ Sends notifications to staff

---

### **Step 5: Track Order Status**

Customer can track their order in real-time.

#### **API Call:**
```http
GET /api/v1/orders/:orderId
```

**Headers:**
```javascript
{
  'Authorization': 'Bearer <sessionToken>'
}
```

#### **Backend Response:**
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
          "quantity": 2,
          "itemStatus": "preparing",
          "estimatedReadyTime": "2026-08-22T14:50:00.000Z"
        },
        {
          "name": "Fresh Orange Juice",
          "quantity": 1,
          "itemStatus": "ready",
          "preparedAt": "2026-08-22T14:35:00.000Z"
        }
      ],
      "total": 764.75,
      "createdAt": "2026-08-22T14:30:00.000Z",
      "estimatedReadyTime": "2026-08-22T14:50:00.000Z"
    }
  }
}
```

**Order Status Values:**
- `pending`: Order received, waiting for kitchen
- `accepted`: Kitchen accepted the order
- `preparing`: Food is being prepared
- `ready`: Food is ready for serving
- `served`: Food delivered to table
- `completed`: Order finished, payment done
- `cancelled`: Order cancelled

**Item Status Values:**
- `pending`: Not started
- `preparing`: Being prepared
- `ready`: Ready to serve
- `served`: Delivered to table
- `cancelled`: Item cancelled

---

### **Step 6: Payment**

When customer is ready to pay, call staff or use digital payment.

#### **Get Order Total:**
```http
GET /api/v1/orders/:orderId
```

Shows final total with tax.

#### **Payment Options:**

**Option A: Staff Payment (Traditional)**
- Customer requests bill from staff
- Staff marks order as paid in POS
- Session automatically freed after payment

**Option B: Digital Payment (Future)**
- Customer initiates payment via app
- Payment gateway integration (Telebirr, CBE Birr)
- Automatic session closure after successful payment

---

### **Step 7: Create Customer Account (Optional)**

Customers can create an account to access order history, loyalty rewards, and receive notifications.

#### **API Call:**
```http
POST /api/v1/customers/login
```

**Headers:**
```javascript
{
  'Authorization': 'Bearer <sessionToken>',
  'Content-Type': 'application/json'
}
```

**Request Body:**
```json
{
  "name": "John Doe",
  "phone": "+251912345678",
  "email": "john@example.com"
}
```

#### **Backend Response:**
```json
{
  "status": "success",
  "data": {
    "customer": {
      "_id": "6a95476015b8780e437fa866",
      "name": "John Doe",
      "phone": "+251912345678",
      "email": "john@example.com",
      "merchant": "6a9532e46c844d03b33ff55b",
      "source": "guest",
      "loyalty": {
        "points": 0,
        "tier": "bronze",
        "totalSpent": 0
      },
      "preferences": {
        "dietary": [],
        "favoriteItems": []
      },
      "createdAt": "2026-08-22T14:30:00.000Z"
    },
    "isNewCustomer": true
  }
}
```

**What to Store:**
```javascript
localStorage.setItem('customerId', response.data.customer._id);
localStorage.setItem('customerName', response.data.customer.name);
```

**Benefits:**
- ✅ Access order history
- ✅ Earn loyalty points
- ✅ Save favorite items
- ✅ Connect Telegram for notifications
- ✅ Submit feedback
- ✅ Claim rewards and gifts

---

### **Step 8: Connect Telegram (Optional)**

Link Telegram account to receive order notifications and updates.

#### **Step 8.1: Get Telegram Bot URL**

**Frontend Action:**
Display a button or QR code to connect Telegram.

**Telegram Bot URL Format:**
```
https://t.me/YOUR_RESTAURANT_BOT?start={merchantId}_{customerId}
```

**Example:**
```
https://t.me/GoldenForkBot?start=6a9532e46c844d03b33ff55b_6a95476015b8780e437fa866
```

#### **Step 8.2: Customer Opens Telegram Link**

1. Customer clicks the Telegram link
2. Opens Telegram app/web
3. Starts conversation with restaurant bot
4. Bot automatically links the Telegram account to customer profile

#### **Backend Auto-Update:**
When customer starts the bot:
1. Bot receives `customerId` from start parameter
2. Bot updates customer record with Telegram info:
   ```json
   {
     "telegram": {
       "id": "123456789",
       "chatId": "987654321",
       "username": "johndoe",
       "optIn": true,
       "connectedAt": "2026-08-22T14:35:00.000Z"
     }
   }
   ```

#### **Check Connection Status:**
```http
GET /api/v1/customers/me
Authorization: Bearer <sessionToken>
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "customer": {
      "_id": "6a95476015b8780e437fa866",
      "name": "John Doe",
      "telegram": {
        "username": "johndoe",
        "optIn": true,
        "connectedAt": "2026-08-22T14:35:00.000Z"
      }
    }
  }
}
```

**Notification Types:**
- ✅ Order status updates (preparing, ready, served)
- ✅ Loyalty rewards earned
- ✅ Special offers and promotions
- ✅ Table reservation confirmations
- ✅ Payment receipts

---

### **Step 9: View Order History**

Customers with accounts can view their past orders.

#### **API Call:**
```http
GET /api/v1/customers/my-orders
```

**Headers:**
```javascript
{
  'Authorization': 'Bearer <sessionToken>'
}
```

**Query Parameters:**
```javascript
?page=1&limit=10&status=completed
```

#### **Backend Response:**
```json
{
  "status": "success",
  "results": 5,
  "total": 23,
  "page": 1,
  "limit": 10,
  "data": {
    "orders": [
      {
        "_id": "6a95476015b8780e437fa865",
        "orderNumber": "ORD-20260822-0042",
        "orderType": "dine-in",
        "status": "completed",
        "paymentStatus": "paid",
        "items": [
          {
            "name": "Grilled Chicken",
            "quantity": 2,
            "unitPrice": 250,
            "totalPrice": 620,
            "imageUrl": "http://localhost:8000/uploads/menu/grilled-chicken.jpg"
          }
        ],
        "subtotal": 665,
        "tax": 99.75,
        "total": 764.75,
        "branch": {
          "name": "Downtown Branch",
          "address": "123 Main St"
        },
        "createdAt": "2026-08-22T14:30:00.000Z",
        "completedAt": "2026-08-22T15:15:00.000Z"
      },
      {
        "_id": "6a95476015b8780e437fa864",
        "orderNumber": "ORD-20260815-0028",
        "orderType": "dine-in",
        "status": "completed",
        "total": 450,
        "createdAt": "2026-08-15T12:20:00.000Z"
      }
    ]
  }
}
```

**Filter Options:**
- `status`: Filter by order status (`pending`, `completed`, `cancelled`)
- `page`: Page number for pagination
- `limit`: Number of results per page (max 100)
- `startDate`: Filter orders from this date
- `endDate`: Filter orders until this date

---

### **Step 10: Submit Feedback**

After completing an order, customers can submit feedback in **two ways**:

---

#### **Option A: Overall Experience Feedback (Simple)**

Rate the entire visit with one rating.

**API Call:**
```http
POST /api/v1/feedback
Authorization: Bearer <sessionToken>
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
  "images": [
    "https://example.com/photo1.jpg"
  ],
  "isPublic": true
}
```

**Field Explanations:**
- `rating`: 1-5 stars for overall experience (required)
- `comment`: Free text review (optional, max 1000 chars)
- `categories`: What aspects you're rating (optional)
- `channel`: Use `"qr_table"` for QR menu orders
- `order`: Order ID to link feedback (optional)
- `images`: Photo URLs showing food/experience (optional)
- `isPublic`: Display as public review (default: true)

**Feedback Categories:**
| Category | What It Covers |
|----------|----------------|
| `food_quality` | Taste, freshness, presentation, temperature |
| `service` | Staff friendliness, speed, attentiveness |
| `cleanliness` | Table, utensils, restroom cleanliness |
| `ambiance` | Music, lighting, atmosphere |
| `delivery_time` | How fast the food arrived |
| `value_for_money` | Price vs quality ratio |
| `other` | General feedback |

**Response:**
```json
{
  "status": "success",
  "data": {
    "feedback": {
      "_id": "6a95476015b8780e437fa867",
      "rating": 5,
      "comment": "Amazing food and excellent service!",
      "categories": ["food_quality", "service"],
      "status": "pending",
      "isPublic": true,
      "createdAt": "2026-08-22T15:20:00.000Z"
    }
  }
}
```

---

#### **Option B: Item-Specific Feedback (Detailed)**

Rate individual menu items separately for granular insights.

**API Call:**
```http
POST /api/v1/feedback
Authorization: Bearer <sessionToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "rating": 4,
  "comment": "Overall great but some items were better than others",
  "categories": ["food_quality", "service"],
  "channel": "qr_table",
  "order": "6a95476015b8780e437fa865",
  "isPublic": true,
  
  "itemFeedback": [
    {
      "menuItem": "6a9536846c844d03b340008b",
      "itemName": "Grilled Chicken",
      "rating": 5,
      "comment": "Perfectly cooked, very tender and flavorful!",
      "wouldOrderAgain": true,
      "tags": ["perfect", "delicious"]
    },
    {
      "menuItem": "6a9536846c844d03b340008d",
      "itemName": "Fresh Orange Juice",
      "rating": 3,
      "comment": "Too sweet for my taste, could use less sugar",
      "wouldOrderAgain": false,
      "tags": ["too_sweet"]
    }
  ]
}
```

**Item Feedback Fields:**
- `menuItem`: MenuItem ID from order (required)
- `itemName`: Name of the dish (required)
- `rating`: 1-5 stars for this specific item (required)
- `comment`: Item-specific feedback (optional, max 500 chars)
- `wouldOrderAgain`: Would you order this again? (optional)
- `tags`: Quick issue/praise tags (optional)

**Available Tags:**

| Problem Tags | Positive Tags | Portion Tags |
|--------------|---------------|--------------|
| `too_salty` | `perfect` | `small_portion` |
| `too_sweet` | `delicious` | `large_portion` |
| `too_spicy` | `creative` | `good_value` |
| `bland` | `authentic` | |
| `cold` | | |
| `overcooked` | | |
| `undercooked` | | |

**Response:**
```json
{
  "status": "success",
  "data": {
    "feedback": {
      "_id": "6a95476015b8780e437fa867",
      "rating": 4,
      "comment": "Overall great but...",
      "categories": ["food_quality", "service"],
      "itemFeedback": [
        {
          "_id": "6a95476015b8780e437fa868",
          "menuItem": "6a9536846c844d03b340008b",
          "itemName": "Grilled Chicken",
          "rating": 5,
          "comment": "Perfectly cooked...",
          "wouldOrderAgain": true,
          "tags": ["perfect", "delicious"]
        },
        {
          "_id": "6a95476015b8780e437fa869",
          "menuItem": "6a9536846c844d03b340008d",
          "itemName": "Fresh Orange Juice",
          "rating": 3,
          "comment": "Too sweet...",
          "wouldOrderAgain": false,
          "tags": ["too_sweet"]
        }
      ],
      "status": "pending",
      "createdAt": "2026-08-22T15:20:00.000Z"
    }
  }
}
```

---

#### **Feedback Benefits:**

**For Customers:**
- ✅ Help improve restaurant quality
- ✅ Earn loyalty points for feedback
- ✅ Get responses from restaurant
- ✅ Influence menu improvements

**For Restaurant:**
- ✅ Identify best/worst performing dishes
- ✅ Track quality trends over time
- ✅ Get actionable kitchen insights
- ✅ Respond to customer concerns
- ✅ Build public social proof

**Feedback Status Flow:**
```
pending → reviewed → responded → resolved
               ↓
          flagged (if spam/inappropriate)
```

---

#### **See Also:**
📖 [FEEDBACK-SYSTEM-GUIDE.md](./FEEDBACK-SYSTEM-GUIDE.md) - Complete feedback documentation with implementation details

---

### **Step 11: End Session (Optional)**

Session automatically expires after:
- ✅ 2 hours of inactivity
- ✅ Staff manually frees the table
- ✅ Payment completed

**Manual Session End (if needed):**
```http
PATCH /api/v1/sessions/:sessionId/free
```

This is typically called by **staff**, not customers.

---

## 🔐 Authentication Flow

### **Session Token Usage:**

All customer API calls must include the session token:

```javascript
const sessionToken = localStorage.getItem('sessionToken');

fetch('http://localhost:8000/api/v1/menus/public', {
  headers: {
    'Authorization': `Bearer ${sessionToken}`,
    'Content-Type': 'application/json'
  }
})
```

### **Token Validation:**

Backend automatically:
- ✅ Validates token signature
- ✅ Checks session expiry
- ✅ Verifies table is active
- ✅ Ensures merchant/branch context

---

## 📊 Complete API Summary

### **1. Session Management**

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/v1/sessions/start` | None (QR) | Initialize table session |
| PATCH | `/api/v1/sessions/:id/free` | Staff JWT | Free table (staff only) |

### **2. Customer Account**

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/v1/customers/login` | Session Token | Create/login customer account |
| GET | `/api/v1/customers/me` | Session Token | Get customer profile |
| PATCH | `/api/v1/customers/me` | Session Token | Update customer profile |
| GET | `/api/v1/customers/my-orders` | Session Token | Get order history |

### **3. Menu Browsing**

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/v1/menus/public` | Session Token | Get full menu |
| GET | `/api/v1/menus/public/food` | Session Token | Get food items only |
| GET | `/api/v1/menus/public/beverages` | Session Token | Get beverages only |
| GET | `/api/v1/menus/public/combos` | Session Token | Get combo deals |

### **4. Order Management**

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/v1/orders` | Session Token | Place new order |
| GET | `/api/v1/orders/:id` | Session Token | Get order details |
| GET | `/api/v1/orders/number/:orderNumber` | Session Token | Track by order number |

### **5. Feedback**

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/v1/feedback` | Session Token | Submit feedback |

---

## 🚨 Error Handling

### **Common Errors:**

**1. Invalid QR Code:**
```json
{
  "success": false,
  "message": "Invalid QR signature"
}
```
**Solution:** QR code tampered or expired. Generate new QR.

**2. Session Expired:**
```json
{
  "success": false,
  "message": "Session expired or not found"
}
```
**Solution:** Scan QR again to create new session.

**3. Table Already Occupied:**
```json
{
  "success": false,
  "message": "Table already has an active session"
}
```
**Solution:** Staff needs to free the table first.

**4. Item Not Available:**
```json
{
  "success": false,
  "message": "Menu item 'Grilled Chicken' is currently unavailable"
}
```
**Solution:** Choose different item or wait for availability.

**5. Insufficient Stock:**
```json
{
  "success": false,
  "message": "Insufficient stock for 'Chicken Breast'. Available: 5, Required: 10"
}
```
**Solution:** Reduce quantity or choose different item.

---

## 💡 Frontend Implementation Tips

### **1. Session Management:**
```javascript
// Initialize session on QR scan
async function initSession(qrUrl) {
  const url = new URL(qrUrl);
  const data = url.searchParams.get('data');
  const signature = url.searchParams.get('s');
  
  const response = await fetch(
    `${API_BASE}/api/v1/sessions/start?data=${data}&s=${signature}`,
    { method: 'POST' }
  );
  
  const result = await response.json();
  
  if (result.status === 'success') {
    localStorage.setItem('sessionToken', result.data.sessionToken);
    localStorage.setItem('sessionId', result.data.sessionId);
    localStorage.setItem('merchantId', result.data.merchantId);
    localStorage.setItem('tableNumber', result.data.tableNumber);
    return result.data;
  }
  
  throw new Error(result.message);
}
```

### **2. Fetch Menu:**
```javascript
async function fetchMenu() {
  const token = localStorage.getItem('sessionToken');
  
  const response = await fetch(`${API_BASE}/api/v1/menus/public`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const result = await response.json();
  return result.data.menuGroups;
}
```

### **3. Place Order:**
```javascript
async function placeOrder(orderItems) {
  const token = localStorage.getItem('sessionToken');
  
  const response = await fetch(`${API_BASE}/api/v1/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      items: orderItems,
      orderType: 'dine-in'
    })
  });
  
  const result = await response.json();
  return result.data.order;
}
```

### **4. Track Order:**
```javascript
async function trackOrder(orderId) {
  const token = localStorage.getItem('sessionToken');
  
  const response = await fetch(`${API_BASE}/api/v1/orders/${orderId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const result = await response.json();
  return result.data.order;
}
```

### **5. Create Customer Account:**
```javascript
async function createAccount(name, phone, email) {
  const token = localStorage.getItem('sessionToken');
  
  const response = await fetch(`${API_BASE}/api/v1/customers/login`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name, phone, email })
  });
  
  const result = await response.json();
  
  if (result.status === 'success') {
    localStorage.setItem('customerId', result.data.customer._id);
    localStorage.setItem('customerName', result.data.customer.name);
  }
  
  return result.data.customer;
}
```

### **6. Get Order History:**
```javascript
async function getOrderHistory(page = 1, limit = 10) {
  const token = localStorage.getItem('sessionToken');
  
  const response = await fetch(
    `${API_BASE}/api/v1/customers/my-orders?page=${page}&limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  const result = await response.json();
  return result.data.orders;
}
```

### **7. Submit Feedback:**
```javascript
async function submitFeedback(orderId, rating, comment, categories) {
  const token = localStorage.getItem('sessionToken');
  
  const response = await fetch(`${API_BASE}/api/v1/feedback`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      rating,
      comment,
      categories,
      channel: 'qr_table',
      order: orderId,
      isPublic: true
    })
  });
  
  const result = await response.json();
  return result.data.feedback;
}
```

### **8. Connect Telegram:**
```javascript
function getTelegramBotUrl(merchantId, customerId) {
  // Replace 'YourRestaurantBot' with actual bot username
  return `https://t.me/YourRestaurantBot?start=${merchantId}_${customerId}`;
}

// Display as QR code or button
function showTelegramConnect() {
  const merchantId = localStorage.getItem('merchantId');
  const customerId = localStorage.getItem('customerId');
  const telegramUrl = getTelegramBotUrl(merchantId, customerId);
  
  // Option 1: Open in new window
  window.open(telegramUrl, '_blank');
  
  // Option 2: Generate QR code
  // Use a QR library like qrcode.js to display the URL as QR
}
```

---

## 🎨 UI/UX Recommendations

1. **QR Scan Screen:**
   - Show loading state while initializing session
   - Display merchant name and table number after scan
   - Handle QR errors gracefully

2. **Account Creation:**
   - Optional account creation prompt after first order
   - Highlight benefits: order history, loyalty points, Telegram notifications
   - Quick signup with phone number only (name and email optional)
   - Social login options (if available)

3. **Telegram Connection:**
   - Clear call-to-action: "Get instant order updates on Telegram"
   - Display QR code + direct link button
   - Show connection status (Connected ✓ / Not Connected)
   - Preview of notification types customer will receive

4. **Menu Display:**
   - Group items by category (from menuGroups)
   - Show full image URLs (`imageUrl` field)
   - Display allergen badges prominently
   - Show availability status in real-time
   - Highlight vegetarian/vegan options
   - Mark customer's favorite items (if logged in)

5. **Order Customization:**
   - Clear option selection UI
   - Live price calculation with modifiers
   - Special instructions text area

6. **Order Tracking:**
   - Real-time status updates (consider WebSocket/polling)
   - Progress bar for order preparation
   - Estimated ready time display
   - Item-level status (some items ready, others preparing)
   - Push notification integration (if Telegram connected)

7. **Order History:**
   - Timeline view of past orders
   - Reorder button for quick repeat orders
   - Filter by date range, status, branch
   - Total spent and loyalty points summary
   - Link to feedback for completed orders

8. **Feedback UI:**
   - Star rating widget (1-5 stars)
   - Category chips for quick selection
   - Photo upload for visual feedback
   - Item-by-item rating option
   - "Public review" checkbox
   - Success confirmation with loyalty points earned

9. **Error States:**
   - Clear error messages
   - Retry buttons for network issues
   - Fallback to staff call if system fails

---

## ✅ Complete Flow Checklist

### **Basic QR Order Flow:**
- [ ] Customer scans QR code
- [ ] Frontend extracts `data` and `s` params
- [ ] Call `POST /api/v1/sessions/start?data=...&s=...`
- [ ] Store `sessionToken` and session details
- [ ] Fetch menu with `GET /api/v1/menus/public`
- [ ] Display menu with images, prices, options
- [ ] Customer selects items and customizations
- [ ] Submit order with `POST /api/v1/orders`
- [ ] Show order confirmation with order number
- [ ] Poll order status with `GET /api/v1/orders/:id`
- [ ] Display real-time status updates
- [ ] Handle payment (staff or digital)
- [ ] Session auto-expires or staff frees table

### **Enhanced Customer Experience (Optional):**
- [ ] Prompt customer to create account after first order
- [ ] Call `POST /api/v1/customers/login` with name, phone, email
- [ ] Store `customerId` and customer info
- [ ] Display "Connect Telegram" button/QR in profile
- [ ] Generate Telegram bot URL: `https://t.me/BotName?start={merchantId}_{customerId}`
- [ ] Show connection status on profile page
- [ ] Implement order history page with `GET /api/v1/customers/my-orders`
- [ ] Add "Reorder" functionality from history
- [ ] Show feedback prompt after order completion
- [ ] Implement feedback form with star rating + comment
- [ ] Call `POST /api/v1/feedback` with order ID
- [ ] Display loyalty points and tier on profile
- [ ] Show favorite items in menu (if customer logged in)

---

## 🔗 Related Documentation

- [CUSTOMER-QR-MENU-API-GUIDE.md](./CUSTOMER-QR-MENU-API-GUIDE.md) - API reference
- [QR-SESSION-QUICK-START.md](./QR-SESSION-QUICK-START.md) - Quick setup guide

---

**Need Help?** All endpoints return standard JSON responses with `status`, `message`, and `data` or `errors` fields.
