# Customer QR App - Complete Integration Guide

## 🎯 Overview

This guide shows you **exactly** how to build the customer-facing QR menu app that integrates with your backend.

**What customers can do:**
- ✅ Scan QR code at table
- ✅ Browse multilingual menu (English/Amharic)
- ✅ Place orders
- ✅ Track order status in real-time
- ✅ Request waiter assistance
- ✅ View order history
- ✅ Leave feedback

---

## 📱 Complete User Flow

```
1. Customer sits at table
2. Scans QR code → Opens app
3. Session starts automatically
4. Views menu (English/Amharic toggle)
5. Adds items to cart
6. Places order
7. Receives real-time status updates
8. Leaves feedback (optional)
9. Session ends when leaving table
```

---

## 🔑 Step-by-Step Integration

### **Step 1: Decode QR Code**

When customer scans QR, extract data:

```javascript
// QR URL format:
// http://localhost:5173/qr?data=eyJtIjoiNmE5NTMyZTQ2Yzg0NGQwM2IzM2ZmNTViIiwiYiI6IjZhOTUzMmU0NmM4NDRkMDNiMzNmZjU1ZSIsInQiOiI2YTk1NDcwODE1Yjg3ODBlNDM3ZmE3NzQifQ&s=0f628654a3a5e875916b2d411aa8e4ff7e0e81fff28b6692755ac9a7dac13abb

function decodeQRData(url) {
  const params = new URLSearchParams(url.split('?')[1]);
  const encodedData = params.get('data');
  const signature = params.get('s');
  
  return { encodedData, signature };
}
```

---

### **Step 2: Start Session**

Call session endpoint with QR data:

```javascript
async function startQRSession(encodedData, signature) {
  const response = await fetch(
    `${API_URL}/api/v1/sessions/start?data=${encodedData}&s=${signature}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }
  );
  
  const result = await response.json();
  
  if (result.success) {
    // ✅ Save token for all future requests
    localStorage.setItem('sessionToken', result.data.token);
    localStorage.setItem('merchantId', result.data.merchant._id);
    localStorage.setItem('branchId', result.data.branch._id);
    localStorage.setItem('tableNumber', result.data.table.tableNumber);
    
    return result.data;
  }
  
  throw new Error(result.message);
}

// Usage:
const { encodedData, signature } = decodeQRData(qrUrl);
const session = await startQRSession(encodedData, signature);
console.log('Session started:', session.token);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "qr-session-abc123",
    "merchant": {
      "_id": "...",
      "businessName": "My Restaurant",
      "logo": "http://..."
    },
    "branch": {
      "_id": "...",
      "name": "Main Branch"
    },
    "table": {
      "_id": "...",
      "tableNumber": "T-02"
    },
    "expiresAt": "2026-09-01T00:00:00.000Z"
  }
}
```

---

### **Step 3: Fetch Public Menu**

Get the menu with full multilingual data:

```javascript
async function fetchMenu(language = 'en') {
  const token = localStorage.getItem('sessionToken');
  
  const response = await fetch(`${API_URL}/api/v1/menu/public`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const result = await response.json();
  
  if (result.status === 'success') {
    return result.data;
  }
  
  throw new Error(result.message);
}

// Usage:
const menuData = await fetchMenu();
console.log('Total items:', menuData.totalItems);
console.log('Menu items:', menuData.menus);
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "restaurant": "My Restaurant",
    "generatedAt": "2026-08-31T15:23:59.220Z",
    "totalItems": 25,
    "menus": [
      {
        "id": "6a9533328bc68bc64ec6b679",
        "name": {
          "en": "Grilled Chicken Breast",
          "am": "የተጠበሰ የዶሮ ጡት"
        },
        "description": {
          "en": "Juicy grilled chicken...",
          "am": "ጥሩ የተጠበሰ..."
        },
        "image": "http://localhost:8000/api/v1/files/abc123/content",
        "price": 245,
        "variants": [
          {
            "name": "Regular",
            "price": 245
          },
          {
            "name": "Large",
            "price": 350
          }
        ],
        "options": [
          {
            "name": "Extra Cheese",
            "price": 25
          }
        ],
        "category": {
          "_id": "...",
          "name": {"en": "Main Course", "am": "ዋና ምግብ"}
        },
        "isVeg": false,
        "isSpicy": true,
        "prepTime": "15-25 min",
        "ingredients": ["Chicken", "Vegetables"],
        "tags": ["bestseller"],
        "rating": 4.5,
        "isAvailable": true
      }
    ],
    "specialOffers": [
      {
        "id": "...",
        "name": {"en": "Chef Special", "am": "..."},
        "price": 300,
        "tag": "chef-special"
      }
    ],
    "tableNumber": "T-02"
  }
}
```

---

### **Step 4: Display Menu with Language Toggle**

```javascript
function MenuComponent() {
  const [language, setLanguage] = useState('en');
  const [menuData, setMenuData] = useState(null);
  
  useEffect(() => {
    fetchMenu().then(setMenuData);
  }, []);
  
  if (!menuData) return <Loading />;
  
  return (
    <div>
      {/* Language Toggle */}
      <div className="language-toggle">
        <button 
          onClick={() => setLanguage('en')}
          className={language === 'en' ? 'active' : ''}
        >
          English
        </button>
        <button 
          onClick={() => setLanguage('am')}
          className={language === 'am' ? 'active' : ''}
        >
          አማርኛ
        </button>
      </div>
      
      {/* Restaurant Info */}
      <h1>{menuData.restaurant}</h1>
      <p>Table: {menuData.tableNumber}</p>
      
      {/* Menu Items */}
      <div className="menu-grid">
        {menuData.menus.map(item => (
          <MenuItem 
            key={item.id}
            item={item}
            language={language}
          />
        ))}
      </div>
    </div>
  );
}

function MenuItem({ item, language }) {
  return (
    <div className="menu-item">
      <img src={item.image} alt={item.name[language]} />
      <h3>{item.name[language]}</h3>
      <p>{item.description[language]}</p>
      <p className="price">{item.price} Birr</p>
      
      {item.isVeg && <span className="badge">🌱 Veg</span>}
      {item.isSpicy && <span className="badge">🌶️ Spicy</span>}
      {item.tags.includes('bestseller') && <span className="badge">⭐ Bestseller</span>}
      
      <button onClick={() => addToCart(item)}>
        Add to Cart
      </button>
    </div>
  );
}
```

---

### **Step 5: Place Order**

```javascript
async function placeOrder(cartItems) {
  const token = localStorage.getItem('sessionToken');
  const branchId = localStorage.getItem('branchId');
  const tableNumber = localStorage.getItem('tableNumber');
  
  // Calculate totals
  const items = cartItems.map(item => ({
    menuItemId: item.id,
    name: item.name.en,  // or use current language
    quantity: item.quantity,
    price: item.selectedVariant?.price || item.price,
    subtotal: (item.selectedVariant?.price || item.price) * item.quantity,
    selectedVariant: item.selectedVariant,
    selectedOptions: item.selectedOptions || [],
    notes: item.specialInstructions || ''
  }));
  
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const tax = subtotal * 0.15;  // 15% VAT
  const totalAmount = subtotal + tax;
  
  const orderPayload = {
    items,
    branchId,
    table: tableNumber,
    customerName: 'Guest',  // Or prompt for name
    customerPhone: null,
    customer: null,
    subtotal,
    tax,
    totalAmount,
    notes: ''
  };
  
  const response = await fetch(`${API_URL}/api/v1/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(orderPayload)
  });
  
  const result = await response.json();
  
  if (result.success) {
    return result.data.order;
  }
  
  throw new Error(result.message);
}

// Usage:
const cart = [
  {
    id: '6a9533328bc68bc64ec6b679',
    name: { en: 'Burger', am: 'በርገር' },
    price: 150,
    quantity: 2,
    selectedVariant: { name: 'Large', price: 200 },
    selectedOptions: [
      { name: 'Extra Cheese', price: 25 }
    ]
  }
];

const order = await placeOrder(cart);
console.log('Order placed:', order.orderNumber);
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order": {
      "_id": "...",
      "orderNumber": "ORD-123",
      "status": "pending",
      "items": [...],
      "subtotal": 420,
      "tax": 63,
      "totalAmount": 483,
      "table": "T-02",
      "createdAt": "2026-08-31T15:30:00.000Z"
    }
  }
}
```

---

### **Step 6: Real-Time Order Status Updates**

Connect to Socket.IO for live updates:

```javascript
import io from 'socket.io-client';

function setupRealtimeUpdates(orderId) {
  const token = localStorage.getItem('sessionToken');
  
  // Connect to socket
  const socket = io(API_URL, {
    auth: { token },
    transports: ['websocket']
  });
  
  socket.on('connect', () => {
    console.log('Connected to real-time updates');
    
    // Join order room
    socket.emit('join-order-room', { orderId });
  });
  
  // Listen for order status changes
  socket.on('order:status-changed', (data) => {
    console.log('Order status updated:', data.status);
    updateOrderUI(data);
  });
  
  // Listen for item status changes
  socket.on('order:item-status-changed', (data) => {
    console.log('Item status:', data.itemId, data.status);
    updateItemUI(data);
  });
  
  return socket;
}

// Usage:
const socket = setupRealtimeUpdates(order._id);

// Cleanup on unmount
socket.disconnect();
```

**Status Flow:**
```
pending → accepted → preparing → ready → served → completed
```

---

### **Step 7: Request Waiter**

```javascript
async function callWaiter(reason = 'assistance') {
  const token = localStorage.getItem('sessionToken');
  const tableId = localStorage.getItem('tableId');
  
  const response = await fetch(`${API_URL}/api/v1/tables/${tableId}/call-waiter`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason })
  });
  
  const result = await response.json();
  
  if (result.success) {
    alert('Waiter has been notified!');
  }
}
```

---

### **Step 8: View Order History**

```javascript
async function getOrderHistory() {
  const token = localStorage.getItem('sessionToken');
  
  const response = await fetch(`${API_URL}/api/v1/orders/history`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const result = await response.json();
  
  if (result.success) {
    return result.data.orders;
  }
}
```

---

### **Step 9: Leave Feedback**

```javascript
// Overall restaurant feedback
async function submitOverallFeedback(rating, comment) {
  const token = localStorage.getItem('sessionToken');
  const merchantId = localStorage.getItem('merchantId');
  
  const response = await fetch(`${API_URL}/api/v1/feedback`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      merchant: merchantId,
      rating,  // 1-5
      comment,
      category: 'service'  // or 'food', 'ambiance'
    })
  });
  
  return await response.json();
}

// Specific menu item feedback
async function submitItemFeedback(orderId, menuItemId, rating, comment) {
  const token = localStorage.getItem('sessionToken');
  
  const response = await fetch(`${API_URL}/api/v1/feedback/item`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      order: orderId,
      menuItem: menuItemId,
      rating,  // 1-5
      comment
    })
  });
  
  return await response.json();
}
```

---

### **Step 10: End Session (Optional)**

```javascript
async function endSession() {
  const token = localStorage.getItem('sessionToken');
  const sessionId = localStorage.getItem('sessionId');
  
  const response = await fetch(`${API_URL}/api/v1/sessions/${sessionId}/free`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  // Clear local storage
  localStorage.removeItem('sessionToken');
  localStorage.removeItem('merchantId');
  localStorage.removeItem('branchId');
  localStorage.removeItem('tableNumber');
  
  return await response.json();
}
```

---

## 🔐 Authentication Flow

**All requests use the session token:**
```javascript
headers: {
  'Authorization': `Bearer ${sessionToken}`
}
```

**Token is valid for 4 hours** (configurable via `SESSION_DURATION_HOURS` env var)

---

## 🌐 Language Handling

Menu items have multilingual fields:
```javascript
const item = {
  name: { en: "Burger", am: "በርገር" },
  description: { en: "Delicious...", am: "ጣፋጭ..." }
};

// Display based on current language
const displayName = item.name[currentLanguage];
const displayDescription = item.description[currentLanguage];
```

---

## 🎨 UI/UX Recommendations

### **Menu Display:**
- ✅ Show item images prominently
- ✅ Display price clearly
- ✅ Show badges (veg, spicy, bestseller)
- ✅ Category filters
- ✅ Search functionality
- ✅ Language toggle in header

### **Cart:**
- ✅ Show selected variants/options
- ✅ Allow quantity adjustment
- ✅ Show subtotal per item
- ✅ Clear total calculation
- ✅ Special instructions field

### **Order Tracking:**
- ✅ Progress bar for status
- ✅ Estimated time
- ✅ Real-time updates
- ✅ Item-level status

---

## 📱 Complete React Example

```javascript
import { useState, useEffect } from 'react';
import io from 'socket.io-client';

function CustomerApp() {
  const [session, setSession] = useState(null);
  const [menu, setMenu] = useState(null);
  const [cart, setCart] = useState([]);
  const [order, setOrder] = useState(null);
  const [language, setLanguage] = useState('en');
  
  // Initialize session on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const encodedData = urlParams.get('data');
    const signature = urlParams.get('s');
    
    if (encodedData && signature) {
      startQRSession(encodedData, signature)
        .then(setSession)
        .catch(console.error);
    }
  }, []);
  
  // Fetch menu when session is ready
  useEffect(() => {
    if (session) {
      fetchMenu().then(setMenu);
    }
  }, [session]);
  
  // Setup real-time updates when order is placed
  useEffect(() => {
    if (order) {
      const socket = setupRealtimeUpdates(order._id);
      return () => socket.disconnect();
    }
  }, [order]);
  
  if (!session) return <div>Loading session...</div>;
  if (!menu) return <div>Loading menu...</div>;
  
  return (
    <div className="customer-app">
      <Header 
        restaurant={menu.restaurant}
        table={menu.tableNumber}
        language={language}
        onLanguageChange={setLanguage}
      />
      
      {!order ? (
        <>
          <Menu 
            items={menu.menus}
            language={language}
            onAddToCart={(item) => setCart([...cart, item])}
          />
          
          <Cart 
            items={cart}
            onCheckout={async () => {
              const newOrder = await placeOrder(cart);
              setOrder(newOrder);
              setCart([]);
            }}
          />
        </>
      ) : (
        <OrderTracking order={order} language={language} />
      )}
    </div>
  );
}
```

---

## 🚀 Quick Start Checklist

- [ ] 1. Scan QR code and extract `data` and `s` parameters
- [ ] 2. Call `/api/v1/sessions/start` to get session token
- [ ] 3. Store token in localStorage
- [ ] 4. Fetch menu from `/api/v1/menu/public`
- [ ] 5. Display menu with language toggle
- [ ] 6. Implement cart functionality
- [ ] 7. Place order via `/api/v1/orders`
- [ ] 8. Connect Socket.IO for real-time updates
- [ ] 9. Add feedback functionality
- [ ] 10. Test end-to-end flow

---

## 📚 API Reference Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/sessions/start?data=...&s=...` | POST | Start QR session |
| `/api/v1/menu/public` | GET | Get public menu |
| `/api/v1/orders` | POST | Place order |
| `/api/v1/orders/history` | GET | Order history |
| `/api/v1/feedback` | POST | Overall feedback |
| `/api/v1/feedback/item` | POST | Item feedback |
| `/api/v1/sessions/:id/free` | PATCH | End session |

---

## ✅ Status

**Everything is ready and working!** 🎉

- ✅ Feature guard fixed
- ✅ Circular dependency resolved
- ✅ All endpoints tested
- ✅ Real-time updates working
- ✅ Multilingual support complete

**You can now build the frontend app!**
