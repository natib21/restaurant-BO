# PDF Render Endpoint Integration Guide

**Endpoint:** `POST /api/v1/menu/render-pdf`

**Purpose:** Render a restaurant menu as a PDF document using headless Chromium (Puppeteer). Supports multiple paper sizes, orientations, custom styling, QR codes, and flexible layouts.

---

## Table of Contents

1. [Endpoint Overview](#endpoint-overview)
2. [Request Payload Structure](#request-payload-structure)
3. [Payload Examples](#payload-examples)
4. [Response Format](#response-format)
5. [Error Handling](#error-handling)
6. [Frontend Implementation](#frontend-implementation)
7. [Use Cases](#use-cases)
8. [Common Patterns](#common-patterns)

---

## Endpoint Overview

### Basic Info

| Property | Value |
|----------|-------|
| **Method** | `POST` |
| **URL** | `/api/v1/menu/render-pdf` |
| **Base URL** | `https://api.restaurant.com/api/v1` |
| **Full URL** | `https://api.restaurant.com/api/v1/menu/render-pdf` |
| **Authentication** | None required (public endpoint) |
| **Content-Type** | `application/json` (request) |
| **Response Type** | `application/pdf` (binary blob) |
| **Response Header** | `Content-Disposition: attachment; filename="menu.pdf"` |

### What It Does

1. Accepts menu settings (items, categories, branding, styling)
2. Generates HTML with self-hosted fonts and styling
3. Renders to PDF using headless Chromium
4. Returns PDF as binary blob
5. Frontend downloads or displays the PDF

---

## Request Payload Structure

### Top-Level Properties

```javascript
{
  // Optional: Preset template ID (currently only 'default-menu' supported)
  "templateId": "default-menu",
  
  // Paper size: predefined or custom dimensions
  "paperSize": "a4" | "a5" | "letter" | "legal" | "tabloid" | { width, height, label },
  
  // Page orientation
  "orientation": "portrait" | "landscape",
  
  // Document title (displays on menu)
  "title": "Our Restaurant Menu",
  
  // Subtitle text
  "subtitle": "Freshly prepared dishes & beverages",
  
  // Color scheme
  "colors": {
    "primary": "#1f2937",
    "secondary": "#0f172a",
    "accent": "#f59e0b",
    "background": "#ffffff",
    "text": "#111827",
    "border": "#e5e7eb"
  },
  
  // Font configuration
  "fonts": {
    "heading": { "family": "Noto Sans", "size": 24, "weight": 700 },
    "body": { "family": "Noto Sans", "size": 14, "weight": 400 },
    "accent": { "family": "Noto Sans Ethiopic", "size": 18, "weight": 600 }
  },
  
  // Restaurant branding
  "branding": {
    "name": "Restaurant Name",
    "logoUrl": "https://cdn.example.com/logo.png",
    "coverImageUrl": "https://cdn.example.com/cover.jpg",
    "phone": "+251-0-123-456-7890",
    "location": "Addis Ababa, Ethiopia",
    "accent": "#f59e0b"
  },
  
  // Menu structure: categories with items
  "categories": [
    {
      "name": "Appetizers",
      "layout": "grid-2col" | "list-with-photos" | "compact-price-list",
      "backgroundTint": "none" | "subtle" | "card" | "#hexcolor",
      "dividerStyle": "line" | "dashed" | "none",
      "density": "compact" | "normal" | "relaxed",
      "items": [
        {
          "name": "Misir Wot",
          "description": "Spiced red lentil stew",
          "price": 125,
          "category": "Appetizers",
          "isPopular": true,
          "tags": ["Vegan", "Spicy"],
          "imageUrl": "https://cdn.example.com/misir-wot.jpg",
          "photoUrl": "https://cdn.example.com/misir-wot.jpg"
        }
      ]
    }
  ],
  
  // Flat item list (alternative to categories)
  "items": [
    { "name": "...", "price": 100 }
  ],
  
  // QR code to embed (links to menu, order page, etc.)
  "qrCodeData": "https://restaurant.com/menu/table-5" | { "data": "..." },
  
  // Page margins in millimeters
  "margins": {
    "top": 12,
    "right": 12,
    "bottom": 12,
    "left": 12
  },
  
  // Legacy: shorthand for nested settings
  "settings": {
    // Same structure as above, optional override
  }
}
```

### Paper Size Reference

| Size | Width (mm) | Height (mm) | Portrait | Landscape |
|------|-----------|-----------|----------|-----------|
| `a4` | 210 | 297 | 210×297 | 297×210 |
| `a5` | 148 | 210 | 148×210 | 210×148 |
| `letter` | 216 | 279 | 216×279 | 279×216 |
| `legal` | 216 | 356 | 216×356 | 356×216 |
| `tabloid` | 279 | 432 | 279×432 | 432×279 |

### Layout Options

| Layout | Description | Best For |
|--------|-------------|----------|
| `grid-2col` | 2-column grid layout | Standard menus with many items |
| `list-with-photos` | Vertical list with side photos | High-end menus with photos |
| `compact-price-list` | Compact rows with dotted price leader | Quick reference, small menus |

### Density Options

| Density | Padding | Gap | Use Case |
|---------|---------|-----|----------|
| `compact` | 6px | 6px | Tight layouts, many items |
| `normal` | 12px | 12px | Standard menus (default) |
| `relaxed` | 18px | 18px | Premium, spacious layouts |

### Background Tint Options

| Value | Result |
|-------|--------|
| `none` | Transparent background |
| `subtle` | Very light gray background (2% opacity) |
| `card` | White card with border and shadow |
| `#hexcolor` | Custom hex color (e.g., `#f3f4f6`) |

---

## Payload Examples

### Example 1: Minimal Payload (Quick PDF)

Bare minimum to generate a PDF with default styling:

```javascript
{
  "title": "Quick Menu",
  "items": [
    { "name": "Pizza Margherita", "price": 250 },
    { "name": "Pasta Carbonara", "price": 280 },
    { "name": "Tiramisu", "price": 120 }
  ],
  "qrCodeData": "https://restaurant.com/menu"
}
```

**Result:** A4 portrait PDF with 3 items, default colors, no categories.

---

### Example 2: Full-Featured Menu

Complete menu with categories, branding, custom styling, and QR code:

```javascript
{
  "templateId": "default-menu",
  "paperSize": "a4",
  "orientation": "portrait",
  
  "title": "The Ethiopian Plate",
  "subtitle": "Traditional & Modern Cuisine",
  
  "branding": {
    "name": "The Ethiopian Plate",
    "phone": "+251-011-234-5678",
    "location": "Bole Road, Addis Ababa",
    "accent": "#d97706"
  },
  
  "colors": {
    "primary": "#1f2937",
    "secondary": "#111827",
    "accent": "#d97706",
    "background": "#ffffff",
    "text": "#374151",
    "border": "#e5e7eb"
  },
  
  "fonts": {
    "heading": { "family": "Noto Sans", "size": 26, "weight": 700 },
    "body": { "family": "Noto Sans", "size": 13, "weight": 400 },
    "accent": { "family": "Noto Sans Ethiopic", "size": 18, "weight": 600 }
  },
  
  "categories": [
    {
      "name": "Appetizers (ተቋርሶ)",
      "layout": "grid-2col",
      "backgroundTint": "subtle",
      "dividerStyle": "line",
      "density": "normal",
      "items": [
        {
          "name": "Misir Wot",
          "description": "Spiced red lentil stew with injera",
          "price": 125,
          "isPopular": true,
          "tags": ["Vegan", "Gluten-Free"],
          "imageUrl": "https://cdn.example.com/misir-wot.jpg"
        },
        {
          "name": "Gomen",
          "description": "Sautéed collard greens with ginger",
          "price": 120,
          "tags": ["Vegan"],
          "imageUrl": "https://cdn.example.com/gomen.jpg"
        }
      ]
    },
    {
      "name": "Main Dishes (ዋናው ምግብ)",
      "layout": "list-with-photos",
      "backgroundTint": "card",
      "dividerStyle": "dashed",
      "density": "normal",
      "items": [
        {
          "name": "Doro Wot",
          "description": "Slow-cooked chicken in spiced sauce",
          "price": 280,
          "isPopular": true,
          "tags": ["Spicy", "Popular"],
          "imageUrl": "https://cdn.example.com/doro-wot.jpg"
        },
        {
          "name": "Tibs (Beef)",
          "description": "Sautéed beef with vegetables & spices",
          "price": 320,
          "tags": ["Spicy"],
          "imageUrl": "https://cdn.example.com/tibs.jpg"
        }
      ]
    },
    {
      "name": "Beverages (음료)",
      "layout": "compact-price-list",
      "backgroundTint": "none",
      "dividerStyle": "none",
      "density": "compact",
      "items": [
        { "name": "Ethiopian Coffee", "price": 45 },
        { "name": "Mint Tea", "price": 40 },
        { "name": "Fresh Mango Juice", "price": 60 }
      ]
    }
  ],
  
  "qrCodeData": "https://restaurant.com/menu/dine-in",
  
  "margins": { "top": 12, "right": 12, "bottom": 12, "left": 12 }
}
```

---

### Example 3: Landscape, Custom Paper Size

```javascript
{
  "paperSize": "tabloid",
  "orientation": "landscape",
  
  "title": "Brunch Menu",
  "branding": {
    "name": "Sunrise Café",
    "location": "Downtown"
  },
  
  "items": [
    { "name": "Eggs Benedict", "price": 180 },
    { "name": "Pancakes with Maple Syrup", "price": 160 },
    { "name": "Fresh Fruit Salad", "price": 140 }
  ],
  
  "qrCodeData": { "data": "https://restaurant.com/brunch" }
}
```

---

### Example 4: Minimalist Black & Gold

Sleek, premium look with custom colors:

```javascript
{
  "paperSize": "a5",
  "orientation": "portrait",
  
  "title": "Fine Dining",
  "subtitle": "Evening Collection",
  
  "colors": {
    "primary": "#000000",
    "secondary": "#1a1a1a",
    "accent": "#d4af37",
    "background": "#fafafa",
    "text": "#333333",
    "border": "#cccccc"
  },
  
  "branding": {
    "name": "Étoile Restaurant",
    "phone": "+251-11-555-9999",
    "accent": "#d4af37"
  },
  
  "categories": [
    {
      "name": "Entrées",
      "items": [
        { "name": "Pan-Seared Salmon", "price": 450 },
        { "name": "Wagyu Steak", "price": 650 }
      ]
    }
  ]
}
```

---

### Example 5: With Image URLs & Tags

```javascript
{
  "title": "Happy Hour Menu",
  
  "categories": [
    {
      "name": "Appetizers",
      "items": [
        {
          "name": "Buffalo Wings",
          "description": "Spicy wings with blue cheese dip",
          "price": 185,
          "tags": ["Spicy", "Happy Hour"],
          "imageUrl": "https://images.restaurant.com/buffalo-wings.jpg"
        }
      ]
    }
  ],
  
  "qrCodeData": "https://restaurant.com/order/happy-hour"
}
```

---

## Response Format

### Success (200 OK)

**Headers:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="menu.pdf"
Content-Length: 45382
```

**Body:** Binary PDF file (blob)

### Errors

#### 400 Bad Request

Invalid or missing settings payload:

```javascript
{
  "success": false,
  "error": "Invalid settings payload for PDF render"
}
```

#### 504 Gateway Timeout

Chromium took too long (usually > 30s):

```javascript
{
  "success": false,
  "error": "PDF render timed out while generating the menu preview"
}
```

#### 500 Internal Server Error

Chromium failed to launch or other rendering issue:

```javascript
{
  "success": false,
  "error": "PDF rendering failed: [specific error]"
}
```

---

## Frontend Implementation

### React Example

#### Basic React Component

```jsx
import React, { useState } from 'react';
import axios from 'axios';

export function MenuPdfRenderer() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleRenderPdf = async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = {
        title: 'Restaurant Menu',
        branding: {
          name: 'My Restaurant',
          phone: '+251-11-234-5678',
          location: 'Addis Ababa'
        },
        items: [
          { name: 'Pizza', price: 250 },
          { name: 'Pasta', price: 200 },
          { name: 'Salad', price: 150 }
        ],
        qrCodeData: 'https://restaurant.com/menu'
      };

      const response = await axios.post(
        'https://api.restaurant.com/api/v1/menu/render-pdf',
        payload,
        {
          responseType: 'blob', // Important: receive as blob
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      // Create blob URL and trigger download
      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'menu.pdf';
      link.click();

      // Cleanup
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to render PDF');
      console.error('PDF render error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleRenderPdf} disabled={loading}>
        {loading ? 'Generating PDF...' : 'Download Menu PDF'}
      </button>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
    </div>
  );
}
```

#### React with Display Preview

```jsx
import React, { useState } from 'react';
import axios from 'axios';

export function MenuPdfPreview() {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const generatePdf = async () => {
    setLoading(true);

    try {
      const response = await axios.post(
        'https://api.restaurant.com/api/v1/menu/render-pdf',
        {
          title: 'Menu',
          items: [
            { name: 'Burger', price: 200 },
            { name: 'Fries', price: 100 }
          ]
        },
        { responseType: 'blob' }
      );

      // Create blob URL for preview
      const url = window.URL.createObjectURL(response.data);
      setPdfUrl(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={generatePdf} disabled={loading}>
        {loading ? 'Generating...' : 'Generate PDF'}
      </button>

      {pdfUrl && (
        <div>
          <iframe src={pdfUrl} width="100%" height="600px" />
          <a href={pdfUrl} download="menu.pdf">
            Download PDF
          </a>
        </div>
      )}
    </div>
  );
}
```

---

### React Native Example

```javascript
import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import axios from 'axios';

export function MenuPdfDownloadButton() {
  const [loading, setLoading] = useState(false);

  const handleDownloadPdf = async () => {
    setLoading(true);

    try {
      const payload = {
        title: 'Restaurant Menu',
        items: [
          { name: 'Doro Wot', price: 280 },
          { name: 'Misir Wot', price: 125 }
        ],
        qrCodeData: 'https://restaurant.com/menu'
      };

      const response = await axios.post(
        'https://api.restaurant.com/api/v1/menu/render-pdf',
        payload,
        { responseType: 'arraybuffer' }
      );

      // Save to file system
      const fileName = `${FileSystem.documentDirectory}menu_${Date.now()}.pdf`;
      await FileSystem.writeAsStringAsync(
        fileName,
        response.data,
        { encoding: FileSystem.EncodingType.Base64 }
      );

      // Share the file
      await Sharing.shareAsync(fileName);

      Alert.alert('Success', 'PDF generated and shared');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to generate PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <TouchableOpacity
        onPress={handleDownloadPdf}
        disabled={loading}
        style={{ padding: 12, backgroundColor: '#007AFF' }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: '#fff', textAlign: 'center' }}>
            Download Menu PDF
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
```

---

### Vue.js 3 Example

```vue
<template>
  <div class="pdf-renderer">
    <button @click="renderPdf" :disabled="loading">
      {{ loading ? 'Generating...' : 'Download Menu PDF' }}
    </button>
    <div v-if="error" class="error">{{ error }}</div>
    <iframe v-if="pdfUrl" :src="pdfUrl" width="100%" height="600"></iframe>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import axios from 'axios';

const loading = ref(false);
const error = ref(null);
const pdfUrl = ref(null);

const renderPdf = async () => {
  loading.value = true;
  error.value = null;

  try {
    const payload = {
      title: 'Our Menu',
      branding: {
        name: 'Restaurant Name',
        phone: '+251-11-234-5678'
      },
      categories: [
        {
          name: 'Appetizers',
          items: [
            { name: 'Misir Wot', price: 125 },
            { name: 'Gomen', price: 120 }
          ]
        }
      ],
      qrCodeData: 'https://restaurant.com/menu'
    };

    const response = await axios.post(
      'https://api.restaurant.com/api/v1/menu/render-pdf',
      payload,
      { responseType: 'blob' }
    );

    pdfUrl.value = URL.createObjectURL(response.data);
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to render PDF';
    console.error('Error:', err);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.error {
  color: red;
  margin-top: 10px;
}
</style>
```

---

### Vanilla JavaScript Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>Menu PDF Renderer</title>
  <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
</head>
<body>
  <button id="renderBtn">Generate Menu PDF</button>
  <div id="status"></div>
  <iframe id="pdfPreview" width="100%" height="600" style="display:none;"></iframe>

  <script>
    document.getElementById('renderBtn').addEventListener('click', async () => {
      const statusEl = document.getElementById('status');
      const btn = document.getElementById('renderBtn');

      btn.disabled = true;
      statusEl.textContent = 'Generating PDF...';

      try {
        const payload = {
          title: 'Restaurant Menu',
          items: [
            { name: 'Pizza', price: 250 },
            { name: 'Pasta', price: 200 }
          ],
          qrCodeData: 'https://restaurant.com/menu'
        };

        const response = await axios.post(
          'https://api.restaurant.com/api/v1/menu/render-pdf',
          payload,
          { responseType: 'blob' }
        );

        // Option 1: Download
        const blobUrl = URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = 'menu.pdf';
        link.click();

        // Option 2: Preview in iframe
        const preview = document.getElementById('pdfPreview');
        preview.src = blobUrl;
        preview.style.display = 'block';

        statusEl.textContent = 'PDF generated successfully!';
      } catch (error) {
        statusEl.textContent = `Error: ${error.response?.data?.error || error.message}`;
        statusEl.style.color = 'red';
      } finally {
        btn.disabled = false;
      }
    });
  </script>
</body>
</html>
```

---

## Error Handling

### Common Errors and Solutions

#### Error: "Invalid settings payload for PDF render"

**Cause:** Payload structure is malformed or missing required fields.

**Solution:** Ensure your payload matches the schema:
```javascript
// ❌ Wrong: items must be an array
const payload = { items: "Pizza" };

// ✅ Correct: items must be an array
const payload = { items: [{ name: "Pizza", price: 250 }] };
```

#### Error: "PDF render timed out while generating the menu preview"

**Cause:** Chromium took too long (usually due to heavy images or large menu).

**Solution:** 
- Reduce number of items
- Optimize image sizes
- Use smaller paper format
- Increase timeout on client side

#### Error: "Failed to launch Chromium for PDF rendering"

**Cause:** Server-side Chromium process failed.

**Solution:** Contact support or check server logs.

### Retry Logic (React)

```javascript
const retryRenderPdf = async (payload, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.post(
        'https://api.restaurant.com/api/v1/menu/render-pdf',
        payload,
        { responseType: 'blob', timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.warn(`Attempt ${i + 1} failed, retrying...`);
      await new Promise(r => setTimeout(r, 2000)); // Wait 2s before retry
    }
  }
};
```

---

## Use Cases

### 1. **Print Menu for Dine-In**

Staff generates menu PDF and prints for tables:

```javascript
// Staff initiates on dashboard
const printMenu = async () => {
  const response = await axios.post('/api/v1/menu/render-pdf', {
    title: 'Table 5 - Menu',
    branding: { name: 'Restaurant' },
    items: [...fetchedMenuItems],
    qrCodeData: `https://restaurant.com/table/5/menu`
  }, { responseType: 'blob' });

  const printWindow = window.open(URL.createObjectURL(response.data));
  printWindow.print();
};
```

---

### 2. **Email Menu as Attachment**

Generate PDF and include in email:

```javascript
// Backend job that sends menu via email
const emailMenu = async (customerEmail) => {
  const pdfBuffer = await MenuPdfService.renderMenuPdf({
    title: 'Special Offer Menu',
    items: weeklySpecials
  });

  await emailService.send({
    to: customerEmail,
    subject: 'This Week\'s Special Menu',
    html: '<p>Check out our new menu attached below:</p>',
    attachments: [{
      filename: 'menu.pdf',
      content: pdfBuffer
    }]
  });
};
```

---

### 3. **QR-Enabled Menu for Takeout Boxes**

Generate menu with table/session QR code:

```javascript
const generateTakeoutMenu = async (orderId) => {
  return await axios.post('/api/v1/menu/render-pdf', {
    paperSize: 'a5',
    title: 'Thank You!',
    items: currentMenuItems,
    qrCodeData: `https://restaurant.com/reorder/${orderId}`,
    branding: { name: 'Restaurant' }
  }, { responseType: 'blob' });
};
```

---

### 4. **Mobile-Friendly Menu Export**

Customer exports menu on mobile app:

```javascript
// React Native
const exportMenuForOffline = async () => {
  const menuData = await fetchMenuFromServer();
  
  const response = await axios.post('/api/v1/menu/render-pdf', {
    items: menuData.items,
    categories: menuData.categories,
    branding: menuData.branding
  }, { responseType: 'arraybuffer' });

  // Save to device
  const filePath = `${FileSystem.documentDirectory}menu.pdf`;
  await FileSystem.writeAsStringAsync(
    filePath,
    response.data,
    { encoding: 'base64' }
  );

  // Later, user can open offline
  await WebBrowser.openBrowserAsync(`file://${filePath}`);
};
```

---

### 5. **Dynamic Menu per Customer**

Generate personalized menu with dietary filters:

```javascript
const getPersonalizedMenuPdf = async (customerId) => {
  const customer = await fetchCustomer(customerId);
  const allItems = await fetchMenuItems();
  
  // Filter: vegan items only
  const items = allItems.filter(
    item => customer.preferences.vegan && item.tags.includes('Vegan')
  );

  return await axios.post('/api/v1/menu/render-pdf', {
    title: `Menu for ${customer.name}`,
    items,
    branding: { name: 'Restaurant' }
  }, { responseType: 'blob' });
};
```

---

## Common Patterns

### Pattern 1: Download & Preview Button

```jsx
function MenuPdfViewer() {
  const [pdfUrl, setPdfUrl] = useState(null);

  const handleGeneratePdf = async () => {
    const response = await axios.post(
      '/api/v1/menu/render-pdf',
      { items: [...], title: 'Menu' },
      { responseType: 'blob' }
    );
    const url = URL.createObjectURL(response.data);
    setPdfUrl(url);
  };

  return (
    <>
      <button onClick={handleGeneratePdf}>Generate</button>
      {pdfUrl && (
        <>
          <iframe src={pdfUrl} />
          <a href={pdfUrl} download="menu.pdf">Download</a>
        </>
      )}
    </>
  );
}
```

---

### Pattern 2: Loading State & Error Handling

```jsx
function SafeMenuPdf() {
  const [state, setState] = useState({ loading: false, error: null, pdf: null });

  const render = async () => {
    setState({ loading: true, error: null, pdf: null });
    try {
      const res = await axios.post(
        '/api/v1/menu/render-pdf',
        { items: [...] },
        { responseType: 'blob', timeout: 30000 }
      );
      setState({ loading: false, error: null, pdf: URL.createObjectURL(res.data) });
    } catch (err) {
      setState({
        loading: false,
        error: err.response?.data?.error || 'Failed to generate PDF',
        pdf: null
      });
    }
  };

  return (
    <>
      <button onClick={render} disabled={state.loading}>
        {state.loading ? '⏳ Generating...' : '📄 Generate PDF'}
      </button>
      {state.error && <p style={{ color: 'red' }}>{state.error}</p>}
      {state.pdf && <iframe src={state.pdf} />}
    </>
  );
}
```

---

### Pattern 3: Multi-Format Export

```javascript
async function exportMenu(format) {
  const menuData = {
    title: 'Restaurant Menu',
    items: await fetchMenuItems(),
    branding: await fetchBranding()
  };

  if (format === 'pdf') {
    return await axios.post(
      '/api/v1/menu/render-pdf',
      menuData,
      { responseType: 'blob' }
    );
  } else if (format === 'json') {
    return menuData;
  } else if (format === 'csv') {
    return convertToCSV(menuData.items);
  }
}
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| PDF is blank | No items provided | Add `items` or `categories` array |
| Images not showing | Invalid image URLs | Use HTTPS URLs, ensure images are accessible |
| QR code missing | Invalid QR data | Ensure `qrCodeData` is a valid string or object |
| PDF too large | Too many items/images | Reduce item count, compress images |
| Font issue | Font not supported | Stick to Noto Sans, Noto Sans Ethiopic |
| Timeout error | Large menu or slow server | Reduce complexity, increase timeout |

---

## Best Practices

1. **Validate payload before sending** to avoid server errors
2. **Use `responseType: 'blob'`** in axios for binary PDF
3. **Set reasonable timeout** (30s minimum)
4. **Cache PDFs** if generating same menu repeatedly
5. **Compress images** to reduce file size
6. **Use QR codes** to link to digital menu
7. **Test across devices** (desktop, mobile, tablet)
8. **Implement retry logic** for robustness
9. **Show loading state** during generation
10. **Handle errors gracefully** with user feedback

---

## API Reference Summary

| Endpoint | Method | Auth | Response |
|----------|--------|------|----------|
| `/api/v1/menu/render-pdf` | POST | None | PDF Blob |

**Request Validation:** Uses Zod schema (`menuRenderPdfSchema`)

**Response Headers:**
- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="menu.pdf"`

---

## Support & FAQ

**Q: Can I use custom fonts?**
A: Currently only Noto Sans and Noto Sans Ethiopic are supported.

**Q: What's the maximum menu size?**
A: No hard limit, but large menus (100+ items) may timeout.

**Q: Can I customize the layout further?**
A: Yes, via `layout`, `density`, `backgroundTint`, and `dividerStyle` per category.

**Q: Do I need authentication?**
A: No, the endpoint is public.

**Q: Can I add images?**
A: Yes, via `imageUrl` field in items.

**Q: Is the PDF downloadable on mobile?**
A: Yes, tested on iOS/Android with React Native.

