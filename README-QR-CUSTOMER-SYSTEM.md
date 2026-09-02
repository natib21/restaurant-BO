# QR Customer Ordering System - Master Documentation

## 📚 Documentation Index

This folder contains complete documentation for the QR customer ordering system.

---

## 🎯 Quick Start

**For Frontend Developers:**
1. Read [`CUSTOMER-APP-COMPLETE-INTEGRATION-GUIDE.md`](./CUSTOMER-APP-COMPLETE-INTEGRATION-GUIDE.md) - Complete integration guide with code examples
2. Reference [`QR-ENDPOINTS-QUICK-REFERENCE.md`](./QR-ENDPOINTS-QUICK-REFERENCE.md) - API quick reference
3. Follow [`QR-CUSTOMER-WORKFLOW.md`](./QR-CUSTOMER-WORKFLOW.md) - Step-by-step workflow

**For Backend Developers:**
1. Read [`QR-CUSTOMER-ORDER-COMPLETE-FIX-SUMMARY.md`](./QR-CUSTOMER-ORDER-COMPLETE-FIX-SUMMARY.md) - Recent bug fixes
2. Review [`QR-CUSTOMER-FEATURE-GUARD-FIX.md`](./QR-CUSTOMER-FEATURE-GUARD-FIX.md) - Feature guard implementation
3. Check [`QR-ORDER-CIRCULAR-DEPENDENCY-FIX.md`](./QR-ORDER-CIRCULAR-DEPENDENCY-FIX.md) - Circular dependency solution

---

## 📖 Complete Documentation List

### **Integration Guides**
| Document | Purpose | Audience |
|----------|---------|----------|
| [`CUSTOMER-APP-COMPLETE-INTEGRATION-GUIDE.md`](./CUSTOMER-APP-COMPLETE-INTEGRATION-GUIDE.md) | **START HERE** - Complete frontend integration with React examples | Frontend Developers |
| [`CUSTOMER-APP-FRONTEND-INTEGRATION.md`](./CUSTOMER-APP-FRONTEND-INTEGRATION.md) | Alternative frontend integration guide | Frontend Developers |
| [`QR-CUSTOMER-WORKFLOW.md`](./QR-CUSTOMER-WORKFLOW.md) | Detailed workflow with request/response examples | All Developers |
| [`QR-ENDPOINTS-QUICK-REFERENCE.md`](./QR-ENDPOINTS-QUICK-REFERENCE.md) | Quick API reference table | All Developers |

### **Feature Guides**
| Document | Purpose | Audience |
|----------|---------|----------|
| [`FEEDBACK-SYSTEM-GUIDE.md`](./FEEDBACK-SYSTEM-GUIDE.md) | Overall & item-specific feedback implementation | Frontend Developers |
| [`FEEDBACK-QUICK-EXAMPLES.md`](./FEEDBACK-QUICK-EXAMPLES.md) | Visual feedback examples | Frontend Developers |
| [`QR-CUSTOMER-FEATURE-MATRIX.md`](./QR-CUSTOMER-FEATURE-MATRIX.md) | Complete feature breakdown | Product Managers |
| [`CUSTOMER-SOCKET-IO-REALTIME-GUIDE.md`](./CUSTOMER-SOCKET-IO-REALTIME-GUIDE.md) | Real-time order updates via Socket.IO | Frontend Developers |

### **Technical Fixes**
| Document | Purpose | Audience |
|----------|---------|----------|
| [`QR-CUSTOMER-ORDER-COMPLETE-FIX-SUMMARY.md`](./QR-CUSTOMER-ORDER-COMPLETE-FIX-SUMMARY.md) | Master summary of all fixes | Backend Developers |
| [`QR-CUSTOMER-FEATURE-GUARD-FIX.md`](./QR-CUSTOMER-FEATURE-GUARD-FIX.md) | Feature guard fix details | Backend Developers |
| [`QR-ORDER-CIRCULAR-DEPENDENCY-FIX.md`](./QR-ORDER-CIRCULAR-DEPENDENCY-FIX.md) | Circular dependency solution | Backend Developers |

---

## 🎯 System Overview

### **What It Does**
Restaurant customers scan a QR code at their table to:
- ✅ Browse digital menu (English/Amharic)
- ✅ Place orders directly
- ✅ Track order status in real-time
- ✅ Request waiter assistance
- ✅ View order history
- ✅ Leave feedback

### **Key Features**
1. **QR Code Session Management** - Secure table-based sessions
2. **Multilingual Support** - Full English/Amharic localization
3. **Real-time Updates** - Socket.IO for live order status
4. **Feature-rich Menu** - Images, variants, options, nutrition info
5. **Feedback System** - Overall & item-specific ratings
6. **Order History** - View past orders from session

---

## 🔧 Technical Architecture

### **Backend Stack**
- Node.js + Express
- MongoDB + Mongoose
- Socket.IO (real-time)
- JWT-based session tokens

### **Key Endpoints**
```
POST   /api/v1/sessions/start      - Start QR session
GET    /api/v1/menu/public         - Get public menu
POST   /api/v1/orders              - Place order
GET    /api/v1/orders/history      - Order history
POST   /api/v1/feedback            - Submit feedback
PATCH  /api/v1/sessions/:id/free   - End session
```

### **Authentication**
All customer requests use session-based bearer tokens:
```javascript
headers: {
  'Authorization': `Bearer <session-token>`
}
```

---

## 🚀 Quick Integration Steps

### **Frontend (5 Steps)**

```javascript
// 1. Decode QR code
const { data, s } = extractQRParams(qrUrl);

// 2. Start session
const session = await fetch(
  `/api/v1/sessions/start?data=${data}&s=${s}`,
  { method: 'POST' }
).then(r => r.json());

// 3. Save token
localStorage.setItem('token', session.data.token);

// 4. Fetch menu
const menu = await fetch('/api/v1/menu/public', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());

// 5. Place order
const order = await fetch('/api/v1/orders', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(orderData)
}).then(r => r.json());
```

**Done!** See [`CUSTOMER-APP-COMPLETE-INTEGRATION-GUIDE.md`](./CUSTOMER-APP-COMPLETE-INTEGRATION-GUIDE.md) for full implementation.

---

## 🐛 Recent Fixes (August 2026)

### **Fixed: Customer Orders Blocked by Feature Guard**
- **Problem:** QR customer orders were rejected with "subscription not active"
- **Solution:** Populated full merchant object in session guard
- **Status:** ✅ Fixed and tested

### **Fixed: Circular Dependency Error**
- **Problem:** OrderService was undefined, causing "Cannot read properties"
- **Solution:** Implemented lazy loading pattern
- **Status:** ✅ Fixed and tested

**Details:** See [`QR-CUSTOMER-ORDER-COMPLETE-FIX-SUMMARY.md`](./QR-CUSTOMER-ORDER-COMPLETE-FIX-SUMMARY.md)

---

## 🧪 Testing

### **Run Tests**
```bash
npm test tests/customer-order-qr-fix.test.js
```

**Expected:**
```
✓ should allow customer order request to pass feature guard
✓ should reject order if merchant subscription is inactive
✓ should reject order if merchant is inactive  
✓ should reject order if orders feature is disabled

Tests: 4 passed, 4 total
```

### **Manual Testing**
```bash
# 1. Start session
curl -X POST 'http://localhost:8000/api/v1/sessions/start?data=eyJ...&s=abc'

# 2. Get menu
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/v1/menu/public

# 3. Place order
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{...order payload...}'
```

---

## 📱 Frontend Example (React)

```javascript
import { useState, useEffect } from 'react';

function CustomerApp() {
  const [session, setSession] = useState(null);
  const [menu, setMenu] = useState(null);
  const [language, setLanguage] = useState('en');
  
  // Auto-start session from QR
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const data = params.get('data');
    const s = params.get('s');
    
    if (data && s) {
      fetch(`/api/v1/sessions/start?data=${data}&s=${s}`, {
        method: 'POST'
      })
      .then(r => r.json())
      .then(result => {
        localStorage.setItem('token', result.data.token);
        setSession(result.data);
      });
    }
  }, []);
  
  // Fetch menu
  useEffect(() => {
    if (session) {
      const token = localStorage.getItem('token');
      fetch('/api/v1/menu/public', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(r => r.json())
      .then(result => setMenu(result.data));
    }
  }, [session]);
  
  if (!menu) return <div>Loading...</div>;
  
  return (
    <div>
      <h1>{menu.restaurant}</h1>
      <p>Table: {menu.tableNumber}</p>
      
      <button onClick={() => setLanguage('en')}>English</button>
      <button onClick={() => setLanguage('am')}>አማርኛ</button>
      
      {menu.menus.map(item => (
        <div key={item.id}>
          <h3>{item.name[language]}</h3>
          <p>{item.description[language]}</p>
          <p>{item.price} Birr</p>
        </div>
      ))}
    </div>
  );
}
```

---

## 🎓 Learning Path

### **For Beginners:**
1. Start with [`QR-CUSTOMER-WORKFLOW.md`](./QR-CUSTOMER-WORKFLOW.md) - Understand the flow
2. Read [`QR-ENDPOINTS-QUICK-REFERENCE.md`](./QR-ENDPOINTS-QUICK-REFERENCE.md) - Learn the APIs
3. Follow [`CUSTOMER-APP-COMPLETE-INTEGRATION-GUIDE.md`](./CUSTOMER-APP-COMPLETE-INTEGRATION-GUIDE.md) - Build the app

### **For Advanced Developers:**
1. Review [`QR-CUSTOMER-FEATURE-GUARD-FIX.md`](./QR-CUSTOMER-FEATURE-GUARD-FIX.md) - Understand authentication
2. Study [`QR-ORDER-CIRCULAR-DEPENDENCY-FIX.md`](./QR-ORDER-CIRCULAR-DEPENDENCY-FIX.md) - Learn patterns
3. Check [`CUSTOMER-SOCKET-IO-REALTIME-GUIDE.md`](./CUSTOMER-SOCKET-IO-REALTIME-GUIDE.md) - Implement real-time

---

## 🔐 Security

### **Session Management**
- ✅ QR codes include signed data (HMAC)
- ✅ Sessions expire after 4 hours
- ✅ Tokens are validated on every request
- ✅ Merchant subscription checked

### **Feature Guard**
- ✅ Validates merchant is active
- ✅ Checks subscription status
- ✅ Verifies orders feature is enabled

---

## 📊 Menu Data Structure

```javascript
{
  "id": "6a9533328bc68bc64ec6b679",
  
  // Multilingual fields
  "name": {
    "en": "Grilled Chicken",
    "am": "የተጠበሰ ዶሮ"
  },
  "description": {
    "en": "Juicy grilled...",
    "am": "ጣፋጭ..."
  },
  
  // Pricing
  "price": 245,
  "variants": [
    { "name": "Regular", "price": 245 },
    { "name": "Large", "price": 350 }
  ],
  "options": [
    { "name": "Extra Cheese", "price": 25 }
  ],
  
  // Category
  "category": {
    "_id": "...",
    "name": { "en": "Main Course", "am": "ዋና ምግብ" },
    "icon": "🍗",
    "color": "#FF5722"
  },
  
  // Metadata
  "isVeg": false,
  "isSpicy": true,
  "isAlcoholic": false,
  "prepTime": "15-25 min",
  "rating": 4.5,
  "ratingCount": 128,
  "isAvailable": true,
  
  // Detailed info
  "ingredients": ["Chicken", "Vegetables", "Spices"],
  "allergens": ["None"],
  "nutritionInfo": {
    "calories": 450,
    "protein": 35,
    "carbs": 20,
    "fat": 25
  },
  "tags": ["bestseller", "trending"],
  
  // Images
  "image": "http://localhost:8000/api/v1/files/abc123/content",
  "imagePath": "/uploads/abc123.jpg"
}
```

---

## 🎯 Order Status Flow

```
pending → accepted → preparing → ready → served → completed
         ↓                                          ↓
      canceled                                  feedback
```

**Real-time updates via Socket.IO**

---

## 📞 Support

### **Documentation Issues**
- File an issue with the tag `documentation`
- Suggest improvements via PR

### **Backend Issues**
- Check [`QR-CUSTOMER-ORDER-COMPLETE-FIX-SUMMARY.md`](./QR-CUSTOMER-ORDER-COMPLETE-FIX-SUMMARY.md)
- Review test file: `tests/customer-order-qr-fix.test.js`

### **Integration Questions**
- See [`CUSTOMER-APP-COMPLETE-INTEGRATION-GUIDE.md`](./CUSTOMER-APP-COMPLETE-INTEGRATION-GUIDE.md)
- Check API reference: [`QR-ENDPOINTS-QUICK-REFERENCE.md`](./QR-ENDPOINTS-QUICK-REFERENCE.md)

---

## ✅ System Status

**Backend:** ✅ Ready for Production
- [x] Feature guard fixed
- [x] Circular dependency resolved
- [x] All tests passing
- [x] Real-time updates working
- [x] Multilingual support complete

**Frontend:** 📝 Ready for Development
- [x] Complete integration guide available
- [x] API documentation complete
- [x] Example code provided
- [x] All endpoints tested

---

## 🚀 Next Steps

1. **Frontend Team:** Start with [`CUSTOMER-APP-COMPLETE-INTEGRATION-GUIDE.md`](./CUSTOMER-APP-COMPLETE-INTEGRATION-GUIDE.md)
2. **Backend Team:** Review [`QR-CUSTOMER-ORDER-COMPLETE-FIX-SUMMARY.md`](./QR-CUSTOMER-ORDER-COMPLETE-FIX-SUMMARY.md)
3. **Everyone:** Bookmark [`QR-ENDPOINTS-QUICK-REFERENCE.md`](./QR-ENDPOINTS-QUICK-REFERENCE.md)

---

## 📝 Version History

**v1.0.0 (August 2026)**
- ✅ Initial release
- ✅ Feature guard fix
- ✅ Circular dependency fix
- ✅ Complete documentation

---

**Status:** ✅ **PRODUCTION READY**

All systems operational. Frontend integration can begin immediately.
