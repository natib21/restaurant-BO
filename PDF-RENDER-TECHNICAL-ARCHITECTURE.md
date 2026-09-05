# PDF Render Endpoint - Technical Deep Dive

## 🏗️ Architecture Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                             │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  React Component / Vue App / React Native                         │
│  ┌────────────────────────────────────────────────┐               │
│  │ User clicks "Download Menu PDF"                │               │
│  │ ↓                                              │               │
│  │ Prepare menu payload:                          │               │
│  │ {                                              │               │
│  │   title: '...',                                │               │
│  │   items: [...],                                │               │
│  │   branding: {...},                             │               │
│  │   qrCodeData: '...'                            │               │
│  │ }                                              │               │
│  │ ↓                                              │               │
│  │ axios.post('/api/v1/menu/render-pdf', data, { │               │
│  │   responseType: 'blob'  ← CRITICAL!            │               │
│  │ })                                             │               │
│  │ ↓                                              │               │
│  │ Wait for response...                           │               │
│  └────────────────────────────────────────────────┘               │
│                                                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP POST Request
                             │ Content-Type: application/json
                             │
┌─────────────────────────────┼────────────────────────────────────┐
│                   NETWORK / HTTP LAYER                           │
├─────────────────────────────┼────────────────────────────────────┤
│                             ↓                                    │
│  POST /api/v1/menu/render-pdf                                   │
│  {                                                              │
│    "title": "...",                                              │
│    "items": [{ "name": "...", "price": 100 }],                 │
│    "qrCodeData": "..."                                          │
│  }                                                              │
│                             ↓                                    │
└─────────────────────────────┼────────────────────────────────────┘
                             │ 
┌─────────────────────────────┼────────────────────────────────────┐
│                    BACKEND ROUTE LAYER                           │
├─────────────────────────────┼────────────────────────────────────┤
│                             ↓                                    │
│  router.post(                                                   │
│    '/render-pdf',                                               │
│    validate(menuRenderPdfSchema, 'body'),  ← Middleware 1      │
│    menuController.renderMenuPdf             ← Middleware 2      │
│  )                                                              │
│                                                                 │
│  ┌─────────────────────────────────────────┐                   │
│  │ Validation Middleware                    │                   │
│  │ ├─ Check paperSize ∈ [a4,a5,letter,...]│                   │
│  │ ├─ Check orientation ∈ [portrait,...]  │                   │
│  │ ├─ Check items is array                 │                   │
│  │ ├─ Check colors is object               │                   │
│  │ └─ Check all required types             │                   │
│  │    ↓ If validation fails → 400 error    │                   │
│  │    ↓ If validation passes → continue    │                   │
│  └─────────────────────────────────────────┘                   │
│                             ↓                                    │
│  ┌─────────────────────────────────────────┐                   │
│  │ Controller: renderMenuPdf()              │                   │
│  │ ├─ Extract: req.validatedBody            │                   │
│  │ ├─ Validate not null/empty              │                   │
│  │ ├─ Call MenuPdfService.renderMenuPdf()  │                   │
│  │ └─ Set response headers                 │                   │
│  │    Content-Type: application/pdf        │                   │
│  │    Content-Disposition: attachment      │                   │
│  └─────────────────────────────────────────┘                   │
│                             ↓                                    │
└─────────────────────────────┼────────────────────────────────────┘
                             │
┌─────────────────────────────┼────────────────────────────────────┐
│                    SERVICE / BUSINESS LOGIC LAYER                │
├─────────────────────────────┼────────────────────────────────────┤
│                             ↓                                    │
│  MenuPdfService.renderMenuPdf(settings)                         │
│                                                                 │
│  ┌──────────────────────────────────────────────┐              │
│  │ STEP 1: NORMALIZE SETTINGS                   │              │
│  │                                              │              │
│  │  Input: { title: '...', items: [...] }      │              │
│  │  Output: {                                   │              │
│  │    title: '...',                             │              │
│  │    items: [...],                             │              │
│  │    colors: {                                 │              │
│  │      primary: '#1f2937',   ← Default         │              │
│  │      secondary: '#0f172a', ← Default         │              │
│  │      accent: '#f59e0b',    ← Default         │              │
│  │      ...                                     │              │
│  │    },                                        │              │
│  │    fonts: {                                  │              │
│  │      heading: { size: 24, ... } ← Default    │              │
│  │      body: { size: 14, ... } ← Default       │              │
│  │      ...                                     │              │
│  │    },                                        │              │
│  │    margins: { ... } ← Default                │              │
│  │    ... (all fields present & validated)      │              │
│  │  }                                           │              │
│  └──────────────────────────────────────────────┘              │
│                             ↓                                    │
│  ┌──────────────────────────────────────────────┐              │
│  │ STEP 2: RESOLVE PAPER DIMENSIONS             │              │
│  │                                              │              │
│  │  Input: paperSize='a4', orientation='port'  │              │
│  │  ├─ A4 = 210mm × 297mm                       │              │
│  │  ├─ Portrait = width stays, height stays     │              │
│  │  ├─ Convert mm → pixels: (mm / 25.4) × 96   │              │
│  │  └─ Output: {                                │              │
│  │      widthMm: 210,                           │              │
│  │      heightMm: 297,                          │              │
│  │      widthPx: 794,                           │              │
│  │      heightPx: 1123                          │              │
│  │    }                                         │              │
│  └──────────────────────────────────────────────┘              │
│                             ↓                                    │
│  ┌──────────────────────────────────────────────┐              │
│  │ STEP 3: GENERATE HTML                        │              │
│  │                                              │              │
│  │  Build complete HTML page:                   │              │
│  │  ├─ Font face declarations (self-hosted)    │              │
│  │  ├─ CSS variables (colors, fonts)            │              │
│  │  ├─ Global styles (responsive, print)        │              │
│  │  ├─ Header section (title, branding)         │              │
│  │  ├─ Category sections (organized items)      │              │
│  │  │  ├─ Grid 2-col layout?                    │              │
│  │  │  ├─ List with photos layout?              │              │
│  │  │  └─ Compact price list layout?            │              │
│  │  ├─ Item cards (with images, tags)           │              │
│  │  ├─ QR code (if qrCodeData provided)         │              │
│  │  │  └─ QRCode.toDataURL() → embed as img     │              │
│  │  └─ Footer                                   │              │
│  │                                              │              │
│  │  Output: Complete HTML string                │              │
│  └──────────────────────────────────────────────┘              │
│                             ↓                                    │
│  ┌──────────────────────────────────────────────┐              │
│  │ STEP 4: RENDER TO PDF (PUPPETEER)            │              │
│  │                                              │              │
│  │  ① Get Chromium browser:                     │              │
│  │     ├─ If running: reuse existing            │              │
│  │     └─ If not: launch new process            │              │
│  │                                              │              │
│  │  ② Create new page in browser                │              │
│  │                                              │              │
│  │  ③ Set viewport:                             │              │
│  │     width: 794px, height: 1123px             │              │
│  │                                              │              │
│  │  ④ Load HTML into page:                      │              │
│  │     page.setContent(html)                    │              │
│  │     └─ Browser renders HTML as if opened     │              │
│  │        in normal browser tab                 │              │
│  │                                              │              │
│  │  ⑤ Wait for fonts to load:                   │              │
│  │     document.fonts.ready                     │              │
│  │                                              │              │
│  │  ⑥ Generate PDF:                             │              │
│  │     page.pdf({                               │              │
│  │       width: '794px',                        │              │
│  │       height: '1123px',                      │              │
│  │       printBackground: true,                │              │
│  │       margin: { top: 45px, ... }             │              │
│  │     })                                       │              │
│  │     └─ Returns PDF as Buffer (binary)        │              │
│  │                                              │              │
│  │  ⑦ Close page (keep browser for next req)    │              │
│  │                                              │              │
│  │  Output: { buffer: Buffer, ... }             │              │
│  └──────────────────────────────────────────────┘              │
│                             ↓                                    │
│  Return to Controller                                           │
│                                                                 │
└─────────────────────────────┬────────────────────────────────────┘
                             │ { buffer: PDF binary data }
                             │
┌─────────────────────────────┼────────────────────────────────────┐
│                 RESPONSE / TRANSMISSION LAYER                    │
├─────────────────────────────┼────────────────────────────────────┤
│                             ↓                                    │
│  HTTP 200 OK                                                    │
│  Content-Type: application/pdf                                 │
│  Content-Disposition: attachment; filename="menu.pdf"          │
│  Content-Length: 45382                                         │
│                                                                 │
│  [Binary PDF data - 45KB]                                       │
│  %PDF-1.4                                                       │
│  ... (PDF binary content) ...                                   │
│                             ↓                                    │
└─────────────────────────────┼────────────────────────────────────┘
                             │
┌─────────────────────────────┼────────────────────────────────────┐
│                 FRONTEND RESPONSE HANDLING                       │
├─────────────────────────────┼────────────────────────────────────┤
│                             ↓                                    │
│  axios receives HTTP 200                                        │
│  ├─ response.data = Blob (binary PDF)  ← because responseType   │
│  ├─ response.headers['content-type'] = 'application/pdf'       │
│  └─ response.status = 200                                       │
│                                                                 │
│  ┌────────────────────────────────────────┐                    │
│  │ Option 1: Download                     │                    │
│  │ const url = URL.createObjectURL(blob)  │                    │
│  │ const link = document.createElement()  │                    │
│  │ link.href = url; link.download = '...' │                    │
│  │ link.click()  ← User saves PDF file     │                    │
│  └────────────────────────────────────────┘                    │
│                                                                 │
│  ┌────────────────────────────────────────┐                    │
│  │ Option 2: Preview                      │                    │
│  │ const url = URL.createObjectURL(blob)  │                    │
│  │ <iframe src={url} />  ← Display in app  │                    │
│  └────────────────────────────────────────┘                    │
│                                                                 │
│  ┌────────────────────────────────────────┐                    │
│  │ Option 3: Share/Email                  │                    │
│  │ Send blob to file sharing service      │                    │
│  │ or attach to email                     │                    │
│  └────────────────────────────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Request/Response Payload Details

### Request Headers
```
POST /api/v1/menu/render-pdf HTTP/1.1
Host: api.restaurant.com
Content-Type: application/json
Content-Length: 1250
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)
Accept: application/json
```

### Request Body (JSON)
```json
{
  "paperSize": "a4",
  "orientation": "portrait",
  "title": "Restaurant Menu",
  "subtitle": "Fresh Cuisine",
  "branding": {
    "name": "My Restaurant",
    "phone": "+251-11-234-5678",
    "location": "Addis Ababa"
  },
  "colors": {
    "primary": "#1f2937",
    "accent": "#f59e0b"
  },
  "categories": [
    {
      "name": "Appetizers",
      "items": [
        {
          "name": "Misir Wot",
          "price": 125,
          "tags": ["Vegan"]
        }
      ]
    }
  ],
  "qrCodeData": "https://restaurant.com/menu"
}
```

### Response Headers
```
HTTP/1.1 200 OK
Date: Thu, 05 Sep 2024 10:30:45 GMT
Server: Express.js
Content-Type: application/pdf
Content-Disposition: attachment; filename="menu.pdf"
Content-Length: 45382
Cache-Control: no-cache
Connection: keep-alive
```

### Response Body
```
[Binary PDF data - 45KB]

%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
... (PDF binary content) ...
```

---

## 🔄 Internal Function Call Flow

```
renderMenuPdf (Controller)
  │
  ├─ req.validatedBody extracted (✓ passed Zod validation)
  │
  └─→ MenuPdfService.renderMenuPdf(settings)
      │
      ├─→ normalizeSettings(settings)
      │   │
      │   └─ Output: {
      │         paperSize: 'a4',
      │         colors: {...},
      │         fonts: {...},
      │         ... (all defaults applied)
      │       }
      │
      ├─→ resolvePaperDimensions('a4', 'portrait')
      │   │
      │   ├─ mmToPx(210) → 794px
      │   ├─ mmToPx(297) → 1123px
      │   │
      │   └─ Output: { widthPx: 794, heightPx: 1123, ... }
      │
      ├─→ buildCategories(categories)
      │   │
      │   ├─ For each category:
      │   │   └─ buildMenuItems(items, layout)
      │   │       └─ For each item:
      │   │           └─ escapeHtml(item.name)
      │   │           └─ escapeHtml(item.description)
      │   │           └─ Format price, tags, images
      │   │
      │   └─ Output: HTML markup string
      │
      ├─→ getQrMarkup(qrCodeData)
      │   │
      │   ├─ QRCode.toDataURL(qrCodeData)
      │   │   └─ Returns data:image/png;base64,...
      │   │
      │   └─ Wrap in HTML: <img src="data:..." />
      │
      ├─→ renderMenuHtml(settings)
      │   │
      │   ├─ Template: <!DOCTYPE html>...<html>...</html>
      │   ├─ Embed fonts: @font-face { src: url(file://...) }
      │   ├─ CSS variables: --primary, --accent, etc
      │   ├─ Insert: categoryMarkup, qrMarkup
      │   │
      │   └─ Output: Complete HTML string
      │
      ├─→ getBrowser()
      │   │
      │   ├─ Check if browser exists and connected
      │   ├─ If not: await puppeteer.launch({...})
      │   │
      │   └─ Return: Chromium browser instance
      │
      ├─→ browser.newPage()
      │   └─ Return: New page in browser
      │
      ├─→ page.setViewport({ width: 794, height: 1123 })
      │
      ├─→ page.setContent(html, { waitUntil: 'networkidle0' })
      │   │
      │   ├─ Browser loads HTML
      │   ├─ Executes JavaScript
      │   ├─ Applies CSS
      │   ├─ Loads images & fonts
      │   └─ Waits for network idle
      │
      ├─→ page.evaluate(() => { await document.fonts.ready })
      │   │
      │   └─ Wait for all fonts to be loaded
      │
      ├─→ page.pdf({ width: '794px', height: '1123px', ... })
      │   │
      │   ├─ Take "screenshot" of rendered page
      │   ├─ Convert to PDF format
      │   ├─ Apply margins, scaling
      │   │
      │   └─ Return: Buffer (binary PDF data)
      │
      ├─→ page.close()
      │   │
      │   └─ Release page resources (keep browser)
      │
      └─ Return: { buffer: Buffer, widthMm: 210, heightMm: 297 }
         │
         └─ Back to Controller
            │
            ├─ Set headers: Content-Type, Content-Disposition
            ├─ res.status(200).send(buffer)
            │
            └─ Response sent to Frontend
```

---

## 🎨 HTML Structure Generated

The service generates an HTML page with this structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Restaurant Menu</title>
  <style>
    /* 1. Font declarations (self-hosted .woff2 files) */
    @font-face {
      font-family: 'Noto Sans';
      font-weight: 400;
      src: url('file:///path/to/NotoSans-Regular.woff2') format('woff2');
    }
    @font-face {
      font-family: 'Noto Sans';
      font-weight: 700;
      src: url('file:///path/to/NotoSans-Bold.woff2') format('woff2');
    }
    
    /* 2. CSS variables (from normalized colors) */
    :root {
      --primary: #1f2937;
      --secondary: #0f172a;
      --accent: #f59e0b;
      --background: #ffffff;
      --text: #111827;
      --border: #e5e7eb;
      --heading-font: 'Noto Sans', sans-serif;
      --body-font: 'Noto Sans', sans-serif;
    }
    
    /* 3. Global styles */
    * { box-sizing: border-box; }
    body { margin: 0; font-family: var(--body-font); }
    h1, h2, h3 { font-family: var(--heading-font); }
    
    /* 4. Print-friendly */
    @media print {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    /* 5. Component styles */
    .page { width: 100%; min-height: 100vh; padding: 36px; }
    .header { display: flex; border-bottom: 2px solid var(--border); }
    .category { margin-top: 24px; padding: 12px; }
    .menu-item { border: 1px solid var(--border); padding: 14px; }
    .grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 18px; }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header section -->
    <header class="header">
      <div class="brand">
        <div class="brand-mark">M</div>  <!-- First letter of restaurant name -->
        <div class="title-block">
          <h1>Restaurant Menu</h1>
          <p>Fresh Cuisine</p>
        </div>
      </div>
      <div class="meta">
        <span>Phone: +251-11-234-5678</span>
        <span>Location: Addis Ababa</span>
      </div>
    </header>

    <!-- Summary section -->
    <div class="summary">
      <div>
        <h2>Restaurant Menu</h2>
      </div>
      <div>
        <!-- QR code embedded as <img> with data:image/png;base64 -->
        <div class="qr-card">
          <img src="data:image/png;base64,iVBORw0KG..." alt="QR code" />
          <span>Scan to open menu</span>
        </div>
      </div>
    </div>

    <!-- Main content -->
    <main>
      <!-- Category 1: Appetizers -->
      <section class="category bg-none divider-line density-normal">
        <h3>Appetizers</h3>
        <div class="grid-2col">
          <!-- Item 1 -->
          <article class="menu-item">
            <div class="menu-item-header">
              <h4>Misir Wot</h4>
              <strong>125</strong>
            </div>
            <p>Spiced red lentil stew</p>
            <div class="tags">
              <span>Vegan</span>
              <span>Spicy</span>
            </div>
          </article>
          
          <!-- Item 2 -->
          <article class="menu-item">
            <div class="menu-item-header">
              <h4>Gomen</h4>
              <strong>120</strong>
            </div>
            <p>Sautéed collard greens</p>
            <div class="tags">
              <span>Vegan</span>
            </div>
          </article>
        </div>
      </section>

      <!-- Category 2: Main Dishes -->
      <section class="category bg-card divider-dashed density-normal">
        <h3>Main Dishes</h3>
        <div class="list-with-photos">
          <!-- Item with photo -->
          <article class="menu-item">
            <div class="thumb">
              <img src="https://cdn.example.com/doro-wot.jpg" />
            </div>
            <div class="menu-item-copy">
              <div class="menu-item-header">
                <h4>Doro Wot</h4>
                <strong>280</strong>
              </div>
              <p>Slow-cooked chicken in spiced sauce</p>
              <div class="tags">
                <span>Popular</span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  </div>
</body>
</html>
```

---

## 📊 Data Size Comparison

| Component | Size |
|-----------|------|
| HTML (rendered) | ~2-5 KB |
| CSS styles | ~8-12 KB |
| Images (embedded in PDF) | 10-20 KB |
| PDF metadata | ~2 KB |
| QR code (embedded) | ~1 KB |
| **Total PDF** | **30-50 KB** |

---

## ⚙️ Browser Process Management

```
First Request:
├─ Puppeteer launches Chromium
│  └─ ~300MB memory used
├─ Creates page
├─ Renders PDF
├─ Closes page (NOT browser)
└─ Browser stays running

Subsequent Requests:
├─ Reuse existing Chromium process
├─ Create new page
├─ Render PDF
├─ Close page
└─ Browser still running

Benefit: ~5x faster after first request
```

---

## 🔐 Security Considerations

1. **Input Validation:**
   - Zod schema validates all inputs
   - HTML escaping prevents XSS
   - No user code execution

2. **Resource Limits:**
   - Timeout: 30 seconds per PDF
   - Memory: Chromium uses ~300MB
   - File size: ~50KB per PDF

3. **Chromium Sandboxing:**
   - `--no-sandbox` disabled for development
   - Should be enabled in production

---

## 🚀 Performance Optimization

```
Timeline for PDF Generation:

Time 0ms:   Request received
Time 10ms:  Validation complete
Time 20ms:  Settings normalized
Time 50ms:  HTML generated
Time 100ms: Chromium browser ready (first request)
Time 150ms: Page created
Time 200ms: HTML loaded into page
Time 300ms: Fonts loaded
Time 400ms: PDF generated
Time 420ms: Response sent to client

Total: ~420ms (first request)
Total: ~200ms (subsequent requests)
```

---

## Summary

The `/api/v1/menu/render-pdf` endpoint:

1. **Accepts** menu data as JSON
2. **Validates** using Zod schema
3. **Normalizes** with defaults
4. **Generates** HTML with styling & fonts
5. **Renders** with headless Chromium (Puppeteer)
6. **Returns** PDF as binary blob

**Key technologies:** Express.js, Zod, Puppeteer, Chromium, QRCode, Noto Sans fonts

