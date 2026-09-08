# Merchant API - Quick Reference

## Base URL
```
Production: https://api.yourrestaurant.com/api/v1
Development: http://localhost:3000/api/v1
```

## Authentication
```javascript
headers: { 'Authorization': 'Bearer <token>' }
```

---

## 👤 Profile Management

### Get My Profile
```http
GET /merchants/me
```

### Update Profile
```http
PATCH /merchants/me
Content-Type: application/json (or multipart/form-data for images)
```

**Body (JSON):**
```json
{
  "businessName": "Yeshi's Restaurant",
  "phone": "+251911234567",
  "location": {
    "address": "Bole Road",
    "city": "Addis Ababa"
  },
  "brandColor": "#E63946",
  "cuisineType": ["Ethiopian", "Continental"]
}
```

**With Images (multipart):**
```javascript
const formData = new FormData();
formData.append('logo', logoFile);
formData.append('coverImage', coverFile);
formData.append('businessName', 'Yeshi\'s Restaurant');
```

---

## ⚙️ Settings

### Update Settings
```http
PATCH /merchants/me
```

**Body:**
```json
{
  "settings": {
    "tipsEnabled": true,
    "tipOptions": [10, 15, 20],
    "taxRate": 15,
    "currency": "ETB",
    "onlineOrderingEnabled": true,
    "deliveryEnabled": false,
    "prepTimeMinutes": 15,
    "language": "both",
    "defaultLanguage": "am"
  }
}
```

---

## 🏢 Branch Management

### List Branches
```http
GET /branch
```

### Create Branch
```http
POST /branch
```

**Body:**
```json
{
  "name": "Piazza Branch",
  "phone": "+251922345678",
  "location": {
    "address": "Piazza, near St. George Cathedral",
    "city": "Addis Ababa",
    "coordinates": [9.0320, 38.7469]
  },
  "features": {
    "dineIn": true,
    "takeaway": true,
    "delivery": false
  }
}
```

### Update Branch
```http
PATCH /branch/:id
```

### Suspend/Activate Branch
```http
PATCH /branch/:id/suspend
PATCH /branch/:id/activate
```

---

## 👥 User Management

### List Users
```http
GET /merchants/users
```

### Create User
```http
POST /merchants/users
```

**Body:**
```json
{
  "firstName": "Meseret",
  "lastName": "Haile",
  "email": "meseret@restaurant.com",
  "phone": "+251944567890",
  "password": "SecurePassword123!",
  "passwordConfirm": "SecurePassword123!",
  "role": "507f1f77bcf86cd799439002",
  "branch": "507f1f77bcf86cd799439010"
}
```

### Update User
```http
PATCH /merchants/users/:id
```

### Delete User
```http
DELETE /merchants/users/:id
```

---

## 🎭 Role Management

### List Roles
```http
GET /merchants/roles
```

### Create Role
```http
POST /merchants/roles
```

**Body:**
```json
{
  "name": "Cashier",
  "description": "Handle payments and orders",
  "tasks": [
    "507f1f77bcf86cd799439040",
    "507f1f77bcf86cd799439041"
  ]
}
```

### Update Role
```http
PATCH /merchants/roles/:id
```

### Delete Role
```http
DELETE /merchants/roles/:id
```

---

## 📊 Analytics

### Get Statistics
```http
GET /merchants/:id/stats
```

**Response:**
```json
{
  "totalOrders": 1247,
  "totalRevenue": 487500.00,
  "totalCustomers": 523,
  "averageOrderValue": 391.00,
  "ordersToday": 32,
  "revenueToday": 12500.00
}
```

---

## 🖼️ Image Upload

### Acceptable Formats
- JPEG, PNG, WebP
- Logo: Max 2MB, recommended 512x512px
- Cover: Max 5MB, recommended 1920x1080px

### Upload Example
```javascript
const formData = new FormData();
formData.append('logo', logoFile);
formData.append('coverImage', coverFile);

await fetch('/api/v1/merchants/me', {
  method: 'PATCH',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});
```

---

## Common Errors

| Code | Message | Solution |
|------|---------|----------|
| 400 | Invalid phone number | Use format: +251911234567 |
| 400 | Invalid hex color | Use format: #RRGGBB |
| 400 | File too large | Reduce image size |
| 401 | Unauthorized | Re-login to get new token |
| 403 | Forbidden | Check user permissions |

---

## JavaScript Quick Start

```javascript
// Service class
class MerchantAPI {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }
  
  async getProfile() {
    const res = await fetch(`${this.baseUrl}/merchants/me`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return (await res.json()).data.merchant;
  }
  
  async updateProfile(updates) {
    const res = await fetch(`${this.baseUrl}/merchants/me`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });
    return (await res.json()).data.merchant;
  }
  
  async uploadImages(logo, cover) {
    const formData = new FormData();
    if (logo) formData.append('logo', logo);
    if (cover) formData.append('coverImage', cover);
    
    const res = await fetch(`${this.baseUrl}/merchants/me`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: formData
    });
    return (await res.json()).data.merchant;
  }
  
  async listBranches() {
    const res = await fetch(`${this.baseUrl}/branch`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return (await res.json()).data.branches;
  }
  
  async listUsers() {
    const res = await fetch(`${this.baseUrl}/merchants/users`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return (await res.json()).data.users;
  }
}

// Usage
const api = new MerchantAPI('https://api.yourrestaurant.com/api/v1', token);

// Get profile
const merchant = await api.getProfile();

// Update profile
const updated = await api.updateProfile({
  businessName: 'New Name',
  phone: '+251911234567'
});

// Upload images
const withImages = await api.uploadImages(logoFile, coverFile);

// List branches
const branches = await api.listBranches();
```

---

## Settings Reference

### QR Settings
```javascript
{
  showTableNumberOnQR: true,
  qrStyle: 'modern', // 'classic' | 'modern' | 'rounded' | 'dots'
  qrLogoEnabled: true,
  qrForegroundColor: '#000000',
  qrBackgroundColor: '#FFFFFF'
}
```

### Tips Settings
```javascript
{
  tipsEnabled: true,
  tipOptions: [10, 15, 20], // Percentages
  allowCustomTip: true
}
```

### Language Settings
```javascript
{
  language: 'both', // 'en' | 'am' | 'both'
  defaultLanguage: 'am' // 'en' | 'am'
}
```

### Pricing Settings
```javascript
{
  currency: 'ETB', // 'ETB' | 'USD'
  taxRate: 15, // 0-100
  serviceCharge: 0 // 0-100
}
```

### Order Flow Settings
```javascript
{
  onlineOrderingEnabled: true,
  deliveryEnabled: false,
  pickupEnabled: true,
  autoAcceptOrders: false,
  requireWaiterConfirmation: false,
  prepTimeMinutes: 15 // 5-180
}
```

---

## Full Documentation

See `MERCHANT-FRONTEND-INTEGRATION-GUIDE.md` for:
- Complete API reference
- TypeScript types
- React component examples
- Error handling patterns
- Testing checklist
