# PDF Menu Templates System

This directory contains all PDF menu templates that can be used for rendering.

## Template Names (7 Available)

1. **default-menu** - Standard 2-column grid layout
2. **luxury** - Premium black & gold design
3. **compact** - Minimal compact layout
4. **list-with-photos** - Detailed list with item photos
5. **modern** - Clean modern design
6. **traditional** - Classic restaurant style
7. **minimalist** - Ultra-simple black & white

## How Templates Work

Each template is a function that receives normalized settings and returns HTML.

### Structure

```
templates/
├── README-TEMPLATES.md          (this file)
├── index.js                     (template registry)
├── default-menu.js              (Template 1)
├── luxury.js                    (Template 2)
├── compact.js                   (Template 3)
├── list-with-photos.js          (Template 4)
├── modern.js                    (Template 5)
├── traditional.js               (Template 6)
└── minimalist.js                (Template 7)
```

## Using a Template

### From Frontend

```javascript
const response = await axios.post(
  '/api/v1/menu/render-pdf',
  {
    templateId: 'luxury',        // Specify which template
    title: 'Restaurant Menu',
    items: [...],
    colors: {...},
    branding: {...}
  },
  { responseType: 'blob' }
);
```

### Backend Selection

The MenuPdfService automatically selects the template based on `templateId`:

```javascript
const templates = require('./templates/index');
const template = templates[templateId] || templates['default-menu'];
const html = await template(normalizedSettings);
```

## Template Function Signature

Each template file exports a function:

```javascript
async function renderTemplate(settings) {
  const { colors, fonts, branding, items, categories, qrCodeData } = settings;
  
  return `<!DOCTYPE html>
    <html>
      <!-- Template-specific HTML -->
    </html>`;
}

module.exports = renderTemplate;
```

## Settings Available to Templates

```javascript
{
  templateId: 'luxury',
  paperSize: 'a4',
  orientation: 'portrait',
  title: 'Restaurant Menu',
  subtitle: 'Premium Cuisine',
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
  branding: {
    name: 'Restaurant Name',
    logoUrl: 'https://...',
    coverImageUrl: 'https://...',
    phone: '+251-11-234-5678',
    location: 'Addis Ababa',
    accent: '#f59e0b'
  },
  categories: [{
    name: 'Appetizers',
    layout: 'grid-2col',
    items: [...]
  }],
  items: [...],
  qrCodeData: 'https://...',
  margins: { top: 12, right: 12, bottom: 12, left: 12 }
}
```

## Migration Path

1. ✅ Create template registry (index.js)
2. ✅ Convert each frontend template to backend template function
3. ✅ Store in this directory
4. ✅ Update MenuPdfService to load templates from registry
5. ✅ Frontend sends templateId in payload

Done! Your 7 templates are now configurable. ✅
