# How `/api/v1/menu/render-pdf` Works

## 🎯 Overview

This endpoint takes **menu data** and converts it into a **PDF file**. It's a 4-step process:

```
Frontend Request
       ↓
Validation (Zod Schema)
       ↓
HTML Generation (with styling)
       ↓
PDF Rendering (Puppeteer/Chromium)
       ↓
PDF Blob Response
```

---

## 📋 Step-by-Step Flow

### Step 1️⃣: Frontend Sends Request

**What the frontend sends:**

```javascript
// Your React/Vue/Mobile app sends:
axios.post('https://api.restaurant.com/api/v1/menu/render-pdf', {
  title: 'Restaurant Menu',
  paperSize: 'a4',
  orientation: 'portrait',
  items: [
    { name: 'Pizza', price: 250 },
    { name: 'Pasta', price: 200 }
  ],
  branding: {
    name: 'My Restaurant',
    phone: '+251-11-234-5678'
  },
  qrCodeData: 'https://restaurant.com/menu'
}, { responseType: 'blob' });
```

**Headers sent:**
```
POST /api/v1/menu/render-pdf HTTP/1.1
Host: api.restaurant.com
Content-Type: application/json
```

---

### Step 2️⃣: Backend Receives & Validates

**Route Handler** (`src/modules/menu/router/menus.routes.js`, line 30):

```javascript
router.post(
  '/render-pdf',
  validate(menuRenderPdfSchema, 'body'),  // ← Validation middleware
  menuController.renderMenuPdf            // ← Handler
);
```

**What happens:**

1. Express receives the POST request
2. **Validation middleware** checks the payload against `menuRenderPdfSchema`
3. If validation fails → **400 error** response
4. If validation passes → data is safe, proceed to handler

**Validation Schema** (`src/modules/menu/dto/menu-render-pdf.dto.js`):

```javascript
// Validates these fields:
{
  settings: { ... },              // Optional nested settings
  paperSize: 'a4'|'a5'|...,      // Must be valid paper size
  orientation: 'portrait'|...,    // Must be portrait or landscape
  colors: { ... },                // Must be object with hex colors
  fonts: { ... },                 // Must be object with font configs
  branding: { ... },              // Must be object
  categories: [...],              // Must be array
  items: [...],                   // Must be array
  qrCodeData: 'string'|{...},    // String or object
  margins: { ... }                // Must be object with numbers
}
```

---

### Step 3️⃣: Controller Extracts Settings

**Handler** (`src/modules/menu/controller/menu.controller.js`, line 404):

```javascript
exports.renderMenuPdf = catchAsync(async (req, res) => {
  // Extract validated body
  const settings = req.validatedBody?.settings ?? req.validatedBody;

  // Safety check
  if (!settings || typeof settings !== 'object') {
    throw new AppError('Invalid settings payload for PDF render', 400);
  }

  // Pass to service for rendering
  const result = await MenuPdfService.renderMenuPdf(settings);

  // Send PDF back
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="menu.pdf"');
  res.status(200).send(result.buffer);
});
```

**What it does:**

1. Gets the validated payload from `req.validatedBody`
2. Extracts settings (supports nested `settings` object or flat properties)
3. Calls `MenuPdfService.renderMenuPdf()` to generate PDF
4. Sets response headers
5. Sends PDF buffer back

---

### Step 4️⃣: PDF Service Renders the PDF

**Service** (`src/modules/menu/service/MenuPdfService.js`):

This is where the magic happens! Three main steps:

#### A. Normalize Settings

```javascript
static async renderMenuPdf(settings, options = {}) {
  // 1. Normalize: Apply defaults, ensure consistent format
  const normalized = normalizeSettings(settings);
  
  // 2. Get paper dimensions
  const { widthPx, heightPx } = resolvePaperDimensions(
    normalized.paperSize,
    normalized.orientation
  );
  
  // 3. Generate HTML
  const html = await renderMenuHtml(normalized);
  
  // 4. Render to PDF using Puppeteer
  // ...
}
```

**What normalizeSettings does:**

```javascript
const normalizeSettings = (settings = {}) => {
  return {
    templateId: settings.templateId || 'default-menu',
    paperSize: settings.paperSize || 'a4',
    orientation: settings.orientation || 'portrait',
    
    colors: {
      primary: settings.colors?.primary || '#1f2937',
      secondary: settings.colors?.secondary || '#0f172a',
      accent: settings.colors?.accent || '#f59e0b',
      // ... more color defaults
    },
    
    fonts: {
      heading: { family: '...', size: 24, weight: 700 },
      body: { family: '...', size: 14, weight: 400 },
      // ... more font defaults
    },
    
    categories: Array.isArray(settings.categories) ? settings.categories : [],
    items: Array.isArray(settings.items) ? settings.items : [],
    // ... everything else
  };
};
```

**Example output:**

```javascript
{
  templateId: 'default-menu',
  paperSize: 'a4',
  orientation: 'portrait',
  colors: {
    primary: '#1f2937',
    secondary: '#0f172a',
    accent: '#f59e0b',
    background: '#ffffff',
    text: '#111827',
    border: '#e5e7eb'
  },
  fonts: {
    heading: { family: 'Noto Sans', size: 24, weight: 700 },
    body: { family: 'Noto Sans', size: 14, weight: 400 },
    accent: { family: 'Noto Sans Ethiopic', size: 18, weight: 600 }
  },
  categories: [...],
  items: [...]
}
```

#### B. Resolve Paper Dimensions

```javascript
const resolvePaperDimensions = (paperSize, orientation) => {
  // Map paper size name to mm dimensions
  const PAPER_SIZES = {
    a4: { width: 210, height: 297 },
    a5: { width: 148, height: 210 },
    letter: { width: 216, height: 279 },
    // ...
  };

  const resolved = PAPER_SIZES[paperSize] || PAPER_SIZES.a4;
  
  // If landscape, swap width/height
  const widthMm = orientation === 'landscape' ? resolved.height : resolved.width;
  const heightMm = orientation === 'landscape' ? resolved.width : resolved.height;

  // Convert mm to pixels (96 DPI standard)
  const widthPx = mmToPx(widthMm);   // (mm / 25.4) * 96
  const heightPx = mmToPx(heightMm);

  return { widthMm, heightMm, widthPx, heightPx };
};
```

**Example:**
- Input: `paperSize: 'a4'`, `orientation: 'landscape'`
- Output: `{ widthMm: 297, heightMm: 210, widthPx: 1122, heightPx: 795 }`

#### C. Generate HTML

```javascript
const renderMenuHtml = async (settings) => {
  const { colors, fonts, branding, categories, items, qrCodeData } = settings;

  // Build category markup
  const categoryMarkup = buildCategories(categories.length ? categories : [...]);
  
  // Generate QR code as data URL
  const qrMarkup = await getQrMarkup(qrCodeData);
  
  // Build full HTML page
  return `<!DOCTYPE html>
    <html>
      <head>
        <style>
          /* Embed fonts as file:// URLs for local rendering */
          @font-face {
            font-family: 'Noto Sans';
            src: url('file:///path/to/NotoSans-Regular.woff2') format('woff2');
          }
          
          :root {
            --primary: ${colors.primary};
            --secondary: ${colors.secondary};
            --accent: ${colors.accent};
            /* ... more CSS vars */
          }
          
          /* Global styles */
          body { color: var(--text); font-family: var(--body-font); }
          h1, h2, h3 { font-family: var(--heading-font); }
          /* ... more styles */
        </style>
      </head>
      <body>
        <div class="page">
          <header class="header">
            <div class="title-block">
              <h1>${title}</h1>
              <p>${subtitle}</p>
            </div>
            <div class="meta">
              <span>${branding.phone}</span>
              <span>${branding.location}</span>
            </div>
          </header>
          
          <div class="summary">
            <div>${branding.name}</div>
            <div>${qrMarkup}</div>  <!-- QR code embedded -->
          </div>
          
          <main>${categoryMarkup}</main>
        </div>
      </body>
    </html>`;
};
```

**What HTML includes:**

- Self-hosted fonts (Noto Sans, Noto Sans Ethiopic)
- CSS variables for colors, fonts
- Responsive grid layouts
- QR code as embedded image
- Item cards with images, descriptions, prices, tags
- Print-friendly styling

#### D. Launch Chromium & Render PDF

```javascript
// Launch headless Chromium (if not already running)
const browser = await this.getBrowser();

// Create new page
const page = await browser.newPage();

// Set viewport size
await page.setViewport({
  width: Math.ceil(widthPx) + 120,
  height: Math.ceil(heightPx) + 120,
  deviceScaleFactor: 1
});

// Load HTML into page
await page.setContent(html, { waitUntil: 'networkidle0' });

// Wait for fonts to load
await page.evaluate(async () => {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
});

// Generate PDF
const pdfBuffer = await page.pdf({
  width: `${widthPx}px`,
  height: `${heightPx}px`,
  printBackground: true,
  preferCSSPageSize: false,
  landscape: orientation === 'landscape',
  margin: {
    top: `${(margins.top ?? 12) * 3.78}px`,
    right: `${(margins.right ?? 12) * 3.78}px`,
    bottom: `${(margins.bottom ?? 12) * 3.78}px`,
    left: `${(margins.left ?? 12) * 3.78}px`
  }
});

// Close page (but keep browser for next request)
await page.close();

return { buffer: pdfBuffer, widthMm, heightMm };
```

**What Puppeteer does:**

1. Launches a **headless Chromium browser** (no GUI)
2. Opens a **new page**
3. Loads the **HTML** into the page
4. **Renders** the HTML as it would in a real browser
5. Converts **rendered page to PDF**
6. Returns **PDF as buffer** (binary data)

---

### Step 5️⃣: Frontend Receives PDF

**Response from server:**

```
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="menu.pdf"
Content-Length: 45382

[Binary PDF data...]
```

**Frontend code:**

```javascript
const response = await axios.post('/api/v1/menu/render-pdf', payload, {
  responseType: 'blob'
});

// response.data = Blob (binary PDF file)

// Option 1: Download
const url = URL.createObjectURL(response.data);
const link = document.createElement('a');
link.href = url;
link.download = 'menu.pdf';
link.click();

// Option 2: Preview in iframe
document.getElementById('pdfFrame').src = url;

// Option 3: Open in new tab
window.open(url);
```

---

## 🔄 Complete Flow Diagram

```
┌─ FRONTEND ───────────────────────────────────────┐
│                                                   │
│  React/Vue/Mobile App                            │
│  ├─ Build menu object                            │
│  ├─ axios.post('/render-pdf', menuData)          │
│  └─ Wait for PDF blob                            │
│                                                   │
└─────────────────────┬─────────────────────────────┘
                      │ POST /api/v1/menu/render-pdf
                      │ Content-Type: application/json
                      ↓
┌─ BACKEND ROUTE ────────────────────────────────┐
│                                                 │
│  Route: router.post('/render-pdf', ...)        │
│  ├─ Validation Middleware (Zod)                │
│  │  └─ Check: paperSize, colors, items, ...    │
│  └─ Handler: menuController.renderMenuPdf()    │
│                                                 │
└─────────────────────┬─────────────────────────┘
                      ↓
┌─ CONTROLLER ──────────────────────────────────┐
│                                                │
│  exports.renderMenuPdf = async (req, res) {   │
│  ├─ Extract settings from req.validatedBody   │
│  ├─ Call MenuPdfService.renderMenuPdf()       │
│  └─ Send PDF buffer: res.send(buffer)         │
│  }                                             │
│                                                │
└─────────────────────┬─────────────────────────┘
                      ↓
┌─ SERVICE ──────────────────────────────────────┐
│                                                 │
│  MenuPdfService.renderMenuPdf(settings)        │
│                                                 │
│  Step 1: Normalize settings                    │
│  ├─ Apply defaults (colors, fonts, margins)    │
│  ├─ Validate structure                         │
│  └─ Return normalized object                   │
│                                                 │
│  Step 2: Resolve paper dimensions              │
│  ├─ Look up size (a4 = 210×297mm)              │
│  ├─ Handle landscape/portrait                  │
│  └─ Convert mm → pixels                        │
│                                                 │
│  Step 3: Generate HTML                         │
│  ├─ Build category sections                    │
│  ├─ Build item cards                           │
│  ├─ Generate QR code image                     │
│  ├─ Embed fonts & styling                      │
│  └─ Return complete HTML page                  │
│                                                 │
│  Step 4: Render with Puppeteer                 │
│  ├─ Launch headless Chromium                   │
│  ├─ Load HTML into page                        │
│  ├─ Wait for fonts to load                     │
│  ├─ Render page to PDF                         │
│  ├─ Close page                                 │
│  └─ Return PDF buffer                          │
│                                                 │
└─────────────────────┬─────────────────────────┘
                      │ { buffer: Buffer, ... }
                      ↓
┌─ CONTROLLER (again) ──────────────────────────┐
│                                                │
│ Set response headers:                          │
│ ├─ Content-Type: application/pdf               │
│ ├─ Content-Disposition: attachment             │
│ └─ Send buffer                                 │
│                                                │
└─────────────────────┬─────────────────────────┘
                      │ HTTP 200
                      │ [PDF binary data]
                      ↓
┌─ FRONTEND (again) ──────────────────────────┐
│                                              │
│ Browser receives response:                   │
│ ├─ responseType: 'blob' captures data        │
│ ├─ Creates object URL                        │
│ └─ Download/preview/share PDF               │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 📊 Data Transformation Example

### Frontend Sends:
```javascript
{
  title: 'Lunch Menu',
  items: [
    { name: 'Burger', price: 150 },
    { name: 'Fries', price: 50 }
  ],
  branding: { name: 'Fast Food Inc' }
}
```

### After Normalization:
```javascript
{
  templateId: 'default-menu',
  paperSize: 'a4',
  orientation: 'portrait',
  title: 'Lunch Menu',
  colors: {
    primary: '#1f2937',
    secondary: '#0f172a',
    accent: '#f59e0b',
    background: '#ffffff',
    text: '#111827',
    border: '#e5e7eb'
  },
  fonts: {
    heading: { family: 'Noto Sans', size: 24, weight: 700 },
    body: { family: 'Noto Sans', size: 14, weight: 400 },
    accent: { family: 'Noto Sans Ethiopic', size: 18, weight: 600 }
  },
  branding: { name: 'Fast Food Inc', phone: '', location: '' },
  categories: [],
  items: [
    { name: 'Burger', price: 150 },
    { name: 'Fries', price: 50 }
  ],
  qrCodeData: undefined,
  margins: { top: 12, right: 12, bottom: 12, left: 12 }
}
```

### HTML Generated:
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    :root {
      --primary: #1f2937;
      --accent: #f59e0b;
      /* ... */
    }
    body { color: #111827; font-family: 'Noto Sans'; }
    .menu-item { border: 1px solid #e5e7eb; padding: 14px; }
  </style>
</head>
<body>
  <div class="page">
    <header>
      <h1>Lunch Menu</h1>
    </header>
    <main>
      <section class="category">
        <h3>Menu</h3>
        <div class="grid-2col">
          <article class="menu-item">
            <h4>Burger</h4>
            <strong>150</strong>
          </article>
          <article class="menu-item">
            <h4>Fries</h4>
            <strong>50</strong>
          </article>
        </div>
      </section>
    </main>
  </div>
</body>
</html>
```

### PDF Generated:
- A4 portrait page
- Header with "Lunch Menu"
- Two items in 2-column grid
- Using normalized colors, fonts, spacing

---

## ⚡ Key Technologies

| Technology | Purpose | Why |
|------------|---------|-----|
| **Zod** | Input validation | Ensure safe data before processing |
| **Puppeteer** | Headless browser | Render HTML as browser would |
| **Chromium** | Browser engine | Execute JavaScript, apply CSS, render fonts |
| **woff2 fonts** | Self-hosted fonts | Noto Sans for latin, Ethiopic for Amharic |
| **QRCode npm** | Generate QR codes | Create QR images from data |

---

## 🚀 Performance Notes

- **First request:** Slower (launches Chromium)
- **Subsequent requests:** Faster (reuses browser process)
- **Timeout:** ~30 seconds per PDF
- **Memory:** Chromium uses ~200-300MB
- **Concurrency:** Can handle multiple PDFs in parallel

---

## ❌ Common Errors & Why They Happen

| Error | Reason |
|-------|--------|
| "Invalid settings payload" | Payload didn't pass Zod validation |
| "PDF render timed out" | Menu too large or Chromium slow |
| "Failed to launch Chromium" | Server issue or missing dependencies |
| "No items provided" | Items array is empty |
| "Unsupported paper size" | Invalid paperSize value |

---

## ✅ Summary

The endpoint works in **5 stages**:

1. **Frontend sends** menu data as JSON
2. **Backend validates** using Zod schema
3. **Controller extracts** settings
4. **Service normalizes** → generates HTML → renders PDF using Puppeteer
5. **Frontend receives** PDF blob for download/preview

**Total time:** 1-5 seconds depending on menu size.

