# QR Customer App - Quick Start Guide

## 🚀 5-Minute Integration

### **Step 1: Scan QR & Get Session**
```javascript
// QR contains: http://yourapp.com/qr?data={encoded}&s={signature}
const { data, s } = parseQueryParams(window.location.search);

const response = await fetch(
  `${API_BASE}/api/v1/sessions/start?data=${data}&s=${s}`,
  { method: 'POST' }
);

const { sessionToken, merchantId, branchId, tableId, tableNumber } = response.data;
localStorage.setItem('sessionToken', sessionToken);
```

### **Step 2: Fetch Menu**
```javascript
const response = await fetch(`${API_BASE}/api/v1/menu/public`, {
  headers: {
    'Authorization': `Bearer ${sessionToken}`
  }
});

const { menus, specialOffers } = response.data;
```

### **Step 3: Display Menu (Multilingual)**
```javascript
const [language, setLanguage] = useState('en'); // or 'am'

{menus.map(item => (
  <div key={item.id}>
    <img src={item.image} alt={item.name[language]} />
    <h3>{item.name[language]}</h3>
    <p>{item.description[language]}</p>
    <span>{item.category?.name[language]}</span>
    <strong>{item.price} ETB</strong>
    <button onClick={() => addToCart(item)}>Add to Cart</button>
  </div>
))}
```

### **Step 4: Place Order**
```javascript
const placeOrder = async (cartItems) => {
  const payload = {
    items: cartItems.map(item => ({
      menuItemId: item.id,
      name: item.name.en,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.price * item.quantity,
      selectedVariant: item.selectedVariant, // if applicable
      selectedOptions: item.selectedOptions // if applicable
    })),
    branchId,
    table: tableNumber,
    customerName: customerName || 'Guest',
    customerPhone: customerPhone || null,
    subtotal: calculateSubtotal(cartItems),
    totalAmount: calculateTotal(cartItems),
    notes: specialInstructions
  };

  const response = await fetch(`${API_BASE}/api/v1/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const { order } = response.data;
  return order;
};
```

### **Step 5: Upload Payment Receipt**
```javascript
const verifyPayment = async (orderId, receiptFile) => {
  const formData = new FormData();
  formData.append('orderId', orderId);
  formData.append('provider', 'cbe'); // or 'cbebirr', 'telebirr'
  formData.append('receiptImage', receiptFile);
  formData.append('transactionId', transactionId); // optional

  const response = await fetch(`${API_BASE}/api/v1/payment-verification/verify`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`
    },
    body: formData
  });

  return response.data;
};
```

### **Step 6: Track Order**
```javascript
// Get specific order
const order = await fetch(`${API_BASE}/api/v1/orders/${orderId}`, {
  headers: { 'Authorization': `Bearer ${sessionToken}` }
});

// Get all active orders
const activeOrders = await fetch(`${API_BASE}/api/v1/customer/orders/active`, {
  headers: { 'Authorization': `Bearer ${sessionToken}` }
});

// Order status progression:
// pending → accepted → preparing → ready → served → completed
```

### **Step 7: Free Table on Exit**
```javascript
const leaveTable = async (sessionId) => {
  await fetch(`${API_BASE}/api/v1/sessions/${sessionId}/free`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${sessionToken}` }
  });
  
  localStorage.removeItem('sessionToken');
};
```

---

## 🔑 Essential Headers

```javascript
// All authenticated requests need:
headers: {
  'Authorization': `Bearer ${sessionToken}`,
  'Content-Type': 'application/json' // except file uploads
}
```

---

## 🌐 Multilingual Fields

Every localized field returns BOTH languages:
```json
{
  "name": { "en": "English", "am": "አማርኛ" },
  "description": { "en": "English", "am": "አማርኛ" }
}
```

Frontend selects language:
```javascript
item.name[language] // language = 'en' or 'am'
```

---

## ⚠️ Error Handling

```javascript
try {
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const error = await response.json();
    
    switch (response.status) {
      case 401:
        // Session expired - redirect to QR scan
        redirectToQRScan();
        break;
      case 403:
        // Not allowed - show error
        showError(error.message);
        break;
      case 404:
        // Not found
        showError('Resource not found');
        break;
      case 500:
        // Server error
        showError('Something went wrong. Please try again.');
        break;
      default:
        showError(error.message);
    }
  }
  
  return response.json();
} catch (error) {
  showError('Network error. Please check your connection.');
}
```

---

## 📱 Complete React Hook Example

```javascript
import { useState, useEffect } from 'react';

export const useCustomerApp = () => {
  const [session, setSession] = useState(null);
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);

  // Initialize session from QR
  const initSession = async (data, signature) => {
    const response = await fetch(
      `${API_BASE}/api/v1/sessions/start?data=${data}&s=${signature}`,
      { method: 'POST' }
    );
    const sessionData = await response.json();
    setSession(sessionData.data);
    localStorage.setItem('sessionToken', sessionData.data.sessionToken);
    return sessionData.data;
  };

  // Fetch menu
  const fetchMenu = async () => {
    setLoading(true);
    const response = await fetch(`${API_BASE}/api/v1/menu/public`, {
      headers: { 'Authorization': `Bearer ${session.sessionToken}` }
    });
    const data = await response.json();
    setMenu(data.data.menus);
    setLoading(false);
  };

  // Add to cart
  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => 
          i.id === item.id 
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  // Place order
  const placeOrder = async (customerName, notes = '') => {
    const payload = {
      items: cart.map(item => ({
        menuItemId: item.id,
        name: item.name.en,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity
      })),
      branchId: session.branchId,
      table: session.tableNumber,
      customerName,
      subtotal: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
      totalAmount: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
      notes
    };

    const response = await fetch(`${API_BASE}/api/v1/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    setCart([]); // Clear cart
    return data.data.order;
  };

  return {
    session,
    menu,
    cart,
    language,
    loading,
    initSession,
    fetchMenu,
    addToCart,
    placeOrder,
    setLanguage
  };
};
```

---

## 🎨 UI Component Example

```jsx
function MenuPage() {
  const { menu, cart, language, addToCart, setLanguage } = useCustomerApp();

  return (
    <div>
      {/* Language Switcher */}
      <div>
        <button onClick={() => setLanguage('en')}>English</button>
        <button onClick={() => setLanguage('am')}>አማርኛ</button>
      </div>

      {/* Menu Items */}
      <div className="menu-grid">
        {menu.map(item => (
          <div key={item.id} className="menu-item">
            <img src={item.image} alt={item.name[language]} />
            <h3>{item.name[language]}</h3>
            <p>{item.description[language]}</p>
            <div className="meta">
              <span className="category">{item.category?.name[language]}</span>
              {item.isVeg && <span className="badge">🌱 Veg</span>}
              {item.isSpicy && <span className="badge">🌶️ Spicy</span>}
            </div>
            <div className="price-action">
              <strong>{item.price} ETB</strong>
              <button onClick={() => addToCart(item)}>
                {language === 'en' ? 'Add to Cart' : 'ወደ ጋሪ ጨምር'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Cart Badge */}
      <div className="cart-badge">
        🛒 {cart.length} items
      </div>
    </div>
  );
}
```

---

## ✅ Checklist

**Before Testing:**
- [ ] Merchant subscription is active
- [ ] Orders feature is enabled
- [ ] Menu items are published
- [ ] Table QR codes are generated
- [ ] Session endpoint is working

**During Testing:**
- [ ] QR scan creates valid session
- [ ] Menu loads with all items
- [ ] Language switching works
- [ ] Cart operations work
- [ ] Order placement succeeds
- [ ] Payment upload works
- [ ] Session extends on activity

---

## 🆘 Quick Troubleshooting

| Error | Solution |
|-------|----------|
| 403 "subscription not active" | Check merchant `isSubscriptionActive: true` |
| 403 "orders not enabled" | Check `features.optional.orders.enabled: true` |
| 401 "session expired" | Refresh session or scan QR again |
| Empty menu | Check `publishStatus: 'published'`, `available: true` |
| Missing categories | Check category is populated in menu item |
| Images not loading | Check image URL format |

---

## 📖 Full Documentation

- **Complete Guide:** `CUSTOMER-APP-FRONTEND-INTEGRATION.md`
- **API Reference:** `QR-ENDPOINTS-QUICK-REFERENCE.md`
- **Workflow Details:** `QR-CUSTOMER-WORKFLOW.md`
- **Summary:** `QR-CUSTOMER-APP-COMPLETE-SUMMARY.md`

---

**Happy Coding!** 🚀
