# QR Menu ET – All-in-One Restaurant Operating System for Ethiopia

![Banner](https://via.placeholder.com/1920x600/1A1A2E/FFFFFF?text=QR+Menu+ET+%E2%80%93+Ethiopia%E2%80%99s+%231+Restaurant+Platform)  
_Replace with your real banner_

**The complete restaurant platform for Ethiopia — built the right way.**

- When customers are **inside** → Scan QR → Browse menu → Order instantly
- When customers are **outside** → Visit beautiful restaurant website → Order pickup/delivery

One system. Two perfect experiences.

Proudly built in Addis Ababa • Works for 1 branch or 100+

**Live Demo** → https://qrmenu.et  
**Merchant Dashboard** → https://app.qrmenu.et  
**Sample Restaurant Site** → https://demo.kaldis.qrmenu.et

---

### Two Customer Experiences (Perfectly Separated)

| Customer Location     | How They Order                 | Experience Powered By                             |
| --------------------- | ------------------------------ | ------------------------------------------------- |
| Inside the restaurant | Scan table QR code             | **QR Menu** (fast, no app)                        |
| Outside (home/office) | Visit restaurant’s own website | **Auto-generated Website** (SEO, online ordering) |

No confusion. No extra apps. Just works.

---

### Complete Features (2025 Enterprise Standard)

| Module                            | Status      | Description                                    |
| --------------------------------- | ----------- | ---------------------------------------------- |
| In-Restaurant QR Menu             | Done        | Table-specific, branded, English + አማርኛ        |
| Auto-Generated Restaurant Website | Done        | Beautiful, SEO-friendly, online ordering       |
| Multi-Branch Management           | Done        | One login → unlimited branches                 |
| Full Point of Sale (POS)          | Done        | Offline-ready, KOT printing                    |
| Inventory & Stock Management      | Done        | Ingredients, suppliers, alerts                 |
| Table & Floor Management          | Done        | Visual layout, merge tables                    |
| Reservation System                | Done        | Online + walk-in                               |
| Delivery Management               | Done        | In-house + Ride, Feres, ZayRide                |
| Multi-Menu Support                | Done        | Breakfast, Lunch, Dinner, Fasting, Events      |
| Employee & Staff Management       | Done        | Shifts, salary, tips split                     |
| Customer CRM & Loyalty            | Done        | Points, birthday offers                        |
| Digital Payments                  | Done        | Telebirr • CBE Birr • HelloCash • Amole • Card |
| Kitchen Display System (KDS)      | Done        | Real-time orders                               |
| Real-time Analytics               | Done        | Sales, peak hours, branch comparison           |
| Custom QR + Website Branding      | Done        | Logo, colors, domain                           |
| Offline POS Mode                  | Done (Beta) | Works without internet                         |

---

### Dining Session Refactor — Completed and Verified

The table-based dining session flow is now implemented and validated in the backend. Multiple customers can reuse the same table QR, staff can create or attach orders to the active session, and table closure enforces unpaid-order checks before the table is marked as clean.

Key outcomes:
- QR table scans create or reuse the active dining session without blocking multi-customer ordering.
- Staff and QR orders are linked to the same session via `order.session` and `order.source` tracking.
- Table closure validates unpaid orders and emits Socket.IO `session:created` and `session:ended` events.
- Race conditions are handled with Mongo transaction retry logic and the active-session uniqueness guard.

Validated locally with:

```bash
./node_modules/.bin/jest --runInBand tests/task-7-close-table.test.js tests/task-8-session-socket-events.test.js tests/task-9-integration-full-flow.test.js --verbose
```

Documentation package:
- [README-DINING-SESSION-REFACTOR.md](README-DINING-SESSION-REFACTOR.md)
- [DINING-SESSION-SYSTEM-DOCUMENTATION.md](DINING-SESSION-SYSTEM-DOCUMENTATION.md)
- [TASK-BOARD.md](TASK-BOARD.md)

---

### Professional Architecture (The Right Way)

```text
Merchant (Owner)
├── Branch: Bole
├── Branch: Piassa
└── Branch: Bahir Dar
    ├── QR Menu → qrmenu.et/b/123 (table QR codes)
    └── Website → kaldis-bole.qrmenu.et (or custom domain)
        └── Online ordering, menu, photos, reviews
```
