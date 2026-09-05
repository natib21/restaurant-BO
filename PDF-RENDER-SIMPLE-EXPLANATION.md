# How `/api/v1/menu/render-pdf` Works - Simple Explanation

## 🎯 In 30 Seconds

You send menu data → Server builds HTML → Server renders to PDF → You download PDF

---

## 🔄 The 4-Step Process

### Step 1: You Send Menu Data

**What you send (from frontend):**

```javascript
axios.post('/api/v1/menu/render-pdf', {
  title: 'Pizza Restaurant',
  items: [
    { name: 'Pizza Margherita', price: 250 },
    { name: 'Pasta Carbonara', price: 280 }
  ],
  qrCodeData: 'https://restaurant.com/menu'
});
```

**What happens:**
- Your browser sends this data as JSON to the server
- Server receives it and validates it

---

### Step 2: Server Validates Your Data

**The server checks:**
- ✅ Is `title` a string? 
- ✅ Is `items` an array?
- ✅ Is `paperSize` valid (a4, a5, etc)?
- ✅ Is `price` a number?
- ... (10+ other checks)

**If something is wrong:**
- ❌ Returns error 400: "Invalid data"

**If everything is OK:**
- ✅ Continues to next step

---

### Step 3: Server Builds HTML & Converts to PDF

**What happens inside the server:**

1. **Creates HTML page** with your menu:
   ```html
   <html>
     <h1>Pizza Restaurant</h1>
     <div class="menu">
       <h2>Pizza Margherita - 250</h2>
       <h2>Pasta Carbonara - 280</h2>
     </div>
     <!-- QR code embedded as image -->
     <img src="[QR code image data]" />
   </html>
   ```

2. **Launches a hidden Chromium browser** (no GUI)
   - Like opening a web page in your browser, but automated
   - Renders the HTML exactly as it would appear in Firefox/Chrome

3. **Takes a "screenshot"** and converts to PDF
   - Chromium renders the page
   - Converts rendered page to PDF format
   - PDF is now ready

4. **Closes the page** and returns PDF to you

---

### Step 4: You Receive & Download PDF

**What the server sends back:**

```
HTTP 200 OK
Content-Type: application/pdf
[Binary PDF file data - 45KB]
```

**What your frontend does:**

```javascript
// Convert PDF data to downloadable file
const url = URL.createObjectURL(response.data);
const link = document.createElement('a');
link.href = url;
link.download = 'menu.pdf';
link.click();  // Download starts
```

**Result:** PDF file saved to your Downloads folder

---

## 📊 Visual Timeline

```
Time 0s    → You click "Download Menu PDF" button
           ↓
Time 0.1s  → Your app sends JSON data to server
           ↓
Time 0.2s  → Server validates data (checks it's correct)
           ↓
Time 0.3s  → Server generates HTML from your data
           ↓
Time 0.4s  → Server launches invisible Chromium browser
           ↓
Time 0.5s  → Browser renders the HTML
           ↓
Time 0.6s  → Server converts rendered page to PDF
           ↓
Time 0.7s  → Server sends PDF file back to your app
           ↓
Time 0.8s  → Your app downloads PDF to your computer
           ↓
Total: ~0.8 seconds ⚡
```

---

## 🎨 What Gets Rendered in the PDF

Starting with your data:

```javascript
{
  title: 'Pizza Restaurant',
  items: [
    { name: 'Pizza Margherita', price: 250 },
    { name: 'Pasta Carbonara', price: 280 }
  ],
  branding: {
    name: 'Pizza Palace',
    phone: '+251-11-123-4567'
  },
  qrCodeData: 'https://restaurant.com/menu'
}
```

The server creates this PDF layout:

```
┌─────────────────────────────────────────┐
│                                         │
│  🅿️  Pizza Restaurant                  │
│      Freshly prepared dishes            │
│                                         │
│  Phone: +251-11-123-4567               │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  MENU                          [QR]    │
│                                |▄▄▄|   │
│  Pizza Margherita - 250        |▄▄▄|   │
│  Delicious cheese and tomato   │Scan│  │
│                                │QR  │  │
│  Pasta Carbonara - 280                 │
│  Creamy pasta with bacon               │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🛠️ Technology Used (Behind the Scenes)

| Technology | What It Does | Example |
|-----------|------------|---------|
| **Express.js** | Web server | Receives your request |
| **Zod** | Data validator | Checks your data is correct |
| **Puppeteer** | Browser automation | Controls headless browser |
| **Chromium** | Browser engine | Renders HTML to pixels |
| **QRCode npm** | QR generator | Creates QR code image |

---

## ❓ Common Questions

### Q: Why do I need to set `responseType: 'blob'`?

**A:** Because the server is sending binary PDF data (not JSON text). You tell axios: "Expect binary data (blob), not text (JSON)".

```javascript
// ❌ Wrong - tries to parse as JSON
axios.post('/api/v1/menu/render-pdf', data)

// ✅ Correct - expects binary
axios.post('/api/v1/menu/render-pdf', data, {
  responseType: 'blob'  // ← This is critical!
})
```

### Q: How long does it take?

**A:** 
- **First time:** ~800ms (Chromium needs to launch)
- **Next times:** ~200ms (Chromium already running)

### Q: What happens if I send bad data?

**A:** Server returns 400 error with message like:
```json
{
  "success": false,
  "error": "Invalid settings payload for PDF render"
}
```

### Q: Can I use this for large menus?

**A:** Yes, but there's a limit:
- **Max items:** ~200 before timeout
- **Max image size:** Should be compressed
- **Timeout:** 30 seconds per PDF

### Q: Does this require authentication?

**A:** No! The endpoint is **public** - anyone can call it without login.

---

## 🚀 Real World Example

### Scenario: Restaurant prints menu for table

**Frontend code:**

```javascript
async function printMenuForTable(tableNumber) {
  const menuData = {
    title: `Table ${tableNumber} - Menu`,
    items: [
      { name: 'Item 1', price: 100 },
      { name: 'Item 2', price: 150 }
    ],
    qrCodeData: `https://restaurant.com/table/${tableNumber}`
  };

  try {
    const response = await axios.post(
      '/api/v1/menu/render-pdf',
      menuData,
      { responseType: 'blob' }
    );

    // Get PDF URL
    const pdfUrl = URL.createObjectURL(response.data);

    // Open print dialog
    window.open(pdfUrl);
    setTimeout(() => window.print(), 500);

    // Result: Menu printed with QR code!

  } catch (error) {
    alert('Failed to generate menu');
  }
}
```

**What happens:**
1. Staff clicks "Print Menu for Table 5"
2. App sends menu data to `/api/v1/menu/render-pdf`
3. Server generates PDF with table number and QR code
4. App opens print dialog
5. Staff presses Print
6. Physical menu printed with QR code

---

## 📝 Minimal Working Code

Save this as `test.html` and open in browser:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
</head>
<body>
  <button onclick="generatePdf()">Generate Menu PDF</button>

  <script>
    async function generatePdf() {
      try {
        const response = await axios.post(
          'http://localhost:3000/api/v1/menu/render-pdf',
          {
            title: 'My Menu',
            items: [
              { name: 'Pizza', price: 250 },
              { name: 'Pasta', price: 200 }
            ]
          },
          { responseType: 'blob' }
        );

        const url = URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'menu.pdf';
        link.click();

        alert('PDF Downloaded!');
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
  </script>
</body>
</html>
```

Click button → Download menu PDF

---

## 🎯 Key Takeaways

1. **What:** Convert menu data to PDF file
2. **How:** HTML → Browser render → PDF
3. **When:** Takes ~0.2-0.8 seconds
4. **Where:** Server-side (you don't need PDF library in frontend)
5. **Why:** Easy distribution (print, email, download)

---

## 🔗 Related Documentation

For more details, see:
- **PDF-RENDER-INTEGRATION-GUIDE.md** - Complete reference with code examples
- **HOW-PDF-RENDER-WORKS.md** - Detailed step-by-step explanation
- **PDF-RENDER-TECHNICAL-ARCHITECTURE.md** - Architecture diagrams and internals

---

That's it! The endpoint works by:

1. ✅ You send menu data
2. ✅ Server validates it  
3. ✅ Server renders to PDF
4. ✅ You download PDF

Simple! 🎉

