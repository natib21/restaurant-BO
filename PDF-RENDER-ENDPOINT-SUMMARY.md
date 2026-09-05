# PDF Render Endpoint - Integration Summary

## Overview

The PDF render endpoint allows your frontend to generate restaurant menus as PDF documents. Perfect for printing, emailing, or digital distribution.

---

## 📍 Endpoint Details

**URL:** `POST /api/v1/menu/render-pdf`

**Authentication:** None required (public endpoint)

**Response:** PDF file (binary blob)

---

## 🎯 What It Does

```
Frontend sends → Menu settings (items, categories, branding)
                         ↓
Backend receives → Validates with Zod schema
                         ↓
Puppeteer renders → Converts HTML to PDF
                         ↓
Frontend receives → PDF blob for download/preview/email
```

---

## 📦 Minimal Example (JavaScript/React)

```javascript
import axios from 'axios';

// 1. Generate PDF
const response = await axios.post(
  'https://api.restaurant.com/api/v1/menu/render-pdf',
  {
    title: 'Menu',
    items: [
      { name: 'Pizza', price: 250 },
      { name: 'Pasta', price: 200 }
    ],
    qrCodeData: 'https://restaurant.com/menu'
  },
  { responseType: 'blob' } // Critical: receive as blob
);

// 2. Download
const url = URL.createObjectURL(response.data);
const link = document.createElement('a');
link.href = url;
link.download = 'menu.pdf';
link.click();

// 3. Or preview
document.getElementById('pdfFrame').src = url;
```

---

## 🎨 Key Features

| Feature | Description | Example |
|---------|-------------|---------|
| **Paper Sizes** | A4, A5, Letter, Legal, Tabloid, Custom | `paperSize: 'a4'` |
| **Orientations** | Portrait or Landscape | `orientation: 'landscape'` |
| **Layouts** | 3 menu layouts for categories | `layout: 'list-with-photos'` |
| **Branding** | Restaurant name, phone, location, accent | `branding: {...}` |
| **Colors** | Customizable color scheme | `colors: {...}` |
| **Fonts** | Noto Sans, Noto Sans Ethiopic | `fonts: {...}` |
| **QR Code** | Embed QR code linking to menu/order | `qrCodeData: 'url'` |
| **Categories** | Organize items by category | `categories: [...]` |
| **Tags** | Item tags (Vegan, Spicy, etc.) | `tags: ['Vegan']` |
| **Images** | Item photos | `imageUrl: '...'` |

---

## 💡 Common Use Cases

### 1. Print Menu for Table
```javascript
const printMenu = async () => {
  const response = await axios.post('/api/v1/menu/render-pdf', {
    title: `Table ${tableNumber} - Menu`,
    items: menuItems,
    qrCodeData: `https://restaurant.com/table/${tableId}`
  }, { responseType: 'blob' });

  const url = URL.createObjectURL(response.data);
  window.open(url);
  setTimeout(() => window.print(), 500);
};
```

### 2. Email Menu to Customer
```javascript
const emailMenu = async (customerEmail) => {
  const pdfBuffer = await generateMenuPdf({
    title: 'Weekly Specials',
    items: specialItems
  });

  await axios.post('/send-email', {
    to: customerEmail,
    subject: 'This Week\'s Menu',
    attachments: [{
      filename: 'menu.pdf',
      data: pdfBuffer
    }]
  });
};
```

### 3. Mobile App Export
```javascript
// React Native
const exportMenu = async () => {
  const response = await axios.post('/api/v1/menu/render-pdf', {
    items: menuItems,
    branding: restaurantBranding
  }, { responseType: 'arraybuffer' });

  const fileName = `${FileSystem.documentDirectory}menu.pdf`;
  await FileSystem.writeAsStringAsync(fileName, response.data, {
    encoding: 'base64'
  });

  await Sharing.shareAsync(fileName);
};
```

### 4. QR-Linked Takeout Menu
```javascript
const generateTakeoutMenu = async (orderId) => {
  return await axios.post('/api/v1/menu/render-pdf', {
    paperSize: 'a5',
    orientation: 'portrait',
    items: currentMenu,
    qrCodeData: `https://restaurant.com/reorder/${orderId}`,
    title: 'Thanks for your order!'
  }, { responseType: 'blob' });
};
```

---

## 🔧 Request Payload Structure

### Top Level
```javascript
{
  templateId: 'default-menu',        // Optional template ID
  paperSize: 'a4',                   // a4|a5|letter|legal|tabloid
  orientation: 'portrait',            // portrait|landscape
  title: 'Restaurant Menu',           // Document title
  subtitle: 'Fresh cuisine',          // Subtitle text
  colors: { ... },                    // Color scheme
  fonts: { ... },                     // Font configuration
  branding: { ... },                  // Restaurant branding
  categories: [ ... ],                // Categories with items
  items: [ ... ],                     // Flat item list
  qrCodeData: 'https://...',         // QR code embed
  margins: { ... }                    // Page margins (mm)
}
```

### Colors
```javascript
colors: {
  primary: '#1f2937',      // Main color
  secondary: '#0f172a',    // Secondary color
  accent: '#f59e0b',       // Highlight color
  background: '#ffffff',   // Background
  text: '#111827',         // Text color
  border: '#e5e7eb'        // Border color
}
```

### Fonts
```javascript
fonts: {
  heading: {
    family: 'Noto Sans',     // Font family
    size: 24,                // Font size (px)
    weight: 700              // Font weight
  },
  body: { family: '...', size: 14, weight: 400 },
  accent: { family: '...', size: 18, weight: 600 }
}
```

### Branding
```javascript
branding: {
  name: 'Restaurant Name',
  logoUrl: 'https://...',
  coverImageUrl: 'https://...',
  phone: '+251-11-234-5678',
  location: 'Addis Ababa, Ethiopia',
  accent: '#f59e0b'
}
```

### Categories
```javascript
categories: [
  {
    name: 'Appetizers',
    layout: 'grid-2col',          // grid-2col|list-with-photos|compact-price-list
    backgroundTint: 'subtle',      // none|subtle|card|#hexcolor
    dividerStyle: 'line',          // line|dashed|none
    density: 'normal',             // compact|normal|relaxed
    items: [
      {
        name: 'Misir Wot',
        description: 'Spiced lentil stew',
        price: 125,
        category: 'Appetizers',
        isPopular: true,
        tags: ['Vegan', 'Spicy'],
        imageUrl: 'https://...',
        photoUrl: 'https://...'
      }
    ]
  }
]
```

### Layout Types

| Layout | Description | Best For |
|--------|-------------|----------|
| `grid-2col` | 2-column grid | Standard menus |
| `list-with-photos` | Vertical list with images | Premium menus |
| `compact-price-list` | Compact rows | Quick reference |

### Density Options

| Density | Spacing | Use |
|---------|---------|-----|
| `compact` | Tight (6px) | Many items |
| `normal` | Standard (12px) | Default |
| `relaxed` | Spacious (18px) | Premium |

---

## 📊 Paper Sizes

| Size | Width (mm) | Height (mm) |
|------|-----------|-----------|
| `a4` | 210 | 297 |
| `a5` | 148 | 210 |
| `letter` | 216 | 279 |
| `legal` | 216 | 356 |
| `tabloid` | 279 | 432 |

---

## 🎬 Full Examples

### Example 1: Minimal
```javascript
const pdf = await axios.post('/api/v1/menu/render-pdf', {
  items: [
    { name: 'Item 1', price: 100 },
    { name: 'Item 2', price: 150 }
  ]
}, { responseType: 'blob' });
```

### Example 2: Full Restaurant Menu
```javascript
const pdf = await axios.post('/api/v1/menu/render-pdf', {
  paperSize: 'a4',
  orientation: 'portrait',
  title: 'The Ethiopian Plate',
  subtitle: 'Traditional & Modern Cuisine',
  branding: {
    name: 'The Ethiopian Plate',
    phone: '+251-011-234-5678',
    location: 'Bole Road, Addis Ababa',
    accent: '#d97706'
  },
  colors: {
    primary: '#1f2937',
    secondary: '#111827',
    accent: '#d97706',
    background: '#ffffff',
    text: '#374151',
    border: '#e5e7eb'
  },
  categories: [
    {
      name: 'Appetizers',
      layout: 'grid-2col',
      items: [
        { name: 'Misir Wot', description: 'Lentil stew', price: 125, tags: ['Vegan'] },
        { name: 'Gomen', description: 'Collard greens', price: 120, tags: ['Vegan'] }
      ]
    },
    {
      name: 'Main Dishes',
      layout: 'list-with-photos',
      items: [
        { name: 'Doro Wot', price: 280, tags: ['Popular'], imageUrl: 'https://...' }
      ]
    }
  ],
  qrCodeData: 'https://restaurant.com/menu'
}, { responseType: 'blob' });
```

### Example 3: Landscape Brunch Menu
```javascript
const pdf = await axios.post('/api/v1/menu/render-pdf', {
  paperSize: 'tabloid',
  orientation: 'landscape',
  title: 'Brunch Menu',
  branding: { name: 'Sunrise Café', location: 'Downtown' },
  items: [
    { name: 'Eggs Benedict', price: 180 },
    { name: 'Pancakes', price: 160 },
    { name: 'Fruit Salad', price: 140 }
  ],
  qrCodeData: 'https://restaurant.com/brunch'
}, { responseType: 'blob' });
```

---

## ⚠️ Error Handling

### Bad Request (400)
```javascript
// Invalid payload
{
  "success": false,
  "error": "Invalid settings payload for PDF render"
}
```

### Timeout (504)
```javascript
{
  "success": false,
  "error": "PDF render timed out while generating the menu preview"
}
```

### Server Error (500)
```javascript
{
  "success": false,
  "error": "PDF rendering failed: [specific error]"
}
```

### Handling in Frontend
```javascript
try {
  const response = await axios.post('/api/v1/menu/render-pdf', payload, {
    responseType: 'blob',
    timeout: 30000
  });
  // Success
} catch (error) {
  if (error.response?.status === 504) {
    alert('Menu too large, try reducing items');
  } else if (error.response?.status === 400) {
    alert('Invalid menu data');
  } else if (error.code === 'ECONNABORTED') {
    alert('Request timeout, please try again');
  } else {
    alert('Failed to generate PDF');
  }
}
```

---

## 🏗️ Implementation Frameworks

### React
```jsx
import axios from 'axios';
import { useState } from 'react';

export function MenuPdfButton() {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        '/api/v1/menu/render-pdf',
        { items: [...] },
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'menu.pdf';
      link.click();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleClick} disabled={loading}>
      {loading ? 'Generating...' : 'Download Menu'}
    </button>
  );
}
```

### React Native
```javascript
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const shareMenuPdf = async (items) => {
  const response = await axios.post(
    '/api/v1/menu/render-pdf',
    { items },
    { responseType: 'arraybuffer' }
  );

  const fileName = `${FileSystem.documentDirectory}menu.pdf`;
  await FileSystem.writeAsStringAsync(fileName, response.data, {
    encoding: 'base64'
  });

  await Sharing.shareAsync(fileName);
};
```

### Vue 3
```vue
<template>
  <button @click="generatePdf" :disabled="loading">
    {{ loading ? 'Generating...' : 'Download' }}
  </button>
</template>

<script setup>
import axios from 'axios';
import { ref } from 'vue';

const loading = ref(false);

const generatePdf = async () => {
  loading.value = true;
  try {
    const response = await axios.post(
      '/api/v1/menu/render-pdf',
      { items: [...] },
      { responseType: 'blob' }
    );
    const url = URL.createObjectURL(response.data);
    window.location.href = url;
  } finally {
    loading.value = false;
  }
};
</script>
```

---

## ✅ Best Practices

1. **Always use `responseType: 'blob'`** in axios
2. **Set timeout** to at least 30 seconds
3. **Validate payload** before sending
4. **Show loading state** during generation
5. **Handle errors gracefully**
6. **Compress images** to reduce file size
7. **Use HTTPS URLs** for images
8. **Test on actual devices** (especially mobile)
9. **Implement retry logic** for reliability
10. **Cache PDFs** if generating same menu repeatedly

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| **PDF-RENDER-INTEGRATION-GUIDE.md** | Complete reference with examples for React, React Native, Vue |
| **FRONTEND-QUICK-REFERENCE.md** | Quick lookup - updated with PDF endpoint examples |
| **PDF-RENDER-ENDPOINT-SUMMARY.md** | This file - high-level overview |

---

## 🔗 Related Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/orders` | Place order |
| `POST /api/v1/tables/:id/close` | Close table |
| `GET /api/v1/branches/:id/active-sessions` | List active sessions |
| `POST /api/v1/menu/render-pdf` | **Render menu PDF** ← You are here |

---

## 🚀 Quick Start

**In 60 seconds:**

```javascript
// 1. Install axios
npm install axios

// 2. Generate PDF
const response = await axios.post(
  'https://api.restaurant.com/api/v1/menu/render-pdf',
  {
    title: 'Menu',
    items: [{ name: 'Pizza', price: 250 }],
    qrCodeData: 'https://restaurant.com/menu'
  },
  { responseType: 'blob' }
);

// 3. Download
const url = URL.createObjectURL(response.data);
const link = document.createElement('a');
link.href = url;
link.download = 'menu.pdf';
link.click();
```

Done! ✅

---

## 📞 Support

For detailed examples and troubleshooting, see:
- **PDF-RENDER-INTEGRATION-GUIDE.md** (comprehensive guide)
- **FRONTEND-QUICK-REFERENCE.md** (quick examples)

