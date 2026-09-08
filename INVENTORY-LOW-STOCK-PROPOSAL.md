# Low Inventory Management System - Proposal

## Problem Statement

**Current Issue:**
- When an ingredient stock becomes low, merchants need a way to:
  1. Get alerted that stock is running low
  2. Add more inventory quickly
  3. Manage ingredient additions without disrupting orders
  4. Prevent menu items from being unavailable due to low ingredients

---

## Proposed Solution: Multi-Layer Inventory System

### **Layer 1: Real-Time Stock Monitoring**

#### A. Stock Level Alerts
```javascript
// Define low stock thresholds per ingredient
const Ingredient = {
  _id: "ing_001",
  name: "Tomato",
  branch: "branch_001",
  currentStock: 5,          // Actual quantity available
  minThreshold: 20,         // Alert when below this
  reorderQuantity: 100,     // Suggest ordering this amount
  unit: "kg",
  alertStatus: "LOW"        // ⚠️  LOW | OK | CRITICAL
};

// Alert Levels:
// CRITICAL: currentStock < minThreshold * 0.5  (50% of threshold)
// LOW:      currentStock < minThreshold
// OK:       currentStock >= minThreshold
```

#### B. Real-Time Dashboard Alert
```
┌──────────────────────────────────────────┐
│        INVENTORY DASHBOARD               │
├──────────────────────────────────────────┤
│                                          │
│ ⚠️  CRITICAL ITEMS (0 in stock)         │
│  └─ Beef: 0kg (min: 50kg)               │
│  └─ Chicken: 2kg (min: 40kg)            │
│                                          │
│ 🔶 LOW STOCK ITEMS (Below threshold)   │
│  └─ Tomato: 5kg (min: 20kg)             │
│  └─ Onion: 8kg (min: 15kg)              │
│                                          │
│ ✅ OK ITEMS                              │
│  └─ Olive Oil: 45L (min: 30L)           │
│  └─ Salt: 25kg (min: 10kg)              │
│                                          │
└──────────────────────────────────────────┘
```

---

### **Layer 2: Smart Add Stock Workflow**

#### A. Add Inventory Endpoint
```javascript
// POST /api/v1/inventory/ingredients/:ingredientId/add-stock
{
  "quantity": 50,           // Amount to add
  "unit": "kg",             // Must match ingredient unit
  "supplier": "Supplier A", // Where it came from
  "batchNumber": "BATCH#123",  // For tracking
  "expiryDate": "2024-09-30",  // When it expires
  "costPrice": 500,         // How much it cost
  "notes": "Weekly supply"
}

// Response:
{
  "_id": "ing_001",
  "name": "Tomato",
  "currentStock": 55,       // 5 + 50
  "alertStatus": "OK",      // Updated from LOW
  "lastUpdated": "2024-08-22T10:30:00Z",
  "stockHistory": [
    {
      "date": "2024-08-22T10:30:00Z",
      "action": "added",
      "quantity": 50,
      "previousStock": 5,
      "newStock": 55,
      "supplier": "Supplier A",
      "addedBy": "user_001"
    }
  ]
}
```

#### B. Batch Add Stock (Add Multiple)
```javascript
// POST /api/v1/inventory/batch-add-stock
{
  "items": [
    { "ingredientId": "ing_001", "quantity": 50, "supplier": "Supplier A" },
    { "ingredientId": "ing_002", "quantity": 100, "supplier": "Supplier A" },
    { "ingredientId": "ing_003", "quantity": 75, "supplier": "Supplier B" }
  ]
}

// Useful for: receiving shipments, restocking day, supply deliveries
```

---

### **Layer 3: Menu Item Management**

#### A. Auto-Disable Items When Critical
```javascript
// When ingredient stock becomes CRITICAL:
// Option 1: Auto-disable menu items using that ingredient

MenuItem Schema:
{
  _id: "item_001",
  name: "Tomato Salad",
  recipe: [
    {
      ingredient: "ing_tomato",
      quantity: 2,
      unit: "kg",
      status: "available"
    }
  ],
  availability: {
    status: "available",  // CHANGED TO "unavailable"
    reason: "Low ingredient: Tomato (5kg, min: 20kg)",
    affectedIngredients: ["ing_tomato"],
    autoDisabledAt: "2024-08-22T09:15:00Z"
  }
}
```

#### B. Manual Override Option
```javascript
// Merchant can manually override auto-disable:
// PATCH /api/v1/menu/items/:itemId/override-availability
{
  "action": "enable",  // or "disable"
  "reason": "We have backup tomatoes from supplier",
  "duration": 3600     // Re-check in 1 hour (seconds)
}
```

---

### **Layer 4: Order-Time Checks**

#### A. Pre-Order Inventory Validation
```javascript
// Before accepting order, check all ingredients

OrderService.validateOrder(orderId):
  FOR EACH orderItem:
    FOR EACH ingredient in recipe:
      IF ingredient.currentStock < required_quantity:
        THEN:
          - Check if item is "override enabled"
          - If NO → REJECT order item
          - If YES → ALLOW but WARN
          - IF CRITICAL → ALWAYS REJECT

// Response:
{
  "valid": false,
  "errors": [
    {
      "menuItemId": "item_tomato_salad",
      "menuItemName": "Tomato Salad",
      "reason": "CRITICAL: Tomato stock critically low (5kg < 20kg required)",
      "affectedIngredient": "Tomato",
      "currentStock": 5,
      "required": 20,
      "action": "REJECT_ORDER"
    }
  ]
}
```

#### B. Deduct Ingredients on Order Confirm
```javascript
// When order status → "ready" or "served":
// AUTOMATICALLY DEDUCT used ingredients

Order Lifecycle:
  pending → in_progress: Deduct ingredients (reserved)
  in_progress → ready: Update final quantities
  ready → served: Record final deduction

// Example:
{
  action: "order_items_served",
  deductions: [
    {
      ingredientId: "ing_tomato",
      quantity: 5,         // 2kg per salad × 3 salads
      previousStock: 55,
      newStock: 50,
      reason: "Served 3x Tomato Salad orders"
    }
  ]
}
```

---

### **Layer 5: Reporting & Analytics**

#### A. Low Stock Alert Report
```javascript
// GET /api/v1/inventory/reports/low-stock
Response:
{
  "branch": "branch_001",
  "generatedAt": "2024-08-22T10:30:00Z",
  "summary": {
    "total_ingredients": 45,
    "critical_items": 2,
    "low_items": 8,
    "ok_items": 35
  },
  "critical_items": [
    {
      "ingredient": "Beef",
      "stock": 0,
      "min_threshold": 50,
      "shortage": -50,
      "affected_menu_items": 12,
      "estimated_cost": 25000,
      "last_added": "2024-08-20",
      "days_until_stockout": 0,  // ALREADY OUT
      "action": "URGENT: Order immediately"
    }
  ],
  "predicted_stockouts": [
    {
      "ingredient": "Chicken",
      "stock": 8,
      "daily_usage": 5,
      "days_until_stockout": 1.6,  // ~2 days
      "action": "Order within 24 hours"
    }
  ]
}
```

#### B. Inventory Movement Report
```javascript
// GET /api/v1/inventory/reports/movement
Response:
{
  "dateRange": ["2024-08-15", "2024-08-22"],
  "ingredients": [
    {
      "ingredient": "Tomato",
      "opening_stock": 100,
      "added": 150,
      "used": 95,
      "closing_stock": 155,
      "movement": "+55",
      "usage_rate": "13.6 kg/day",
      "forecast_depleted": "2024-09-15"  // Predicted depletion date
    }
  ]
}
```

---

### **Layer 6: Notification System**

#### A. Alert Types & Channels
```javascript
// When ingredient reaches LOW status:
const Notifications = {
  channels: ["dashboard", "email", "sms", "app"],
  
  critical: {
    title: "⛔ CRITICAL: Tomato Stock at 0kg",
    message: "Tomato is out of stock. 12 menu items affected. Order immediately.",
    recipient: ["merchant", "inventory_manager"],
    priority: "HIGH",
    actions: ["ADD_STOCK", "DISABLE_ITEMS", "VIEW_DETAILS"]
  },
  
  low: {
    title: "⚠️  LOW: Onion Stock Below Threshold",
    message: "Onion (8kg) below minimum (15kg). Consider restocking.",
    recipient: ["merchant"],
    priority: "MEDIUM",
    actions: ["ADD_STOCK", "ADJUST_THRESHOLD", "IGNORE"]
  }
};

// Push notification on mobile app
// Email to merchant
// SMS alert for critical items
// Dashboard widget updates real-time
```

#### B. Scheduled Digest Report
```javascript
// Daily/Weekly inventory report email:
Subject: "Weekly Inventory Report - 8 items need attention"

Body:
"
CRITICAL (Immediate Action):
- Beef: 0kg (ORDER NOW)

LOW (This week):
- Tomato: 5kg
- Chicken: 8kg
- Onion: 10kg

FORECAST (Next 7 days):
- Lettuce: Will deplete on 2024-08-27
- Olive Oil: Will deplete on 2024-09-03

ACTIONS:
1. [Add Stock] for critical items
2. [View Full Report] for details
3. [Manage Thresholds] to adjust alerts
"
```

---

### **Layer 7: Historical Tracking**

#### A. Ingredient Stock History
```javascript
// GET /api/v1/inventory/ingredients/:id/history
Response:
{
  "_id": "ing_tomato",
  "name": "Tomato",
  "history": [
    {
      "date": "2024-08-22T10:30:00Z",
      "action": "ADDED",
      "quantity": 50,
      "stock_before": 5,
      "stock_after": 55,
      "supplier": "Supplier A",
      "added_by": "merchant_001"
    },
    {
      "date": "2024-08-22T09:15:00Z",
      "action": "USED",
      "quantity": 2,
      "stock_before": 7,
      "stock_after": 5,
      "reason": "Served 1x Tomato Salad",
      "order_id": "order_123"
    },
    {
      "date": "2024-08-21T14:00:00Z",
      "action": "ALERT_TRIGGERED",
      "from_status": "OK",
      "to_status": "LOW",
      "stock": 12
    }
  ]
}
```

#### B. Audit Trail
```javascript
// Every stock change is logged:
- WHO added/deducted
- WHEN it was added/deducted
- HOW MUCH changed
- WHERE it came from (supplier/order)
- WHY it changed (manual add / order used)
```

---

## Implementation Roadmap

### **Phase 1: Core Inventory Tracking (Week 1-2)**
- [ ] Create Ingredient model with stock fields
- [ ] Add stock thresholds (minThreshold, reorderQuantity)
- [ ] Implement add-stock endpoint
- [ ] Track ingredient history
- [ ] Create low-stock alerts

### **Phase 2: Menu Item Integration (Week 2-3)**
- [ ] Link MenuItem to Ingredient recipes
- [ ] Auto-disable items when ingredients critical
- [ ] Pre-order inventory validation
- [ ] Deduct ingredients on order served

### **Phase 3: Notifications (Week 3)**
- [ ] Dashboard alerts widget
- [ ] Email notifications
- [ ] SMS alerts for critical items
- [ ] App push notifications

### **Phase 4: Reporting (Week 4)**
- [ ] Low stock report
- [ ] Movement report
- [ ] Predictive analytics (when will deplete)
- [ ] Supplier performance report

### **Phase 5: Advanced Features (Week 5+)**
- [ ] Auto-reorder suggestions
- [ ] Inventory forecasting
- [ ] Supplier integration (API auto-order)
- [ ] Waste tracking
- [ ] Cost analysis

---

## Database Schema Design

### Ingredient Model
```javascript
const ingredientSchema = new Schema({
  merchant: { type: ObjectId, ref: 'Merchant', required: true },
  branch: { type: ObjectId, ref: 'Branch', required: true },
  
  // Basic Info
  name: { type: String, required: true },
  description: String,
  category: String,  // Dairy, Vegetables, Meat, etc.
  
  // Stock Info
  currentStock: { type: Number, default: 0 },
  unit: { type: String, enum: ['kg', 'liter', 'piece', 'box'], required: true },
  
  // Thresholds
  minThreshold: { type: Number, default: 0 },
  reorderQuantity: { type: Number, default: 0 },
  maxStock: { type: Number, default: 999 },
  
  // Pricing
  costPrice: { type: Number, min: 0 },
  lastPriceUpdate: Date,
  
  // Supplier
  preferredSupplier: String,
  supplierCode: String,
  
  // Status
  alertStatus: { 
    type: String, 
    enum: ['OK', 'LOW', 'CRITICAL', 'OUT_OF_STOCK'],
    default: 'OK'
  },
  isActive: { type: Boolean, default: true },
  
  // Tracking
  lastAddedDate: Date,
  lastUsedDate: Date,
  dailyUsageRate: { type: Number, default: 0 },  // kg/day
  
  // Audit
  createdBy: { type: ObjectId, ref: 'User' },
  updatedBy: { type: ObjectId, ref: 'User' },
  createdAt: Date,
  updatedAt: Date
});

// Indexes
ingredientSchema.index({ merchant: 1, branch: 1 });
ingredientSchema.index({ alertStatus: 1 });
ingredientSchema.index({ currentStock: 1 });
```

### Stock History Model
```javascript
const stockHistorySchema = new Schema({
  ingredient: { type: ObjectId, ref: 'Ingredient', required: true },
  merchant: { type: ObjectId, ref: 'Merchant', required: true },
  branch: { type: ObjectId, ref: 'Branch', required: true },
  
  // Action
  action: { 
    type: String, 
    enum: ['ADDED', 'USED', 'ADJUSTED', 'WASTE', 'CORRECTED'],
    required: true
  },
  
  // Quantities
  quantity: { type: Number, required: true },
  stockBefore: Number,
  stockAfter: Number,
  unit: String,
  
  // References
  supplier: String,
  orderId: { type: ObjectId, ref: 'Order' },
  batchNumber: String,
  expiryDate: Date,
  
  // Metadata
  reason: String,
  notes: String,
  costPrice: Number,
  recordedBy: { type: ObjectId, ref: 'User' },
  recordedAt: { type: Date, default: Date.now },
  
  // Status change tracking
  previousStatus: String,
  newStatus: String
});

stockHistorySchema.index({ ingredient: 1, recordedAt: 1 });
stockHistorySchema.index({ merchant: 1, action: 1 });
```

### Recipe Model (MenuItem → Ingredients)
```javascript
const recipeSchema = new Schema({
  menuItem: { type: ObjectId, ref: 'MenuItem', required: true },
  merchant: { type: ObjectId, ref: 'Merchant', required: true },
  
  ingredients: [
    {
      ingredient: { type: ObjectId, ref: 'Ingredient' },
      quantity: Number,
      unit: String,  // Must match ingredient unit
      isMandatory: { type: Boolean, default: true }
    }
  ],
  
  // Variants can have different recipes
  variant: { type: ObjectId, ref: 'Variant', default: null },
  
  lastUpdated: Date,
  updatedBy: { type: ObjectId, ref: 'User' }
});

recipeSchema.index({ menuItem: 1 });
```

---

## API Endpoints

### Inventory Management
```
POST   /api/v1/inventory/ingredients
GET    /api/v1/inventory/ingredients
GET    /api/v1/inventory/ingredients/:id
PATCH  /api/v1/inventory/ingredients/:id
DELETE /api/v1/inventory/ingredients/:id

POST   /api/v1/inventory/ingredients/:id/add-stock
POST   /api/v1/inventory/batch-add-stock
POST   /api/v1/inventory/ingredients/:id/adjust-stock

GET    /api/v1/inventory/ingredients/:id/history
GET    /api/v1/inventory/low-stock
GET    /api/v1/inventory/critical-items

GET    /api/v1/inventory/reports/low-stock
GET    /api/v1/inventory/reports/movement
GET    /api/v1/inventory/reports/usage
GET    /api/v1/inventory/reports/forecast
```

### Recipe Management
```
POST   /api/v1/recipes
GET    /api/v1/recipes
PATCH  /api/v1/recipes/:id
DELETE /api/v1/recipes/:id
```

---

## Frontend UI Mockups

### Dashboard Widget
```
┌─────────────────────────────────────┐
│    🛒 INVENTORY STATUS              │
├─────────────────────────────────────┤
│                                     │
│ ⛔ CRITICAL: 2 items                │
│    Beef: 0kg (min: 50kg)            │
│    Chicken: 2kg (min: 40kg)        │
│    [Add Stock]                      │
│                                     │
│ 🔶 LOW: 8 items                     │
│    Tomato: 5kg (min: 20kg)         │
│    Onion: 8kg (min: 15kg)          │
│    ... +6 more                      │
│    [View All]                       │
│                                     │
│ ✅ OK: 35 items                     │
│                                     │
└─────────────────────────────────────┘
```

### Add Stock Modal
```
┌────────────────────────────────────────┐
│  Add Stock: Tomato                     │
├────────────────────────────────────────┤
│                                        │
│ Current Stock:  5 kg (LOW)             │
│ Min Threshold:  20 kg                  │
│ Reorder Qty:    100 kg                 │
│                                        │
│ [Quantity to Add] [50] kg ▼            │
│ [Supplier]       [Supplier A] ▼       │
│ [Batch Number]   [BATCH#123]          │
│ [Expiry Date]    [2024-09-30]         │
│ [Cost Price]     [500]                │
│ [Notes]          [Weekly supply]      │
│                                        │
│  [Cancel]  [Add Stock]                │
│                                        │
└────────────────────────────────────────┘
```

### Inventory Report View
```
┌─────────────────────────────────────────────────────┐
│  Inventory Report - Week of Aug 20                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Ingredient  │ Open │ Added │ Used │ Close │ Status │
│─────────────┼──────┼───────┼──────┼───────┼────────│
│ Tomato      │ 100  │ 150   │ 95   │ 155   │ ✅ OK  │
│ Onion       │ 50   │ 75    │ 60   │ 65    │ ✅ OK  │
│ Beef        │ 100  │ 0     │ 150  │ -50   │ ⛔ OUT │
│ Chicken     │ 80   │ 50    │ 90   │ 40    │ 🔶 LOW │
│                                                     │
│ [Export] [Print] [Email]                           │
└─────────────────────────────────────────────────────┘
```

---

## Key Features Summary

| Feature | Benefit |
|---------|---------|
| **Real-Time Alerts** | Merchants know immediately when stock is low |
| **Auto-Disable Menu Items** | Prevents customers from ordering items you can't make |
| **Pre-Order Validation** | Reject orders if ingredients unavailable |
| **Historical Tracking** | Know exactly when/where/why stock changed |
| **Predictive Analytics** | Forecast when ingredients will run out |
| **Easy Add Stock** | One-click or batch add stock without losing data |
| **Recipe Linking** | Automatic ingredient deduction when orders served |
| **Audit Trail** | Complete compliance and responsibility tracking |
| **Reports** | Understand inventory trends and optimize |
| **Notifications** | Email, SMS, app, dashboard alerts |

---

## Benefits for Your App

✅ **Merchant Side:**
- Never run out of ingredients during service
- Know exactly what's in stock
- Get alerts before it's too late
- Make better ordering decisions
- Reduce food waste
- Improve cost management

✅ **Customer Side:**
- Never order something that's unavailable
- Consistent menu availability
- No surprises at checkout

✅ **Kitchen Side:**
- Know ingredient status in real-time
- Better meal prep planning
- Recipe optimization

✅ **Business Intelligence:**
- Understand consumption patterns
- Optimize supplier relationships
- Reduce carrying costs
- Improve profitability

---

## Next Steps

1. **Review this proposal** - Do you want all features or a simpler version?
2. **Prioritize features** - Which are most important for your users?
3. **Database design** - Approve schema changes
4. **API specification** - Detailed endpoint documentation
5. **Frontend mockups** - Create UI/UX designs
6. **Implementation** - Start building Phase 1

Would you like me to:
- Create detailed API specifications?
- Build a prototype of the add-stock feature?
- Design the database models?
- Create the notification system?
- Build the reporting module?

Let me know which direction you'd like to go! 🎯
