# Backend PDF Template Generation - How It Works

## ✅ Yes! Backend Generates Its Own Template

The backend **does NOT** use a pre-made template file. Instead, it **dynamically generates HTML** from your menu data.

---

## 🏗️ How It Works

### Step 1: You Send Menu Data

```javascript
{
  title: 'Pizza Menu',
  items: [
    { name: 'Pizza Margherita', price: 250 },
    { name: 'Pasta Carbonara', price: 280 }
  ],
  colors: { primary: '#1f2937', accent: '#f59e0b' },
  branding: { name: 'Pizza Palace', phone: '+251-11-234-5678' }
}
```

### Step 2: Backend Builds HTML Template

The `renderMenuHtml()` function in `MenuPdfService.js` creates an HTML page:

```javascript
const renderMenuHtml = async (settings) => {
  // 1. Extract your data
  const { colors, fonts, branding, categories, items, qrCodeData } = settings;

  // 2. Build HTML string (not from file!)
  return `<!DOCTYPE html>
    <html>
      <head>
        <style>
          /* Embed your colors as CSS variables */
          :root {
            --primary: ${colors.primary};
            --accent: ${colors.accent};
            /* ... */
          }
          /* Global styles */
          body { color: var(--text); font-family: '${fonts.body.family}'; }
          /* ... more CSS ... */
        </style>
      </head>
      <body>
        <header>
          <h1>${escapeHtml(branding.name)}</h1>
          <p>${branding.phone}</p>
        </header>
        <main>
          ${categoryMarkup}  <!-- Built from your items -->
        </main>
      </body>
    </html>`;
};
```

### Step 3: Browser Renders the HTML

```
HTML String Generated
       ↓
Chromium Browser receives it
       ↓
Browser renders (like opening in Chrome)
       ↓
Fonts load, CSS applied, images rendered
```

### Step 4: PDF Generated from Rendered Page

```
Rendered Page (in browser memory)
       ↓
Puppeteer takes screenshot
       ↓
Converts to PDF
       ↓
Returns PDF blob
```

---

## 📋 Template Structure (Generated Dynamically)

The backend builds this template **at runtime** (not from file):

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Restaurant Menu</title>
    <style>
      /* 1. Font declarations (self-hosted from assets/fonts/) */
      @font-face {
        font-family: 'Noto Sans';
        src: url('file:///path/to/NotoSans-Regular.woff2');
      }
      
      /* 2. CSS variables from your colors */
      :root {
        --primary: #1f2937;        <!-- From your data -->
        --secondary: #0f172a;      <!-- From your data -->
        --accent: #f59e0b;         <!-- From your data -->
        --background: #ffffff;
        --text: #111827;
        --border: #e5e7eb;
      }
      
      /* 3. Global styles */
      body {
        background: var(--background);
        color: var(--text);
        font-family: 'Noto Sans';
      }
      
      /* 4. Component styles */
      .header { border-bottom: 2px solid var(--border); }
      .menu-item { border: 1px solid var(--border); padding: 14px; }
    </style>
  </head>
  
  <body>
    <div class="page">
      <!-- Header built from branding data -->
      <header>
        <div class="brand">
          <div class="brand-mark">P</div> <!-- First letter of branding.name -->
          <div class="title-block">
            <h1>Pizza Palace</h1>        <!-- branding.name -->
            <p>Freshly prepared dishes</p>
          </div>
        </div>
        <div class="meta">
          <span>+251-11-234-5678</span>  <!-- branding.phone -->
        </div>
      </header>
      
      <!-- Main content built from your items -->
      <main>
        <section class="category">
          <h3>Pizza</h3>
          <div class="grid-2col">
            <!-- Each item becomes a card -->
            <article class="menu-item">
              <h4>Pizza Margherita</h4>
              <strong>250</strong>
            </article>
            <article class="menu-item">
              <h4>Pasta Carbonara</h4>
              <strong>280</strong>
            </article>
          </div>
        </section>
      </main>
    </div>
  </body>
</html>
```

---

## 🔄 Flow Diagram

```
Your Frontend sends:
┌───────────────────────┐
│ {                     │
│   title: "Menu",      │
│   items: [...],       │
│   colors: {...},      │
│   branding: {...}     │
│ }                     │
└───────────┬───────────┘
            │
            ↓
Backend receives in MenuPdfService
            │
            ├─→ normalizeSettings()
            │   ├─ Apply defaults
            │   └─ Validate structure
            │
            ├─→ buildCategories() + buildMenuItems()
            │   ├─ Loop through your items
            │   └─ Create HTML for each
            │
            ├─→ getQrMarkup()
            │   └─ Generate QR code image
            │
            ├─→ renderMenuHtml() ← BUILDS TEMPLATE HERE
            │   ├─ Create complete HTML string
            │   ├─ Inject your data into HTML
            │   ├─ Embed CSS with your colors
            │   └─ Return full HTML page
            │
            ├─→ Launch Chromium
            │
            ├─→ page.setContent(html)
            │   ├─ Browser renders the HTML
            │   ├─ CSS applied
            │   ├─ Fonts loaded
            │   └─ Page rendered in memory
            │
            ├─→ page.pdf()
            │   ├─ Convert rendered page to PDF
            │   └─ Return PDF buffer
            │
            ↓
PDF returned to your frontend
```

---

## 📄 Template Parts

### 1. Header (From Your Branding)

**Generated from:**
```javascript
{
  branding: {
    name: 'Pizza Palace',
    phone: '+251-11-234-5678',
    location: 'Downtown'
  }
}
```

**Becomes:**
```html
<header class="header">
  <div class="brand">
    <div class="brand-mark">P</div>
    <div class="title-block">
      <h1>Pizza Palace</h1>
      <p>Freshly prepared dishes & beverages</p>
    </div>
  </div>
  <div class="meta">
    <span>Phone: +251-11-234-5678</span>
    <span>Location: Downtown</span>
  </div>
</header>
```

### 2. Menu Items (From Your Items Array)

**Generated from:**
```javascript
{
  items: [
    {
      name: 'Pizza Margherita',
      description: 'Cheese and tomato',
      price: 250,
      tags: ['Popular', 'Vegan']
    }
  ]
}
```

**Becomes:**
```html
<article class="menu-item">
  <div class="menu-item-header">
    <h4>Pizza Margherita</h4>
    <strong>250</strong>
  </div>
  <p>Cheese and tomato</p>
  <div class="tags">
    <span>Popular</span>
    <span>Vegan</span>
  </div>
</article>
```

### 3. Colors (From Your Colors Object)

**Generated from:**
```javascript
{
  colors: {
    primary: '#1f2937',
    accent: '#f59e0b',
    background: '#ffffff'
  }
}
```

**Becomes:**
```css
:root {
  --primary: #1f2937;
  --accent: #f59e0b;
  --background: #ffffff;
}

body { background: var(--background); }
.header { color: var(--primary); }
h1 { color: var(--primary); }
```

### 4. QR Code (Generated if Provided)

**Generated from:**
```javascript
{
  qrCodeData: 'https://restaurant.com/menu'
}
```

**Process:**
```
1. QRCode.toDataURL('https://...') 
   → Creates QR code as image
   
2. Returns: data:image/png;base64,...
   
3. Embeds in HTML:
   <img src="data:image/png;base64,..." alt="QR code" />
```

---

## 🎨 Key Template Features

| Feature | How It Works | From Your Data |
|---------|------------|-----------------|
| **Colors** | CSS variables | `colors: {...}` |
| **Fonts** | Self-hosted .woff2 | `fonts: {...}` |
| **Branding** | Header section | `branding: {...}` |
| **Items** | Grid/list layout | `items: [...]` |
| **Categories** | Sections | `categories: [...]` |
| **QR Code** | Embedded image | `qrCodeData: '...'` |
| **Margins** | CSS padding | `margins: {...}` |
| **Layout** | Grid-2col, list, compact | `layout: 'grid-2col'` |

---

## 💡 Why No Template File?

✅ **Advantages of dynamic generation:**

1. **Flexible** - Works with any data structure
2. **No file system** - Template doesn't need to exist on disk
3. **Fast** - String concatenation is quick
4. **Safe** - Data is escaped (prevents XSS)
5. **Customizable** - Easy to add new features

❌ **If using template files:**

1. Need separate .html files
2. Hard to inject dynamic data
3. Slower to load from disk
4. More complex logic

---

## 🚀 In Summary

**Backend PDF generation:**

```
Your menu data (JSON)
       ↓
renderMenuHtml() function
  ├─ Builds complete HTML string
  ├─ Injects your data
  ├─ Applies your styles
  └─ Creates full page
       ↓
Puppeteer renders HTML in Chromium
       ↓
Converts rendered page to PDF
       ↓
Returns PDF blob to frontend
```

**NO template files needed!** Everything is generated at runtime. ✅

---

## 📍 File Locations

```
Backend Code:
src/modules/menu/service/MenuPdfService.js
  ├─ Line 229: renderMenuHtml()      ← Builds template
  ├─ Line 228: buildCategories()     ← Item sections
  ├─ Line 228: buildMenuItems()      ← Item cards
  ├─ Line 228: getQrMarkup()         ← QR code
  └─ Line 228: normalizeSettings()   ← Apply defaults

Entry Point:
src/modules/menu/controller/menu.controller.js
  └─ Line 404: renderMenuPdf()       ← Handler calls service

Route:
src/modules/menu/router/menus.routes.js
  └─ Line 30: router.post('/render-pdf', ...)
```

---

## ✨ Key Insight

The backend doesn't say: *"Load menu.html file and fill in the blanks"*

Instead it says: *"I have your data. Now I'll BUILD the entire HTML page myself, inject your data into it, then render it to PDF"*

That's the power of dynamic template generation! 🎉

