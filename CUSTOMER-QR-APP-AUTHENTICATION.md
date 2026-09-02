# Customer QR App - Authentication with HTTP-Only Cookies

## ✅ Backend Status

Your backend (`src/server.js` with `src/app/create-app.js`) is **FULLY CONFIGURED** with HTTP-only JWT cookies.

### Current Setup Verified ✓

1. **JWT Issuing:** `src/modules/auth/auth.controller.js`
   - Sets HTTP-only cookie automatically on login
   - 7-day expiration
   - Secure flag enabled in production
   - SameSite protection enabled

2. **JWT Verification:** `src/common/guards/auth.guard.js`
   - Reads from cookies automatically
   - Works with `credentials: 'include'`

3. **CORS:** `src/app/create-app.js`
   - `credentials: true` enabled
   - Allows localhost development URLs

---

## 🎯 Frontend Implementation (Customer QR App)

Your frontend (React/Vue at http://localhost:5173) needs minimal changes:

### **Step 1: Add `credentials: 'include'` to All API Calls**

This is the ONLY required change to use cookies instead of Bearer tokens.

#### **Using Fetch API**

```javascript
// ✅ BEFORE: Bearer token in header (optional, can still work)
const response = await fetch('http://localhost:8000/api/v1/orders', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`  // ← Not needed with cookies
  }
});

// ✅ AFTER: Use cookies (RECOMMENDED)
const response = await fetch('http://localhost:8000/api/v1/orders', {
  method: 'GET',
  credentials: 'include'  // ← Add this ONE line
});
```

#### **Using Axios**

```javascript
// Create axios instance with credentials
const api = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
  withCredentials: true  // ← Add this
});

// All requests now include cookies automatically
api.get('/orders');
api.post('/orders', orderData);
```

---

## 📋 Complete QR App Flow

### **1. Session Start (Current - No Changes Needed)**

```javascript
// Currently working - no changes needed
const response = await fetch(
  'http://localhost:8000/api/v1/sessions/start?data=...&s=...',
  { method: 'POST' }
);
```

### **2. Login (For Staff/Accounts - Add credentials)**

```javascript
// Staff login endpoint
const response = await fetch('http://localhost:8000/api/v1/auth/login', {
  method: 'POST',
  credentials: 'include',  // ← Add this
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'staff@restaurant.com',
    password: 'securePassword'
  })
});

const data = await response.json();
console.log('Logged in:', data.data.user);
// ✅ JWT cookie is now stored by browser (HTTP-only, secure)
```

### **3. Place Order (Add credentials)**

```javascript
// Already working - just add credentials
const response = await fetch('http://localhost:8000/api/v1/orders', {
  method: 'POST',
  credentials: 'include',  // ← Add this
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    items: [{ menuItemId: '...', quantity: 2 }],
    branchId: '...',
    table: 'T-02',
    customerName: 'Guest',
    totalAmount: 300
  })
});
```

### **4. Get Public Menu (No Changes - No Auth)**

```javascript
// Already works - no authentication needed
const response = await fetch(
  'http://localhost:8000/api/v1/menu/public',
  { 
    credentials: 'include'  // Optional for public endpoints
  }
);
```

### **5. Logout (Add credentials)**

```javascript
const response = await fetch('http://localhost:8000/api/v1/auth/logout', {
  method: 'POST',
  credentials: 'include'  // ← Add this
});
// ✅ Cookie is cleared by backend
```

---

## 🔧 Implementation by Framework

### **React with Fetch**

```javascript
// api.js
export const api = {
  // Base fetch with credentials
  async request(endpoint, options = {}) {
    const response = await fetch(
      `http://localhost:8000/api/v1${endpoint}`,
      {
        ...options,
        credentials: 'include',  // ✅ CRITICAL
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }
    
    return response.json();
  },

  // Methods
  getMenu() {
    return this.request('/menu/public');
  },

  placeOrder(orderData) {
    return this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });
  },

  login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }
};

// Usage in component
function OrderForm() {
  const handleSubmit = async (orderData) => {
    try {
      const result = await api.placeOrder(orderData);
      console.log('Order created:', result.data.orderNumber);
    } catch (err) {
      console.error('Order failed:', err.message);
    }
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### **Vue 3 with Axios**

```javascript
// api.js
import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
  withCredentials: true  // ✅ CRITICAL - includes cookies
});

export const apiService = {
  getMenu() {
    return api.get('/menu/public');
  },

  placeOrder(orderData) {
    return api.post('/orders', orderData);
  },

  login(email, password) {
    return api.post('/auth/login', { email, password });
  },

  logout() {
    return api.post('/auth/logout');
  }
};

// Usage in component
export default {
  methods: {
    async submitOrder(orderData) {
      try {
        const { data } = await apiService.placeOrder(orderData);
        console.log('Order created:', data.data.orderNumber);
      } catch (err) {
        console.error('Order failed:', err.message);
      }
    }
  }
};
```

### **Vue 3 with Fetch Composable**

```javascript
// useApi.js
export function useApi() {
  const baseUrl = 'http://localhost:8000/api/v1';

  async function request(endpoint, options = {}) {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      credentials: 'include',  // ✅ CRITICAL
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    return response.json();
  }

  return {
    getMenu: () => request('/menu/public'),
    placeOrder: (data) => request('/orders', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    }),
    login: (email, password) => request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
    logout: () => request('/auth/logout', { method: 'POST' })
  };
}

// Usage
<script setup>
import { useApi } from '@/composables/useApi';

const api = useApi();

async function submitOrder(orderData) {
  try {
    const { data } = await api.placeOrder(orderData);
    console.log('Order:', data.data.orderNumber);
  } catch (err) {
    console.error('Error:', err.message);
  }
}
</script>
```

---

## 🔍 Debugging & Verification

### **Verify Cookie is Stored**

1. Open browser DevTools
2. Go to **Application** → **Cookies**
3. Look for `jwt` cookie
4. Check:
   - ✅ `HttpOnly` is checked
   - ✅ `Secure` is checked (production only)
   - ✅ `SameSite` is set to `Lax`
   - ✅ Value contains long token string

### **Verify Cookie is Sent**

1. Open browser DevTools
2. Go to **Network** tab
3. Make an API request
4. Click the request
5. Go to **Cookies** tab
6. Should show `jwt` cookie being sent

### **Check Network Requests**

```javascript
// Add this to log all requests
fetch('http://localhost:8000/api/v1/orders', {
  credentials: 'include'
})
.then(r => r.json())
.then(d => console.log('Success:', d))
.catch(e => console.error('Error:', e));

// Check browser console - should show success
// If fails with 401, cookie not being sent (missing credentials: 'include')
```

---

## ⚠️ Troubleshooting

### ❌ Problem: Getting 401 "Not logged in"

**Cause:** Missing `credentials: 'include'`

**Solution:**
```javascript
// ❌ Wrong
fetch('http://localhost:8000/api/v1/orders');

// ✅ Correct
fetch('http://localhost:8000/api/v1/orders', {
  credentials: 'include'
});
```

### ❌ Problem: Cookie not appearing in DevTools

**Cause:** CORS not allowing credentials

**Solution:** Backend already has `cors({ credentials: true })` - make sure frontend sends `credentials: 'include'`

### ❌ Problem: 403 "Feature not enabled"

**Cause:** Merchant doesn't have orders feature enabled or subscription inactive

**Solution:** Enable in merchant settings or check subscription status

---

## 📝 Complete Example - QR Customer App

```javascript
// src/api/client.js
const API_BASE = 'http://localhost:8000/api/v1';

export const client = {
  async fetch(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      credentials: 'include',  // ✅ CRITICAL FOR COOKIES
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    return data;
  },
};

// src/api/menu.js
export async function getPublicMenu(merchantId) {
  const data = await client.fetch('/menu/public');
  return data.data.menus;
}

// src/api/orders.js
export async function placeOrder(orderData) {
  const data = await client.fetch('/orders', {
    method: 'POST',
    body: JSON.stringify(orderData),
  });
  return data.data.order;
}

// src/api/auth.js
export async function login(email, password) {
  const data = await client.fetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data.data.user;
}

export async function logout() {
  await client.fetch('/auth/logout', { method: 'POST' });
}

// src/components/QrApp.vue
<template>
  <div class="qr-app">
    <div v-if="!user" class="login-form">
      <input v-model="email" type="email" placeholder="Email">
      <input v-model="password" type="password" placeholder="Password">
      <button @click="handleLogin">Login</button>
    </div>

    <div v-else class="menu">
      <h1>{{ user.email }}</h1>
      
      <div class="menu-items">
        <div v-for="item in menu" :key="item._id" class="item">
          <h3>{{ item.name.en }}</h3>
          <p>{{ item.description.en }}</p>
          <button @click="addToCart(item)">Add - {{ item.price }}Br</button>
        </div>
      </div>

      <div class="cart">
        <h2>Cart ({{ cart.length }})</h2>
        <button @click="handleOrder" v-if="cart.length">Place Order</button>
        <button @click="handleLogout">Logout</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getPublicMenu, placeOrder } from '@/api/orders';
import { login, logout as apiLogout } from '@/api/auth';

const email = ref('');
const password = ref('');
const user = ref(null);
const menu = ref([]);
const cart = ref([]);

const handleLogin = async () => {
  user.value = await login(email.value, password.value);
  // ✅ JWT cookie now stored by browser
};

const handleLogout = async () => {
  await apiLogout();
  // ✅ Cookie cleared by server
  user.value = null;
  cart.value = [];
};

const handleOrder = async () => {
  const order = await placeOrder({
    items: cart.value,
    branchId: '...',
    table: 'T-01',
    customerName: user.value.email,
    totalAmount: cart.value.reduce((sum, item) => sum + item.price, 0),
  });
  // ✅ Authenticated via cookie
  alert(`Order #${order.orderNumber} created!`);
  cart.value = [];
};

onMounted(async () => {
  menu.value = await getPublicMenu();
});
</script>
```

---

## ✅ Checklist

- [ ] All fetch requests have `credentials: 'include'`
- [ ] OR Axios instance has `withCredentials: true`
- [ ] No manual JWT token handling needed
- [ ] Cookie appears in DevTools → Cookies tab
- [ ] HTTP-Only checkbox is checked in DevTools
- [ ] Requests send `jwt` cookie automatically
- [ ] Logout clears the cookie
- [ ] Login stores the cookie

---

## 🎯 Summary

**Your backend:** ✅ Already configured with HTTP-only JWT cookies

**What frontend needs:** ✅ Just add `credentials: 'include'` to all requests

**That's it!** The browser handles the rest automatically. 🔒
