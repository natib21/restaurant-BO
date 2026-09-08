# 🍽️ Customer QR Menu App - Complete Frontend Integration Guide

## 📱 Application Overview

**Purpose:** Customer-facing mobile/web app for scanning QR codes, browsing menus, placing orders, and tracking food preparation.

**Tech Stack:** Any (React, Vue, Angular, React Native, Flutter, etc.)

**Base URL:** `http://localhost:8000` (development) or `https://your-api.com` (production)

---

## 🎯 Complete Integration Flow (Step-by-Step)

### **Flow Diagram:**
```
Customer Scans QR
    ↓
1. Parse QR URL → Extract data & signature
    ↓
2. POST /sessions/start → Get sessionToken
    ↓
3. GET /menus/public → Display menu
    ↓
4. Customer adds items to cart
    ↓
5. POST /orders → Place order
    ↓
6. GET /orders/:id (polling) → Track status
    ↓
7. [OPTIONAL] POST /customer/login → Create account
    ↓
8. [OPTIONAL] Connect Telegram → Notifications
    ↓
9. [OPTIONAL] GET /customer/my-orders → Order history
    ↓
10. [OPTIONAL] POST /feedback → Submit feedback
```

---

## 🚀 Step-by-Step Implementation

---

### **STEP 1: QR Code Scanning & Parsing**

#### **What the QR Contains:**
```
http://localhost:5173/qr?data=eyJtIjoiNmE5NTMyZTQ2Yzg0ZGQ...&s=0f628654a3a5e875916b2d411aa8e4ff...
```

#### **Frontend Code:**

```javascript
// 1. Scan QR code (using camera or QR scanner library)
import QRCodeScanner from 'react-qr-reader'; // or any QR library

function QRScanScreen() {
  const handleScan = (qrUrl) => {
    if (qrUrl) {
      parseQRAndStartSession(qrUrl);
    }
  };
  
  return <QRCodeScanner onScan={handleScan} />;
}

// 2. Parse QR URL
function parseQRAndStartSession(qrUrl) {
  const url = new URL(qrUrl);
  const data = url.searchParams.get('data');
  const signature = url.searchParams.get('s');
  
  if (!data || !signature) {
    showError('Invalid QR code');
    return;
  }
  
  // Decode to see what's inside (optional, for debugging)
  const decoded = JSON.parse(atob(data));
  console.log('QR contains:', decoded);
  // { m: "merchantId", b: "branchId", t: "tableId" }
  
  // Start session
  startTableSession(data, signature);
}
```

---

### **STEP 2: Start Table Session**

#### **API Endpoint:**
```
POST /api/v1/sessions/start?data={encoded}&s={signature}
```

#### **Frontend Code:**

```javascript
const API_BASE = 'http://localhost:8000';

async function startTableSession(data, signature) {
  try {
    const response = await fetch(
      `${API_BASE}/api/v1/sessions/start?data=${data}&s=${signature}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    const result = await response.json();
    
    if (result.status === 'success') {
      // Store session data
      localStorage.setItem('sessionToken', result.data.sessionToken);
      localStorage.setItem('sessionId', result.data.sessionId);
      localStorage.setItem('tableId', result.data.tableId);
      localStorage.setItem('tableNumber', result.data.tableNumber);
      localStorage.setItem('merchantId', result.data.merchantId);
      localStorage.setItem('branchId', result.data.branchId);
      localStorage.setItem('merchantName', result.data.merchantName);
      localStorage.setItem('branchName', result.data.branchName);
      
      // Navigate to menu
      navigate('/menu');
      
      return result.data;
    } else {
      showError(result.message);
    }
  } catch (error) {
    console.error('Session start failed:', error);
    showError('Failed to connect. Please try again.');
  }
}
```

#### **Response Structure:**
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

#### **What to Store:**
```javascript
{
  sessionToken: "JWT token for auth",           // REQUIRED for all API calls
  sessionId: "Session document ID",             // For tracking
  tableId: "Table document ID",                 // Table reference
  tableNumber: "T-101",                         // Display to user
  merchantId: "Merchant ID",                    // Context
  branchId: "Branch ID",                        // Context
  merchantName: "Golden Fork Restaurant",       // Display
  branchName: "Downtown Branch"                 // Display
}
```

---

### **STEP 3: Fetch Menu**

#### **API Endpoint:**
```
GET /api/v1/menus/public
```

#### **Frontend Code:**

```javascript
async function fetchMenu() {
  const token = localStorage.getItem('sessionToken');
  
  if (!token) {
    showError('Session expired. Please scan QR again.');
    navigate('/scan');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/v1/menus/public`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      return result.data.menuGroups;
    } else {
      showError(result.message);
    }
  } catch (error) {
    console.error('Menu fetch failed:', error);
    showError('Failed to load menu');
  }
}
```

#### **Response Structure:**
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
              }
            ],
            "combos": []
          }
        ]
      }
    ]
  }
}
```

#### **Display Menu Component:**

```javascript
function MenuScreen() {
  const [menuGroups, setMenuGroups] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadMenu();
  }, []);
  
  async function loadMenu() {
    setLoading(true);
    const groups = await fetchMenu();
    setMenuGroups(groups || []);
    setLoading(false);
  }
  
  function addToCart(item, selectedOptions) {
    const cartItem = {
      menuItem: item._id,
      name: item.name,
      price: item.price,
      imageUrl: item.imageUrl,
      quantity: 1,
      selectedOptions: selectedOptions,
      specialInstructions: ''
    };
    
    setCart([...cart, cartItem]);
  }
  
  if (loading) return <LoadingSpinner />;
  
  return (
    <div>
      <h1>Menu</h1>
      {menuGroups.map(group => (
        <div key={group._id}>
          <h2>{group.name}</h2>
          <p>{group.description}</p>
          {group.items.map(item => (
            <MenuItem 
              key={item._id}
              item={item}
              onAdd={addToCart}
            />
          ))}
        </div>
      ))}
      
      <CartButton count={cart.length} onClick={() => navigate('/cart')} />
    </div>
  );
}

function MenuItem({ item, onAdd }) {
  const [selectedOptions, setSelectedOptions] = useState({});
  
  const totalPrice = calculatePrice(item.price, selectedOptions);
  
  return (
    <div className="menu-item">
      <img src={item.imageUrl} alt={item.name} />
      <h3>{item.name}</h3>
      <p>{item.description}</p>
      <p className="price">${totalPrice}</p>
      
      {!item.isAvailable && <span className="unavailable">Out of Stock</span>}
      
      {item.allergens?.length > 0 && (
        <div className="allergens">
          Allergens: {item.allergens.join(', ')}
        </div>
      )}
      
      {item.isVegetarian && <span className="badge">🌱 Vegetarian</span>}
      {item.isVegan && <span className="badge">🌿 Vegan</span>}
      
      {item.options?.map(option => (
        <OptionGroup 
          key={option.optionGroupName}
          option={option}
          onChange={(choice) => handleOptionChange(option.optionGroupName, choice)}
        />
      ))}
      
      <button 
        onClick={() => onAdd(item, selectedOptions)}
        disabled={!item.isAvailable}
      >
        Add to Cart
      </button>
    </div>
  );
}

function calculatePrice(basePrice, selectedOptions) {
  let total = basePrice;
  Object.values(selectedOptions).forEach(choice => {
    total += choice.priceModifier || 0;
  });
  return total;
}
```

---

### **STEP 4: Place Order**

#### **API Endpoint:**
```
POST /api/v1/orders
```

#### **Frontend Code:**

```javascript
async function placeOrder(cartItems, customerInfo) {
  const token = localStorage.getItem('sessionToken');
  
  const orderPayload = {
    items: cartItems.map(item => ({
      menuItem: item.menuItem,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      selectedOptions: item.selectedOptions || [],
      specialInstructions: item.specialInstructions || ''
    })),
    orderType: 'dine-in', // Always dine-in for QR orders
    customerName: customerInfo.name || '',
    customerPhone: customerInfo.phone || '',
    notes: customerInfo.notes || ''
  };
  
  try {
    const response = await fetch(`${API_BASE}/api/v1/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderPayload)
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      // Clear cart
      localStorage.removeItem('cart');
      
      // Store order ID
      localStorage.setItem('currentOrderId', result.data.order._id);
      
      // Navigate to order tracking
      navigate(`/orders/${result.data.order._id}`);
      
      return result.data.order;
    } else {
      showError(result.message);
    }
  } catch (error) {
    console.error('Order placement failed:', error);
    showError('Failed to place order');
  }
}
```

#### **Request Payload Example:**
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
  "notes": "Please serve appetizers first"
}
```

#### **Response Structure:**
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
          "priceModifiers": 100,
          "totalPrice": 600,
          "itemStatus": "pending"
        }
      ],
      "subtotal": 600,
      "tax": 90,
      "total": 690,
      "createdAt": "2026-08-22T14:30:00.000Z",
      "estimatedReadyTime": "2026-08-22T14:50:00.000Z"
    }
  }
}
```

---

### **STEP 5: Track Order Status (Polling)**

#### **API Endpoint:**
```
GET /api/v1/orders/:orderId
```

#### **Frontend Code:**

```javascript
function OrderTrackingScreen({ orderId }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Initial fetch
    fetchOrderStatus();
    
    // Poll every 5 seconds
    const pollInterval = setInterval(fetchOrderStatus, 5000);
    
    // Cleanup on unmount
    return () => clearInterval(pollInterval);
  }, [orderId]);
  
  async function fetchOrderStatus() {
    const token = localStorage.getItem('sessionToken');
    
    try {
      const response = await fetch(
        `${API_BASE}/api/v1/orders/${orderId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      const result = await response.json();
      
      if (result.status === 'success') {
        setOrder(result.data.order);
        setLoading(false);
        
        // Stop polling if order is completed
        if (result.data.order.status === 'completed') {
          // Show feedback prompt
          promptFeedback(result.data.order);
        }
      }
    } catch (error) {
      console.error('Order fetch failed:', error);
    }
  }
  
  if (loading) return <LoadingSpinner />;
  if (!order) return <div>Order not found</div>;
  
  return (
    <div className="order-tracking">
      <h1>Order #{order.orderNumber}</h1>
      <OrderStatusBadge status={order.status} />
      
      <div className="progress-bar">
        <Step active={order.status === 'pending'} label="Received" />
        <Step active={order.status === 'accepted'} label="Accepted" />
        <Step active={order.status === 'preparing'} label="Preparing" />
        <Step active={order.status === 'ready'} label="Ready" />
        <Step active={order.status === 'served'} label="Served" />
      </div>
      
      <div className="order-items">
        <h2>Your Items</h2>
        {order.items.map((item, index) => (
          <div key={index} className="order-item">
            <span>{item.quantity}x {item.name}</span>
            <ItemStatusBadge status={item.itemStatus} />
          </div>
        ))}
      </div>
      
      <div className="order-summary">
        <p>Subtotal: ${order.subtotal}</p>
        <p>Tax: ${order.tax}</p>
        <h3>Total: ${order.total}</h3>
      </div>
      
      {order.estimatedReadyTime && (
        <p>Estimated ready: {formatTime(order.estimatedReadyTime)}</p>
      )}
    </div>
  );
}

function OrderStatusBadge({ status }) {
  const statusConfig = {
    pending: { label: 'Order Received', color: 'yellow', icon: '📋' },
    accepted: { label: 'Accepted', color: 'blue', icon: '✓' },
    preparing: { label: 'Preparing', color: 'orange', icon: '👨‍🍳' },
    ready: { label: 'Ready', color: 'green', icon: '✓✓' },
    served: { label: 'Served', color: 'green', icon: '🍽️' },
    completed: { label: 'Completed', color: 'gray', icon: '✓✓✓' }
  };
  
  const config = statusConfig[status] || statusConfig.pending;
  
  return (
    <div className={`status-badge ${config.color}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </div>
  );
}
```

---

### **STEP 6: Create Customer Account (Optional)**

#### **API Endpoint:**
```
POST /api/v1/customer/login
```

#### **Frontend Code:**

```javascript
async function createCustomerAccount(name, phone, email) {
  const token = localStorage.getItem('sessionToken');
  
  try {
    const response = await fetch(`${API_BASE}/api/v1/customer/login`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        phone: phone,
        email: email || ''
      })
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      // Store customer info
      localStorage.setItem('customerId', result.data.customer._id);
      localStorage.setItem('customerName', result.data.customer.name);
      localStorage.setItem('loyaltyPoints', result.data.customer.loyalty.points);
      localStorage.setItem('loyaltyTier', result.data.customer.loyalty.tier);
      
      return result.data.customer;
    } else {
      showError(result.message);
    }
  } catch (error) {
    console.error('Account creation failed:', error);
    showError('Failed to create account');
  }
}

// Show signup prompt after first order
function promptAccountCreation() {
  return (
    <div className="signup-prompt">
      <h2>Create an account to:</h2>
      <ul>
        <li>✓ View order history</li>
        <li>✓ Earn loyalty points</li>
        <li>✓ Get Telegram notifications</li>
        <li>✓ Save favorite items</li>
      </ul>
      
      <form onSubmit={handleSignup}>
        <input 
          type="text" 
          placeholder="Name" 
          required 
        />
        <input 
          type="tel" 
          placeholder="Phone (+251...)" 
          required 
        />
        <input 
          type="email" 
          placeholder="Email (optional)" 
        />
        <button type="submit">Create Account</button>
      </form>
    </div>
  );
}
```

#### **Response:**
```json
{
  "status": "success",
  "data": {
    "customer": {
      "_id": "6a95476015b8780e437fa866",
      "name": "John Doe",
      "phone": "+251912345678",
      "email": "john@example.com",
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

### **STEP 7: Connect Telegram (Optional)**

#### **Frontend Code:**

```javascript
function TelegramConnectButton() {
  const merchantId = localStorage.getItem('merchantId');
  const customerId = localStorage.getItem('customerId');
  
  if (!customerId) {
    return <p>Create an account first to connect Telegram</p>;
  }
  
  const telegramBotUrl = `https://t.me/YourRestaurantBot?start=${merchantId}_${customerId}`;
  
  return (
    <div className="telegram-connect">
      <h3>Get Order Updates on Telegram</h3>
      <p>Receive instant notifications when your food is ready!</p>
      
      <button onClick={() => window.open(telegramBotUrl, '_blank')}>
        <TelegramIcon /> Connect Telegram
      </button>
      
      {/* Or show QR code */}
      <QRCode value={telegramBotUrl} size={200} />
    </div>
  );
}

// Check if Telegram is connected
async function checkTelegramStatus() {
  const token = localStorage.getItem('sessionToken');
  
  const response = await fetch(`${API_BASE}/api/v1/customer/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const result = await response.json();
  
  if (result.status === 'success') {
    const isConnected = result.data.customer.telegram?.optIn === true;
    return {
      isConnected,
      username: result.data.customer.telegram?.username
    };
  }
}
```

---

### **STEP 8: View Order History (Optional)**

#### **API Endpoint:**
```
GET /api/v1/customer/my-orders?page=1&limit=10
```

#### **Frontend Code:**

```javascript
async function fetchOrderHistory(page = 1, limit = 10) {
  const token = localStorage.getItem('sessionToken');
  
  try {
    const response = await fetch(
      `${API_BASE}/api/v1/customer/my-orders?page=${page}&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    const result = await response.json();
    
    if (result.status === 'success') {
      return {
        orders: result.data.orders,
        total: result.total,
        page: result.page
      };
    }
  } catch (error) {
    console.error('Order history fetch failed:', error);
  }
}

function OrderHistoryScreen() {
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadOrders();
  }, [page]);
  
  async function loadOrders() {
    setLoading(true);
    const data = await fetchOrderHistory(page, 10);
    setOrders(data.orders || []);
    setLoading(false);
  }
  
  function reorder(order) {
    // Pre-fill cart with items from this order
    const cartItems = order.items.map(item => ({
      menuItem: item.menuItem,
      name: item.name,
      price: item.unitPrice,
      quantity: item.quantity,
      selectedOptions: item.selectedOptions || []
    }));
    
    localStorage.setItem('cart', JSON.stringify(cartItems));
    navigate('/cart');
  }
  
  return (
    <div className="order-history">
      <h1>Order History</h1>
      
      {loading ? <LoadingSpinner /> : (
        <div className="orders-list">
          {orders.map(order => (
            <div key={order._id} className="order-card">
              <div className="order-header">
                <h3>Order #{order.orderNumber}</h3>
                <span className="date">{formatDate(order.createdAt)}</span>
              </div>
              
              <div className="order-items">
                {order.items.map((item, idx) => (
                  <p key={idx}>{item.quantity}x {item.name}</p>
                ))}
              </div>
              
              <div className="order-footer">
                <span className="total">${order.total}</span>
                <span className={`status ${order.status}`}>
                  {order.status}
                </span>
              </div>
              
              <button onClick={() => reorder(order)}>
                Reorder
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### **STEP 9: Submit Feedback (Optional)**

#### **API Endpoint:**
```
POST /api/v1/feedback
```

#### **Frontend Code:**

```javascript
async function submitFeedback(feedbackData) {
  const token = localStorage.getItem('sessionToken');
  
  try {
    const response = await fetch(`${API_BASE}/api/v1/feedback`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(feedbackData)
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      showSuccess('Thank you for your feedback!');
      return result.data.feedback;
    } else {
      showError(result.message);
    }
  } catch (error) {
    console.error('Feedback submission failed:', error);
    showError('Failed to submit feedback');
  }
}

function FeedbackScreen({ order }) {
  const [overallRating, setOverallRating] = useState(0);
  const [comment, setComment] = useState('');
  const [categories, setCategories] = useState([]);
  const [itemRatings, setItemRatings] = useState({});
  
  async function handleSubmit(e) {
    e.preventDefault();
    
    const feedbackPayload = {
      rating: overallRating,
      comment: comment,
      categories: categories,
      channel: 'qr_table',
      order: order._id,
      isPublic: true,
      
      // Optional: Item-specific feedback
      itemFeedback: Object.entries(itemRatings)
        .filter(([_, rating]) => rating.rating > 0)
        .map(([itemId, rating]) => ({
          menuItem: itemId,
          itemName: rating.itemName,
          rating: rating.rating,
          comment: rating.comment || '',
          tags: rating.tags || [],
          wouldOrderAgain: rating.wouldOrderAgain
        }))
    };
    
    await submitFeedback(feedbackPayload);
    navigate('/');
  }
  
  return (
    <div className="feedback-screen">
      <h1>How was your experience?</h1>
      
      {/* Overall rating */}
      <div className="overall-rating">
        <StarRating value={overallRating} onChange={setOverallRating} />
      </div>
      
      {/* Comment */}
      <textarea 
        placeholder="Tell us more (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
      />
      
      {/* Categories */}
      <div className="categories">
        <h3>What would you like to rate?</h3>
        <CategoryChips 
          selected={categories}
          onChange={setCategories}
        />
      </div>
      
      {/* Item-by-item ratings (optional) */}
      <div className="item-ratings">
        <h3>Rate Individual Items (Optional)</h3>
        {order.items.map(item => (
          <ItemRating 
            key={item.menuItem}
            item={item}
            rating={itemRatings[item.menuItem]}
            onChange={(rating) => setItemRatings({
              ...itemRatings,
              [item.menuItem]: rating
            })}
          />
        ))}
      </div>
      
      <button onClick={handleSubmit} disabled={overallRating === 0}>
        Submit Feedback
      </button>
    </div>
  );
}

function CategoryChips({ selected, onChange }) {
  const categories = [
    { value: 'food_quality', label: '🍽️ Food Quality' },
    { value: 'service', label: '👨‍💼 Service' },
    { value: 'cleanliness', label: '✨ Cleanliness' },
    { value: 'ambiance', label: '🎵 Ambiance' },
    { value: 'delivery_time', label: '⏱️ Speed' },
    { value: 'value_for_money', label: '💰 Value' }
  ];
  
  function toggle(value) {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }
  
  return (
    <div className="category-chips">
      {categories.map(cat => (
        <button
          key={cat.value}
          className={selected.includes(cat.value) ? 'active' : ''}
          onClick={() => toggle(cat.value)}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
```

---

## 🔐 Authentication Helper

#### **Create an API Service File:**

```javascript
// services/api.js

const API_BASE = 'http://localhost:8000';

class APIService {
  constructor() {
    this.baseURL = API_BASE;
  }
  
  getHeaders() {
    const token = localStorage.getItem('sessionToken');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }
  
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers
      }
    };
    
    try {
      const response = await fetch(url, config);
      const result = await response.json();
      
      if (result.status === 'success') {
        return result.data;
      } else {
        throw new Error(result.message || 'Request failed');
      }
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }
  
  // Session
  startSession(data, signature) {
    return this.request(`/api/v1/sessions/start?data=${data}&s=${signature}`, {
      method: 'POST'
    });
  }
  
  // Menu
  getMenu() {
    return this.request('/api/v1/menus/public');
  }
  
  // Orders
  placeOrder(orderData) {
    return this.request('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });
  }
  
  getOrder(orderId) {
    return this.request(`/api/v1/orders/${orderId}`);
  }
  
  // Customer
  createAccount(name, phone, email) {
    return this.request('/api/v1/customer/login', {
      method: 'POST',
      body: JSON.stringify({ name, phone, email })
    });
  }
  
  getProfile() {
    return this.request('/api/v1/customer/me');
  }
  
  getOrderHistory(page = 1, limit = 10) {
    return this.request(`/api/v1/customer/my-orders?page=${page}&limit=${limit}`);
  }
  
  // Feedback
  submitFeedback(feedbackData) {
    return this.request('/api/v1/feedback', {
      method: 'POST',
      body: JSON.stringify(feedbackData)
    });
  }
}

export default new APIService();
```

#### **Usage:**

```javascript
import API from './services/api';

// Start session
const sessionData = await API.startSession(data, signature);

// Get menu
const menuGroups = await API.getMenu();

// Place order
const order = await API.placeOrder(orderPayload);

// Track order
const orderStatus = await API.getOrder(orderId);
```

---

## 📊 Complete Endpoint Reference

| # | Endpoint | Method | Auth | Purpose |
|---|----------|--------|------|---------|
| 1 | `/api/v1/sessions/start` | POST | None | Start table session from QR |
| 2 | `/api/v1/menus/public` | GET | Session Token | Get full menu |
| 3 | `/api/v1/orders` | POST | Session Token | Place order |
| 4 | `/api/v1/orders/:id` | GET | Session Token | Track order status |
| 5 | `/api/v1/customer/login` | POST | Session Token | Create/login customer |
| 6 | `/api/v1/customer/me` | GET | Session Token | Get customer profile |
| 7 | `/api/v1/customer/my-orders` | GET | Session Token | Order history |
| 8 | `/api/v1/feedback` | POST | Session Token | Submit feedback |

---

## ✅ Implementation Checklist

### **Core Features (MVP):**
- [ ] QR code scanner integration
- [ ] Parse QR URL and extract data/signature
- [ ] Call `/sessions/start` and store sessionToken
- [ ] Display merchant name and table number
- [ ] Fetch and display menu with categories
- [ ] Show menu item images, prices, allergens
- [ ] Implement cart functionality
- [ ] Handle menu item options/modifiers
- [ ] Calculate total with price modifiers
- [ ] Place order API call
- [ ] Order confirmation screen
- [ ] Order tracking with status polling
- [ ] Display order status progress
- [ ] Error handling for all API calls
- [ ] Session expiry handling

### **Enhanced Features (Phase 2):**
- [ ] Account creation prompt after first order
- [ ] Customer signup form
- [ ] Display loyalty points
- [ ] Telegram connection button
- [ ] Order history screen
- [ ] Reorder functionality
- [ ] Feedback submission form
- [ ] Star rating component
- [ ] Category selection chips
- [ ] Item-by-item rating UI
- [ ] Photo upload for feedback

### **Polish & Optimization:**
- [ ] Loading states for all API calls
- [ ] Offline detection
- [ ] Session persistence across page refresh
- [ ] Smooth animations
- [ ] Responsive design (mobile-first)
- [ ] Accessibility (ARIA labels, keyboard nav)
- [ ] Analytics integration
- [ ] Push notifications (if PWA)
- [ ] Dark mode support

---

## 🎨 Screen Flow

```
[QR Scanner]
    ↓
[Session Loading]
    ↓
[Menu Browse] ← Categories, Search, Filter
    ↓
[Item Detail] ← Options, Add to Cart
    ↓
[Cart] ← Edit quantities, Remove items
    ↓
[Checkout] ← Customer info (optional)
    ↓
[Order Confirmation]
    ↓
[Order Tracking] ← Real-time status updates
    ↓
[Order Complete]
    ↓
[Feedback Prompt] (optional)
    ↓
[Account Creation] (optional)
    ↓
[Order History] (if account created)
```

---

## 🚨 Error Handling

```javascript
// Handle common errors
function handleAPIError(error, context) {
  if (error.message.includes('Session expired')) {
    // Clear session and redirect to QR scan
    localStorage.clear();
    navigate('/scan');
    showError('Session expired. Please scan QR again.');
  } else if (error.message.includes('not available')) {
    showError('This item is currently unavailable');
  } else if (error.message.includes('network')) {
    showError('Network error. Please check your connection.');
  } else {
    showError(error.message || 'Something went wrong');
  }
}
```

---

## 📖 Related Documentation

- [QR-CUSTOMER-WORKFLOW.md](./QR-CUSTOMER-WORKFLOW.md) - Detailed customer journey
- [QR-ENDPOINTS-QUICK-REFERENCE.md](./QR-ENDPOINTS-QUICK-REFERENCE.md) - Quick API reference
- [FEEDBACK-SYSTEM-GUIDE.md](./FEEDBACK-SYSTEM-GUIDE.md) - Feedback implementation details

---

**Your customer app is ready to integrate! Start with the QR scanner and work through each step sequentially.** 🚀
