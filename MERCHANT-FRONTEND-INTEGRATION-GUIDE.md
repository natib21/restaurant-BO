# Merchant Frontend Integration Guide

## 📋 Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Merchant Profile Management](#merchant-profile-management)
4. [Merchant Settings](#merchant-settings)
5. [Branch Management](#branch-management)
6. [User Management](#user-management)
7. [Role Management](#role-management)
8. [File Uploads (Logo & Cover)](#file-uploads-logo--cover)
9. [Statistics & Analytics](#statistics--analytics)
10. [TypeScript Types](#typescript-types)
11. [React Examples](#react-examples)
12. [Error Handling](#error-handling)

---

## Overview

This guide covers all merchant-related API endpoints for the restaurant management system. Merchants can manage their profile, settings, branches, users, and roles.

### Base URL
```
Production: https://api.yourrestaurant.com/api/v1
Development: http://localhost:3000/api/v1
```

### Authentication
All endpoints require Bearer token authentication:
```javascript
headers: {
  'Authorization': 'Bearer <your_jwt_token>'
}
```

---

## Authentication

### Login
**Endpoint:** `POST /api/v1/auth/login`

```javascript
const response = await fetch('https://api.yourrestaurant.com/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'owner@restaurant.com',
    password: 'yourpassword'
  })
});

const data = await response.json();
// Save token for subsequent requests
localStorage.setItem('token', data.token);
```

**Success Response (200):**
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "firstName": "John",
      "lastName": "Doe",
      "email": "owner@restaurant.com",
      "merchant": "507f1f77bcf86cd799439001",
      "role": "507f1f77bcf86cd799439002"
    }
  }
}
```

---

## Merchant Profile Management

### 1. Get My Merchant Profile

**Endpoint:** `GET /api/v1/merchants/me`

**Purpose:** Get the logged-in merchant's profile information

```javascript
const response = await fetch('https://api.yourrestaurant.com/api/v1/merchants/me', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "merchant": {
      "_id": "507f1f77bcf86cd799439001",
      "businessName": "Yeshi's Restaurant",
      "slug": "yeshi-restaurant",
      "customDomain": null,
      "customDomainVerified": false,
      "owner": {
        "fullName": "Yeshi Bekele",
        "gender": "Female",
        "email": "yeshi@yeshisrestaurant.com",
        "phone": "+251911234567"
      },
      "sector": "Restaurant",
      "phone": "+251911234567",
      "status": "approved",
      "cuisineType": ["Ethiopian", "Continental"],
      "brandColor": "#E63946",
      "logo": {
        "url": "https://api.yourrestaurant.com/img/merchants/logo-1234567890.jpg",
        "public_id": "merchants/logo-1234567890"
      },
      "coverImage": {
        "url": "https://api.yourrestaurant.com/img/merchants/cover-1234567890.jpg",
        "public_id": "merchants/cover-1234567890"
      },
      "location": {
        "address": "Bole Road, near Mexican Embassy",
        "city": "Addis Ababa",
        "subcity": "Bole"
      },
      "tinId": "1234567890",
      "tradeLicense": {
        "licenseNumber": "AA-12345-2024",
        "url": "https://api.yourrestaurant.com/uploads/licenses/license-123.pdf",
        "verified": true
      },
      "settings": {
        "showTableNumberOnQR": true,
        "qrStyle": "modern",
        "qrLogoEnabled": true,
        "qrForegroundColor": "#000000",
        "qrBackgroundColor": "#FFFFFF",
        "tipsEnabled": true,
        "tipOptions": [10, 15, 20],
        "allowCustomTip": true,
        "language": "both",
        "defaultLanguage": "am",
        "notifications": {
          "orderSoundEnabled": true,
          "newOrderSound": "default",
          "smsNotifications": false,
          "emailNotifications": true
        },
        "currency": "ETB",
        "taxRate": 15,
        "serviceCharge": 0,
        "onlineOrderingEnabled": true,
        "deliveryEnabled": false,
        "pickupEnabled": true,
        "autoAcceptOrders": false,
        "requireWaiterConfirmation": false,
        "prepTimeMinutes": 15
      },
      "subscriptionPlan": "pro",
      "isSubscriptionActive": true,
      "features": {
        "core": {
          "menu": { "enabled": true },
          "tableManagement": { "enabled": true }
        },
        "optional": {
          "orders": { "enabled": true },
          "delivery": { "enabled": false },
          "analytics": { "enabled": true },
          "inventory": { "enabled": true }
        }
      },
      "branchCounter": 3,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-08-29T12:00:00.000Z"
    }
  }
}
```

---

### 2. Update My Merchant Profile

**Endpoint:** `PATCH /api/v1/merchants/me`

**Content-Type:** `multipart/form-data` (if uploading images) or `application/json`

**Purpose:** Update merchant profile information

#### With Image Upload

```javascript
const formData = new FormData();

// Business Information
formData.append('businessName', 'Yeshi\'s Restaurant & Cafe');
formData.append('phone', '+251911234567');
formData.append('sector', 'Restaurant');
formData.append('cuisineType', JSON.stringify(['Ethiopian', 'Continental', 'Italian']));

// Location
formData.append('location[address]', 'Bole Road, near Mexican Embassy');
formData.append('location[city]', 'Addis Ababa');
formData.append('location[subcity]', 'Bole');

// Branding
formData.append('brandColor', '#E63946');

// Images (if updating)
if (logoFile) {
  formData.append('logo', logoFile); // File object from <input type="file">
}
if (coverFile) {
  formData.append('coverImage', coverFile);
}

// Legal
formData.append('tinId', '1234567890');
formData.append('tradeLicense[licenseNumber]', 'AA-12345-2024');

const response = await fetch('https://api.yourrestaurant.com/api/v1/merchants/me', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`
    // Don't set Content-Type for multipart/form-data - browser does it automatically
  },
  body: formData
});

const data = await response.json();
```

#### Without Images (JSON)

```javascript
const response = await fetch('https://api.yourrestaurant.com/api/v1/merchants/me', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    businessName: 'Yeshi\'s Restaurant & Cafe',
    phone: '+251911234567',
    location: {
      address: 'Bole Road, near Mexican Embassy',
      city: 'Addis Ababa',
      subcity: 'Bole'
    },
    brandColor: '#E63946',
    cuisineType: ['Ethiopian', 'Continental', 'Italian']
  })
});

const data = await response.json();
```

**Updatable Fields:**
```typescript
{
  // Basic Info
  businessName?: string;
  phone?: string;
  sector?: 'Cafe' | 'Restaurant' | 'Hotel' | 'Food Truck' | 'Ghost Kitchen' | 'Bakery' | 'Other';
  cuisineType?: string[];
  
  // Location
  location?: {
    address?: string;
    city?: string;
    subcity?: string;
  };
  
  // Branding
  brandColor?: string; // Hex color (e.g., '#E63946')
  logo?: File; // multipart/form-data only
  coverImage?: File; // multipart/form-data only
  
  // Legal
  tinId?: string; // 10 digits
  tradeLicense?: {
    licenseNumber?: string;
  };
  
  // Owner info
  owner?: {
    fullName?: string;
    gender?: 'Male' | 'Female';
    email?: string;
    phone?: string;
  };
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "merchant": {
      "_id": "507f1f77bcf86cd799439001",
      "businessName": "Yeshi's Restaurant & Cafe",
      // ... updated fields
      "updatedAt": "2024-08-29T12:30:00.000Z"
    }
  }
}
```

**Error Responses:**

**400 - Validation Error:**
```json
{
  "status": "fail",
  "message": "Invalid phone number"
}
```

**400 - Invalid Brand Color:**
```json
{
  "status": "fail",
  "message": "Invalid hex color format. Use format: #RRGGBB"
}
```

---

## Merchant Settings

### Update Merchant Settings

**Endpoint:** `PATCH /api/v1/merchants/me`

**Purpose:** Update operational and display settings

```javascript
const response = await fetch('https://api.yourrestaurant.com/api/v1/merchants/me', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    settings: {
      // QR Code Settings
      showTableNumberOnQR: true,
      qrStyle: 'modern', // 'classic' | 'modern' | 'rounded' | 'dots'
      qrLogoEnabled: true,
      qrForegroundColor: '#000000',
      qrBackgroundColor: '#FFFFFF',
      
      // Tips Settings
      tipsEnabled: true,
      tipOptions: [10, 15, 20], // Percentage values
      allowCustomTip: true,
      
      // Language Settings
      language: 'both', // 'en' | 'am' | 'both'
      defaultLanguage: 'am', // 'en' | 'am'
      
      // Notification Settings
      notifications: {
        orderSoundEnabled: true,
        newOrderSound: 'default',
        smsNotifications: false,
        emailNotifications: true
      },
      
      // Pricing Settings
      currency: 'ETB', // 'ETB' | 'USD'
      taxRate: 15, // 0-100
      serviceCharge: 0, // 0-100
      
      // Order Flow Settings
      onlineOrderingEnabled: true,
      deliveryEnabled: false,
      pickupEnabled: true,
      autoAcceptOrders: false,
      requireWaiterConfirmation: false,
      prepTimeMinutes: 15 // 5-180
    }
  })
});

const data = await response.json();
```

**Settings Schema:**
```typescript
interface MerchantSettings {
  // QR Code
  showTableNumberOnQR?: boolean;
  qrStyle?: 'classic' | 'modern' | 'rounded' | 'dots';
  qrLogoEnabled?: boolean;
  qrForegroundColor?: string; // Hex color
  qrBackgroundColor?: string; // Hex color
  
  // Tips
  tipsEnabled?: boolean;
  tipOptions?: number[]; // Array of percentages (1-100)
  allowCustomTip?: boolean;
  
  // Language
  language?: 'en' | 'am' | 'both';
  defaultLanguage?: 'en' | 'am';
  
  // Notifications
  notifications?: {
    orderSoundEnabled?: boolean;
    newOrderSound?: string;
    smsNotifications?: boolean;
    emailNotifications?: boolean;
  };
  
  // Pricing
  currency?: 'ETB' | 'USD';
  taxRate?: number; // 0-100
  serviceCharge?: number; // 0-100
  
  // Operations
  onlineOrderingEnabled?: boolean;
  deliveryEnabled?: boolean;
  pickupEnabled?: boolean;
  autoAcceptOrders?: boolean;
  requireWaiterConfirmation?: boolean;
  prepTimeMinutes?: number; // 5-180
}
```

---

## Branch Management

### 1. List All Branches

**Endpoint:** `GET /api/v1/branch`

```javascript
const response = await fetch('https://api.yourrestaurant.com/api/v1/branch', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
```

**Success Response (200):**
```json
{
  "status": "success",
  "results": 3,
  "data": {
    "branches": [
      {
        "_id": "507f1f77bcf86cd799439010",
        "name": "Main Branch - Bole",
        "merchant": "507f1f77bcf86cd799439001",
        "phone": "+251911234567",
        "location": {
          "address": "Bole Road",
          "city": "Addis Ababa",
          "coordinates": [9.0320, 38.7469]
        },
        "isActive": true,
        "features": {
          "dineIn": true,
          "takeaway": true,
          "delivery": false
        },
        "operatingHours": {
          "monday": { "open": "08:00", "close": "22:00", "isOpen": true },
          "tuesday": { "open": "08:00", "close": "22:00", "isOpen": true }
          // ... other days
        },
        "createdAt": "2024-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

### 2. Create Branch

**Endpoint:** `POST /api/v1/branch`

```javascript
const response = await fetch('https://api.yourrestaurant.com/api/v1/branch', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Piazza Branch',
    phone: '+251922345678',
    location: {
      address: 'Piazza, near St. George Cathedral',
      city: 'Addis Ababa',
      coordinates: [9.0320, 38.7469]
    },
    features: {
      dineIn: true,
      takeaway: true,
      delivery: false
    }
  })
});

const data = await response.json();
```

**Success Response (201):**
```json
{
  "status": "success",
  "data": {
    "branch": {
      "_id": "507f1f77bcf86cd799439020",
      "name": "Piazza Branch",
      "merchant": "507f1f77bcf86cd799439001",
      "phone": "+251922345678",
      "isActive": true,
      "createdAt": "2024-08-29T13:00:00.000Z"
    }
  }
}
```

### 3. Update Branch

**Endpoint:** `PATCH /api/v1/branch/:id`

```javascript
const branchId = '507f1f77bcf86cd799439020';

const response = await fetch(`https://api.yourrestaurant.com/api/v1/branch/${branchId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Piazza Branch - Updated',
    phone: '+251922345678',
    features: {
      dineIn: true,
      takeaway: true,
      delivery: true // Now offering delivery
    }
  })
});

const data = await response.json();
```

### 4. Suspend/Activate Branch

**Suspend:** `PATCH /api/v1/branch/:id/suspend`
**Activate:** `PATCH /api/v1/branch/:id/activate`

```javascript
// Suspend
const response = await fetch(`https://api.yourrestaurant.com/api/v1/branch/${branchId}/suspend`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Activate
const response = await fetch(`https://api.yourrestaurant.com/api/v1/branch/${branchId}/activate`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

---

## User Management

### 1. List Merchant Users

**Endpoint:** `GET /api/v1/merchants/users`

```javascript
const response = await fetch('https://api.yourrestaurant.com/api/v1/merchants/users', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
```

**Success Response (200):**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "users": [
      {
        "_id": "507f1f77bcf86cd799439030",
        "firstName": "Abebe",
        "lastName": "Kebede",
        "name": "Abebe Kebede",
        "email": "abebe@yeshisrestaurant.com",
        "phone": "+251933456789",
        "merchant": "507f1f77bcf86cd799439001",
        "branch": "507f1f77bcf86cd799439010",
        "role": {
          "_id": "507f1f77bcf86cd799439002",
          "name": "Manager"
        },
        "isActive": true,
        "createdAt": "2024-02-10T08:00:00.000Z"
      }
    ]
  }
}
```

### 2. Create User

**Endpoint:** `POST /api/v1/merchants/users`

```javascript
const response = await fetch('https://api.yourrestaurant.com/api/v1/merchants/users', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    firstName: 'Meseret',
    lastName: 'Haile',
    email: 'meseret@yeshisrestaurant.com',
    phone: '+251944567890',
    password: 'SecurePassword123!',
    passwordConfirm: 'SecurePassword123!',
    role: '507f1f77bcf86cd799439002', // Role ID
    branch: '507f1f77bcf86cd799439010' // Branch ID
  })
});

const data = await response.json();
```

**Success Response (201):**
```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439031",
      "firstName": "Meseret",
      "lastName": "Haile",
      "email": "meseret@yeshisrestaurant.com",
      "merchant": "507f1f77bcf86cd799439001",
      "branch": "507f1f77bcf86cd799439010",
      "role": "507f1f77bcf86cd799439002",
      "isActive": true
    }
  }
}
```

### 3. Update User

**Endpoint:** `PATCH /api/v1/merchants/users/:id`

```javascript
const userId = '507f1f77bcf86cd799439031';

const response = await fetch(`https://api.yourrestaurant.com/api/v1/merchants/users/${userId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    firstName: 'Meseret',
    lastName: 'Haile-Updated',
    phone: '+251944567891',
    role: '507f1f77bcf86cd799439003', // Changed role
    branch: '507f1f77bcf86cd799439020' // Changed branch
  })
});

const data = await response.json();
```

### 4. Activate/Deactivate User

**Endpoint:** `PATCH /api/v1/merchants/users/:id/activate`

```javascript
const response = await fetch(`https://api.yourrestaurant.com/api/v1/merchants/users/${userId}/activate`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### 5. Delete User

**Endpoint:** `DELETE /api/v1/merchants/users/:id`

```javascript
const response = await fetch(`https://api.yourrestaurant.com/api/v1/merchants/users/${userId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Returns 204 No Content on success
```

---

## Role Management

### 1. List Merchant Roles

**Endpoint:** `GET /api/v1/merchants/roles`

```javascript
const response = await fetch('https://api.yourrestaurant.com/api/v1/merchants/roles', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
```

**Success Response (200):**
```json
{
  "status": "success",
  "results": 3,
  "data": {
    "roles": [
      {
        "_id": "507f1f77bcf86cd799439002",
        "name": "Manager",
        "description": "Branch manager with full access",
        "merchant": "507f1f77bcf86cd799439001",
        "tasks": [
          "507f1f77bcf86cd799439040",
          "507f1f77bcf86cd799439041"
        ],
        "isActive": true,
        "createdAt": "2024-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

### 2. Create Role

**Endpoint:** `POST /api/v1/merchants/roles`

```javascript
const response = await fetch('https://api.yourrestaurant.com/api/v1/merchants/roles', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Cashier',
    description: 'Handle payments and orders',
    tasks: [
      '507f1f77bcf86cd799439040', // orders.read
      '507f1f77bcf86cd799439041', // orders.markPaid
      '507f1f77bcf86cd799439042'  // paymentVerification.initiate
    ]
  })
});

const data = await response.json();
```

**Success Response (201):**
```json
{
  "status": "success",
  "data": {
    "role": {
      "_id": "507f1f77bcf86cd799439003",
      "name": "Cashier",
      "description": "Handle payments and orders",
      "merchant": "507f1f77bcf86cd799439001",
      "tasks": [
        "507f1f77bcf86cd799439040",
        "507f1f77bcf86cd799439041",
        "507f1f77bcf86cd799439042"
      ],
      "isActive": true
    }
  }
}
```

### 3. Update Role

**Endpoint:** `PATCH /api/v1/merchants/roles/:id`

```javascript
const roleId = '507f1f77bcf86cd799439003';

const response = await fetch(`https://api.yourrestaurant.com/api/v1/merchants/roles/${roleId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Senior Cashier',
    description: 'Handle payments, orders, and returns',
    tasks: [
      '507f1f77bcf86cd799439040',
      '507f1f77bcf86cd799439041',
      '507f1f77bcf86cd799439042',
      '507f1f77bcf86cd799439043' // Added new task
    ]
  })
});

const data = await response.json();
```

### 4. Delete Role

**Endpoint:** `DELETE /api/v1/merchants/roles/:id`

```javascript
const response = await fetch(`https://api.yourrestaurant.com/api/v1/merchants/roles/${roleId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Returns 204 No Content on success
```

---

## File Uploads (Logo & Cover)

### Upload Logo and Cover Images

**Endpoint:** `PATCH /api/v1/merchants/me`

**Content-Type:** `multipart/form-data`

```javascript
const uploadMerchantImages = async (logoFile, coverFile, token) => {
  const formData = new FormData();
  
  if (logoFile) {
    formData.append('logo', logoFile);
  }
  
  if (coverFile) {
    formData.append('coverImage', coverFile);
  }
  
  const response = await fetch('https://api.yourrestaurant.com/api/v1/merchants/me', {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  const data = await response.json();
  return data.data.merchant;
};

// Usage
const logoInput = document.getElementById('logo');
const coverInput = document.getElementById('cover');

const logoFile = logoInput.files[0];
const coverFile = coverInput.files[0];

const updatedMerchant = await uploadMerchantImages(logoFile, coverFile, token);
console.log('Logo URL:', updatedMerchant.logo.url);
console.log('Cover URL:', updatedMerchant.coverImage.url);
```

**Image Requirements:**
- **Logo:** Max 2MB, recommended 512x512px
- **Cover:** Max 5MB, recommended 1920x1080px
- **Formats:** JPEG, PNG, WebP
- **Automatic:** Resizing and optimization applied

---

## Statistics & Analytics

### Get Merchant Statistics

**Endpoint:** `GET /api/v1/merchants/:id/stats`

```javascript
const merchantId = '507f1f77bcf86cd799439001';

const response = await fetch(`https://api.yourrestaurant.com/api/v1/merchants/${merchantId}/stats`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "stats": {
      "totalOrders": 1247,
      "totalRevenue": 487500.00,
      "totalCustomers": 523,
      "averageOrderValue": 391.00,
      "branches": 3,
      "activeUsers": 8,
      "menuItems": 156,
      "ordersToday": 32,
      "revenueToday": 12500.00,
      "ordersThisMonth": 456,
      "revenueThisMonth": 178200.00,
      "topSellingItems": [
        {
          "item": "Doro Wot",
          "quantity": 234,
          "revenue": 35100.00
        }
      ],
      "ordersByStatus": {
        "pending": 5,
        "accepted": 12,
        "preparing": 8,
        "ready": 3,
        "served": 4,
        "completed": 1215
      }
    }
  }
}
```

---

## TypeScript Types

```typescript
// Merchant Profile
interface Merchant {
  _id: string;
  businessName: string;
  slug: string;
  customDomain?: string;
  customDomainVerified: boolean;
  owner: {
    fullName: string;
    gender: 'Male' | 'Female';
    email: string;
    phone: string;
  };
  sector: 'Cafe' | 'Restaurant' | 'Hotel' | 'Food Truck' | 'Ghost Kitchen' | 'Bakery' | 'Other';
  phone?: string;
  status: 'pending' | 'approved' | 'suspended' | 'inactive';
  cuisineType: string[];
  brandColor: string;
  logo?: {
    url: string;
    public_id: string;
  };
  coverImage?: {
    url: string;
    public_id: string;
  };
  location: {
    address?: string;
    city: string;
    subcity?: string;
  };
  tinId?: string;
  tradeLicense?: {
    licenseNumber?: string;
    url?: string;
    public_id?: string;
    verified: boolean;
  };
  settings: MerchantSettings;
  subscriptionPlan: 'free' | 'basic' | 'pro' | 'enterprise' | 'feature' | 'trial';
  isSubscriptionActive: boolean;
  features: MerchantFeatures;
  branchCounter: number;
  createdAt: string;
  updatedAt: string;
}

interface MerchantSettings {
  showTableNumberOnQR: boolean;
  qrStyle: 'classic' | 'modern' | 'rounded' | 'dots';
  qrLogoEnabled: boolean;
  qrForegroundColor: string;
  qrBackgroundColor: string;
  tipsEnabled: boolean;
  tipOptions: number[];
  allowCustomTip: boolean;
  language: 'en' | 'am' | 'both';
  defaultLanguage: 'en' | 'am';
  notifications: {
    orderSoundEnabled: boolean;
    newOrderSound: string;
    smsNotifications: boolean;
    emailNotifications: boolean;
  };
  currency: 'ETB' | 'USD';
  taxRate: number;
  serviceCharge: number;
  onlineOrderingEnabled: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  autoAcceptOrders: boolean;
  requireWaiterConfirmation: boolean;
  prepTimeMinutes: number;
}

interface MerchantFeatures {
  core: {
    menu: { enabled: boolean };
    tableManagement: { enabled: boolean };
  };
  optional: {
    orders: { enabled: boolean };
    delivery: { enabled: boolean };
    analytics: { enabled: boolean };
    inventory: { enabled: boolean };
  };
}

// Branch
interface Branch {
  _id: string;
  name: string;
  merchant: string;
  phone: string;
  location: {
    address: string;
    city: string;
    coordinates: [number, number];
  };
  isActive: boolean;
  features: {
    dineIn: boolean;
    takeaway: boolean;
    delivery: boolean;
  };
  operatingHours?: {
    [day: string]: {
      open: string;
      close: string;
      isOpen: boolean;
    };
  };
  createdAt: string;
}

// User
interface MerchantUser {
  _id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  merchant: string;
  branch: string;
  role: string | Role;
  isActive: boolean;
  createdAt: string;
}

// Role
interface Role {
  _id: string;
  name: string;
  description: string;
  merchant: string;
  tasks: string[];
  isActive: boolean;
  createdAt: string;
}

// API Response
interface ApiResponse<T> {
  status: 'success' | 'fail' | 'error';
  message?: string;
  data?: T;
  results?: number;
}

// Service Class
class MerchantService {
  private baseUrl: string;
  private token: string;
  
  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }
  
  async getProfile(): Promise<Merchant> {
    const response = await fetch(`${this.baseUrl}/merchants/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to fetch profile');
    
    const data: ApiResponse<{ merchant: Merchant }> = await response.json();
    return data.data!.merchant;
  }
  
  async updateProfile(updates: Partial<Merchant>): Promise<Merchant> {
    const response = await fetch(`${this.baseUrl}/merchants/me`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });
    
    if (!response.ok) throw new Error('Failed to update profile');
    
    const data: ApiResponse<{ merchant: Merchant }> = await response.json();
    return data.data!.merchant;
  }
  
  async uploadImages(logo?: File, cover?: File): Promise<Merchant> {
    const formData = new FormData();
    if (logo) formData.append('logo', logo);
    if (cover) formData.append('coverImage', cover);
    
    const response = await fetch(`${this.baseUrl}/merchants/me`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${this.token}`
      },
      body: formData
    });
    
    if (!response.ok) throw new Error('Failed to upload images');
    
    const data: ApiResponse<{ merchant: Merchant }> = await response.json();
    return data.data!.merchant;
  }
  
  async listBranches(): Promise<Branch[]> {
    const response = await fetch(`${this.baseUrl}/branch`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to fetch branches');
    
    const data: ApiResponse<{ branches: Branch[] }> = await response.json();
    return data.data!.branches;
  }
  
  async listUsers(): Promise<MerchantUser[]> {
    const response = await fetch(`${this.baseUrl}/merchants/users`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to fetch users');
    
    const data: ApiResponse<{ users: MerchantUser[] }> = await response.json();
    return data.data!.users;
  }
  
  async listRoles(): Promise<Role[]> {
    const response = await fetch(`${this.baseUrl}/merchants/roles`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to fetch roles');
    
    const data: ApiResponse<{ roles: Role[] }> = await response.json();
    return data.data!.roles;
  }
}
```

---

## React Examples

### Merchant Profile Component

```tsx
import React, { useState, useEffect } from 'react';
import { MerchantService, Merchant } from './types';

interface MerchantProfileProps {
  token: string;
}

const MerchantProfile: React.FC<MerchantProfileProps> = ({ token }) => {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  
  const service = new MerchantService(
    'https://api.yourrestaurant.com/api/v1',
    token
  );
  
  useEffect(() => {
    loadProfile();
  }, []);
  
  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await service.getProfile();
      setMerchant(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      const updates = {
        businessName: formData.get('businessName') as string,
        phone: formData.get('phone') as string,
        location: {
          address: formData.get('address') as string,
          city: formData.get('city') as string
        }
      };
      
      const updated = await service.updateProfile(updates);
      setMerchant(updated);
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!merchant) return null;
  
  return (
    <div className="merchant-profile">
      <div className="profile-header">
        {merchant.logo && (
          <img src={merchant.logo.url} alt="Logo" className="logo" />
        )}
        <h1>{merchant.businessName}</h1>
        <span className={`status status-${merchant.status}`}>
          {merchant.status}
        </span>
      </div>
      
      {merchant.coverImage && (
        <img src={merchant.coverImage.url} alt="Cover" className="cover" />
      )}
      
      {!editing ? (
        <div className="profile-view">
          <div className="info-group">
            <label>Business Name:</label>
            <p>{merchant.businessName}</p>
          </div>
          
          <div className="info-group">
            <label>Sector:</label>
            <p>{merchant.sector}</p>
          </div>
          
          <div className="info-group">
            <label>Phone:</label>
            <p>{merchant.phone || 'Not set'}</p>
          </div>
          
          <div className="info-group">
            <label>Address:</label>
            <p>{merchant.location.address || 'Not set'}</p>
          </div>
          
          <div className="info-group">
            <label>Owner:</label>
            <p>{merchant.owner.fullName} ({merchant.owner.email})</p>
          </div>
          
          <div className="info-group">
            <label>Subscription:</label>
            <p className="subscription">
              {merchant.subscriptionPlan.toUpperCase()}
              {merchant.isSubscriptionActive && ' (Active)'}
            </p>
          </div>
          
          <button onClick={() => setEditing(true)} className="btn btn-primary">
            Edit Profile
          </button>
        </div>
      ) : (
        <form onSubmit={handleUpdate} className="profile-edit">
          <div className="form-group">
            <label>Business Name</label>
            <input 
              name="businessName" 
              defaultValue={merchant.businessName}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Phone</label>
            <input 
              name="phone" 
              type="tel"
              defaultValue={merchant.phone}
              placeholder="+251911234567"
            />
          </div>
          
          <div className="form-group">
            <label>Address</label>
            <input 
              name="address" 
              defaultValue={merchant.location.address}
            />
          </div>
          
          <div className="form-group">
            <label>City</label>
            <input 
              name="city" 
              defaultValue={merchant.location.city}
            />
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Save Changes
            </button>
            <button 
              type="button" 
              onClick={() => setEditing(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default MerchantProfile;
```

### Image Upload Component

```tsx
import React, { useState } from 'react';

interface ImageUploadProps {
  token: string;
  currentLogo?: string;
  currentCover?: string;
  onUploadSuccess: (merchant: any) => void;
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  token,
  currentLogo,
  currentCover,
  onUploadSuccess
}) => {
  const [logoPreview, setLogoPreview] = useState(currentLogo);
  const [coverPreview, setCoverPreview] = useState(currentCover);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo must be less than 2MB');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => setLogoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };
  
  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      setError('Cover image must be less than 5MB');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => setCoverPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };
  
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);
    setError('');
    
    const formData = new FormData(e.currentTarget);
    
    try {
      const response = await fetch('https://api.yourrestaurant.com/api/v1/merchants/me', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      const data = await response.json();
      onUploadSuccess(data.data.merchant);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="image-upload">
      <h2>Update Images</h2>
      
      {error && <div className="alert alert-error">{error}</div>}
      
      <div className="form-group">
        <label>Logo (Max 2MB)</label>
        <input 
          type="file" 
          name="logo"
          accept="image/*"
          onChange={handleLogoChange}
        />
        {logoPreview && (
          <img src={logoPreview} alt="Logo preview" className="preview logo" />
        )}
      </div>
      
      <div className="form-group">
        <label>Cover Image (Max 5MB)</label>
        <input 
          type="file" 
          name="coverImage"
          accept="image/*"
          onChange={handleCoverChange}
        />
        {coverPreview && (
          <img src={coverPreview} alt="Cover preview" className="preview cover" />
        )}
      </div>
      
      <button type="submit" disabled={uploading} className="btn btn-primary">
        {uploading ? 'Uploading...' : 'Upload Images'}
      </button>
    </form>
  );
};

export default ImageUpload;
```

---

## Error Handling

### Common Error Responses

```typescript
interface ErrorResponse {
  status: 'fail' | 'error';
  message: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}

// Error Handler
const handleMerchantError = (error: any): string => {
  const userMessages: Record<string, string> = {
    'Business name is required': 'Please enter your business name',
    'Invalid phone number': 'Please enter a valid Ethiopian phone number (+251...)',
    'Invalid hex color': 'Please use a valid color format (#RRGGBB)',
    'File too large': 'Image file is too large. Please use a smaller file',
    'Merchant not found': 'Your merchant profile was not found',
    'Unauthorized': 'Your session has expired. Please log in again'
  };
  
  const message = error.message || 'An error occurred';
  return userMessages[message] || message;
};

// Usage
try {
  await service.updateProfile(updates);
} catch (error) {
  const userMessage = handleMerchantError(error);
  alert(userMessage);
}
```

### Validation Errors

**400 - Phone Validation:**
```json
{
  "status": "fail",
  "message": "Invalid phone number format. Expected +251911234567"
}
```

**400 - Color Validation:**
```json
{
  "status": "fail",
  "message": "Invalid hex color. Use format: #RRGGBB"
}
```

**400 - Image Size:**
```json
{
  "status": "fail",
  "message": "File too large. Maximum size is 5MB"
}
```

**401 - Unauthorized:**
```json
{
  "status": "fail",
  "message": "You are not logged in. Please log in to get access"
}
```

**403 - Forbidden:**
```json
{
  "status": "fail",
  "message": "You do not have permission to perform this action"
}
```

---

## Quick Reference

### Profile Endpoints
- `GET /merchants/me` - Get profile
- `PATCH /merchants/me` - Update profile (with images)

### Branch Endpoints
- `GET /branch` - List branches
- `POST /branch` - Create branch
- `PATCH /branch/:id` - Update branch
- `PATCH /branch/:id/suspend` - Suspend branch
- `PATCH /branch/:id/activate` - Activate branch

### User Endpoints
- `GET /merchants/users` - List users
- `POST /merchants/users` - Create user
- `PATCH /merchants/users/:id` - Update user
- `DELETE /merchants/users/:id` - Delete user
- `PATCH /merchants/users/:id/activate` - Activate user

### Role Endpoints
- `GET /merchants/roles` - List roles
- `POST /merchants/roles` - Create role
- `PATCH /merchants/roles/:id` - Update role
- `DELETE /merchants/roles/:id` - Delete role

### Analytics
- `GET /merchants/:id/stats` - Get statistics

---

## Testing Checklist

- [ ] Load merchant profile
- [ ] Update business information
- [ ] Upload logo
- [ ] Upload cover image
- [ ] Update settings
- [ ] Create branch
- [ ] Update branch
- [ ] List users
- [ ] Create user
- [ ] Update user role
- [ ] Create custom role
- [ ] Assign tasks to role
- [ ] View statistics
- [ ] Test error handling
- [ ] Test unauthorized access
- [ ] Test validation errors
