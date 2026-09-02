# Low Inventory Management System - Integration Plan

## Current State Analysis

### ✅ What You Already Have

1. **Models**:
   - ✅ `Ingredient` model with basic stock tracking
   - ✅ `Recipe` model linking menu items to ingredients
   - ✅ Audit plugin enabled on both models

2. **Modules**:
   - ✅ `/src/modules/inventory/` directory structure
   - ✅ Ingredients routes and controller
   - ✅ Recipes routes and controller
   - ✅ Suppliers routes
   - ✅ Purchase orders routes

3. **Existing Features**:
   - Basic stock tracking (`currentStock`, `minStock`, `maxStock`)
   - Stock status virtual (`out_of_stock`, `low_stock`, `in_stock`, `over_stock`)
   - `getLowStockItems()` static method
   - Recipe-to-ingredient linking
   - Cost calculation in recipes

### ❌ What's Missing (From Proposal)

1. **Alert System**: CRITICAL/LOW status classification
2. **Stock History**: Audit trail of all stock changes
3. **Auto-disable Menu Items**: When ingredients are critical
4. **Order-time Validation**: Check stock before accepting orders
5. **Batch Add Stock**: Shipment receiving workflow
6. **Notifications**: Email, SMS, dashboard alerts
7. **Advanced Reports**: Forecasting, movement analysis
8. **Real-time Updates**: WebSocket/SSE for live alerts

---

## Integration Strategy

### Phase 1: Enhance Existing Models (Week 1) 🔄

#### 1.1 Update Ingredient Model

**File**: `models/Ingredient.js`

Add missing fields:
```javascript
{
  // NEW FIELDS
  reorderQuantity: { type: Number, default: 0 },
  alertStatus: { 
    type: String, 
    enum: ['OK', 'LOW', 'CRITICAL', 'OUT_OF_STOCK'], 
    default: 'OK' 
  },
  dailyUsageRate: { type: Number, default: 0 }, // Auto-calculated
  preferredSupplier: { type: String },
  batchNumber: String,
  
  // ENHANCED FIELDS
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' }, // Multi-branch support
}
```

Add middleware to auto-update `alertStatus`:
```javascript
ingredientSchema.pre('save', function(next) {
  // Auto-calculate alert status
  if (this.currentStock <= 0) {
    this.alertStatus = 'OUT_OF_STOCK';
  } else if (this.currentStock < this.minStock * 0.5) {
    this.alertStatus = 'CRITICAL';
  } else if (this.currentStock < this.minStock) {
    this.alertStatus = 'LOW';
  } else {
    this.alertStatus = 'OK';
  }
  next();
});
```

#### 1.2 Create StockHistory Model

**File**: `models/StockHistory.js` (NEW)

```javascript
const stockHistorySchema = new Schema({
  ingredient: { type: ObjectId, ref: 'Ingredient', required: true },
  merchant: { type: ObjectId, ref: 'Merchant', required: true },
  branch: { type: ObjectId, ref: 'Branch' },
  
  action: { 
    type: String, 
    enum: ['ADDED', 'USED', 'ADJUSTED', 'WASTE', 'CORRECTED'], 
    required: true 
  },
  quantity: { type: Number, required: true },
  stockBefore: Number,
  stockAfter: Number,
  unit: String,
  
  // Context
  supplier: String,
  orderId: { type: ObjectId, ref: 'Order' },
  batchNumber: String,
  expiryDate: Date,
  reason: String,
  costPrice: Number,
  
  recordedBy: { type: ObjectId, ref: 'User', required: true },
  recordedAt: { type: Date, default: Date.now },
  
  previousStatus: String,
  newStatus: String,
});
```

---

### Phase 2: Extend Current Inventory Module (Week 1-2) 🔨

#### 2.1 Enhance Ingredient Service

**File**: `src/modules/inventory/service/IngredientService.js`

Add methods:
```javascript
class IngredientService {
  // EXISTING: basic CRUD
  
  // NEW: Add stock with history
  static async addStock(ingredientId, data, userId) {
    const ingredient = await Ingredient.findById(ingredientId);
    const stockBefore = ingredient.currentStock;
    
    ingredient.currentStock += data.quantity;
    ingredient.lastRestocked = new Date();
    await ingredient.save();
    
    // Create history record
    await StockHistory.create({
      ingredient: ingredientId,
      merchant: ingredient.merchant,
      action: 'ADDED',
      quantity: data.quantity,
      stockBefore,
      stockAfter: ingredient.currentStock,
      supplier: data.supplier,
      batchNumber: data.batchNumber,
      costPrice: data.costPrice,
      recordedBy: userId,
      previousStatus: stockBefore <= ingredient.minStock ? 'LOW' : 'OK',
      newStatus: ingredient.alertStatus,
    });
    
    return ingredient;
  }
  
  // NEW: Batch add stock
  static async batchAddStock(items, userId) {
    const results = [];
    for (const item of items) {
      const result = await this.addStock(item.ingredientId, item, userId);
      results.push(result);
    }
    return results;
  }
  
  // NEW: Get low stock items with CRITICAL priority
  static async getLowStockDashboard(merchantId) {
    const ingredients = await Ingredient.find({ 
      merchant: merchantId, 
      isActive: true 
    });
    
    return {
      critical: ingredients.filter(i => i.alertStatus === 'CRITICAL'),
      low: ingredients.filter(i => i.alertStatus === 'LOW'),
      ok: ingredients.filter(i => i.alertStatus === 'OK'),
      total: ingredients.length,
    };
  }
  
  // NEW: Stock history
  static async getStockHistory(ingredientId, filters = {}) {
    return StockHistory.find({ ingredient: ingredientId, ...filters })
      .populate('recordedBy', 'name email')
      .sort({ recordedAt: -1 });
  }
}
```

#### 2.2 Add New Endpoints

**File**: `src/modules/inventory/ingredients.routes.js`

```javascript
// NEW ROUTES
router.post('/:id/add-stock', auth, addStockToIngredient);
router.post('/batch-add-stock', auth, batchAddStock);
router.get('/:id/history', auth, getStockHistory);
router.get('/low-stock', auth, getLowStockItems);
router.get('/critical-items', auth, getCriticalItems);
router.get('/dashboard', auth, getInventoryDashboard);
```

---

### Phase 3: Menu Item Integration (Week 2) 🍽️

#### 3.1 Enhance Menu Model

**File**: `models/Menu.js` (Update existing)

Add availability tracking:
```javascript
{
  availability: {
    status: { 
      type: String, 
      enum: ['available', 'unavailable', 'out_of_stock'], 
      default: 'available' 
    },
    reason: String,
    affectedIngredients: [{ type: ObjectId, ref: 'Ingredient' }],
    autoDisabledAt: Date,
    manualOverride: {
      enabled: Boolean,
      reason: String,
      expiresAt: Date,
      overriddenBy: { type: ObjectId, ref: 'User' },
    },
  },
}
```

#### 3.2 Create Menu Availability Service

**File**: `src/modules/menu/service/MenuAvailabilityService.js` (NEW)

```javascript
class MenuAvailabilityService {
  /**
   * Check if a menu item can be made with current stock
   */
  static async checkAvailability(menuItemId) {
    const recipe = await Recipe.findOne({ menuItem: menuItemId })
      .populate('items.ingredient');
    
    if (!recipe) return { available: true, reason: 'No recipe defined' };
    
    const unavailableIngredients = [];
    
    for (const item of recipe.items) {
      const ingredient = item.ingredient;
      if (ingredient.currentStock < item.quantity) {
        unavailableIngredients.push({
          name: ingredient.name,
          required: item.quantity,
          available: ingredient.currentStock,
          status: ingredient.alertStatus,
        });
      }
    }
    
    if (unavailableIngredients.length > 0) {
      return {
        available: false,
        reason: 'Insufficient ingredients',
        unavailableIngredients,
      };
    }
    
    return { available: true };
  }
  
  /**
   * Auto-disable menu items when ingredients become CRITICAL
   */
  static async updateMenuAvailabilityForIngredient(ingredientId) {
    const ingredient = await Ingredient.findById(ingredientId);
    
    if (ingredient.alertStatus !== 'CRITICAL') return;
    
    // Find all recipes using this ingredient
    const recipes = await Recipe.find({
      'items.ingredient': ingredientId,
      isActive: true,
    });
    
    for (const recipe of recipes) {
      await Menu.findByIdAndUpdate(recipe.menuItem, {
        'availability.status': 'out_of_stock',
        'availability.reason': `Low ingredient: ${ingredient.name}`,
        'availability.affectedIngredients': [ingredientId],
        'availability.autoDisabledAt': new Date(),
      });
    }
  }
  
  /**
   * Manual override to enable unavailable item
   */
  static async overrideAvailability(menuItemId, data) {
    const expiresAt = new Date(Date.now() + (data.duration || 3600) * 1000);
    
    return Menu.findByIdAndUpdate(menuItemId, {
      'availability.status': 'available',
      'availability.manualOverride': {
        enabled: true,
        reason: data.reason,
        expiresAt,
        overriddenBy: data.userId,
      },
    }, { new: true });
  }
}
```

---

### Phase 4: Order-Time Stock Validation (Week 2-3) 🛒

#### 4.1 Create Order Validation Middleware

**File**: `src/modules/order/middleware/stockValidation.js` (NEW)

```javascript
const validateOrderStock = async (req, res, next) => {
  const { items } = req.body;
  
  const unavailableItems = [];
  
  for (const orderItem of items) {
    const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
      .populate('items.ingredient');
    
    if (!recipe) continue;
    
    for (const recipeItem of recipe.items) {
      const required = recipeItem.quantity * orderItem.quantity;
      const available = recipeItem.ingredient.currentStock;
      
      if (available < required) {
        // Check for manual override
        const menuItem = await Menu.findById(orderItem.menuItem);
        const hasOverride = menuItem.availability.manualOverride?.enabled &&
                           menuItem.availability.manualOverride.expiresAt > new Date();
        
        if (!hasOverride && recipeItem.ingredient.alertStatus === 'CRITICAL') {
          unavailableItems.push({
            menuItem: orderItem.menuItem,
            ingredient: recipeItem.ingredient.name,
            required,
            available,
          });
        }
      }
    }
  }
  
  if (unavailableItems.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Some items are unavailable due to insufficient stock',
      unavailableItems,
    });
  }
  
  next();
};
```

#### 4.2 Integrate with Order Placement

**File**: `src/modules/order/controller/handlers/placement.handler.js` (Update existing)

Add stock deduction when order transitions:

```javascript
// In OrderService or placement handler
async function deductIngredients(orderId) {
  const order = await Order.findById(orderId).populate('items.menuItem');
  
  for (const orderItem of order.items) {
    const recipe = await Recipe.findOne({ menuItem: orderItem.menuItem })
      .populate('items.ingredient');
    
    if (!recipe) continue;
    
    for (const recipeItem of recipe.items) {
      const deductQty = recipeItem.quantity * orderItem.quantity;
      const ingredient = recipeItem.ingredient;
      
      const stockBefore = ingredient.currentStock;
      ingredient.currentStock -= deductQty;
      await ingredient.save();
      
      // Record in history
      await StockHistory.create({
        ingredient: ingredient._id,
        merchant: order.merchant,
        action: 'USED',
        quantity: deductQty,
        stockBefore,
        stockAfter: ingredient.currentStock,
        orderId: order._id,
        recordedBy: order.customer,
      });
    }
  }
}
```

Call this in order state machine:
```javascript
// When order moves to 'in_progress' or 'preparing'
await deductIngredients(order._id);
```

---

### Phase 5: Notifications (Week 3) 📧

#### 5.1 Create Inventory Alert Service

**File**: `src/modules/inventory/service/InventoryAlertService.js` (NEW)

```javascript
const NotificationService = require('../../notifications/notification.service');

class InventoryAlertService {
  /**
   * Send alert when ingredient becomes CRITICAL or LOW
   */
  static async sendLowStockAlert(ingredient) {
    const merchant = await Merchant.findById(ingredient.merchant)
      .populate('owner');
    
    const message = {
      title: `${ingredient.alertStatus} Stock Alert: ${ingredient.name}`,
      body: `Current: ${ingredient.currentStock}${ingredient.unit}, Minimum: ${ingredient.minStock}${ingredient.unit}`,
      data: {
        type: 'low_stock',
        ingredientId: ingredient._id,
        alertStatus: ingredient.alertStatus,
      },
    };
    
    // Dashboard notification
    await NotificationService.create({
      merchant: merchant._id,
      user: merchant.owner,
      ...message,
      priority: ingredient.alertStatus === 'CRITICAL' ? 'high' : 'medium',
    });
    
    // Email for CRITICAL
    if (ingredient.alertStatus === 'CRITICAL') {
      await NotificationService.sendEmail({
        to: merchant.owner.email,
        subject: message.title,
        body: message.body,
      });
      
      // SMS (optional)
      if (merchant.owner.phone) {
        await NotificationService.sendSMS({
          to: merchant.owner.phone,
          message: message.body,
        });
      }
    }
  }
  
  /**
   * Daily digest of low stock items
   */
  static async sendDailyDigest(merchantId) {
    const dashboard = await IngredientService.getLowStockDashboard(merchantId);
    
    if (dashboard.critical.length === 0 && dashboard.low.length === 0) {
      return; // Nothing to report
    }
    
    const merchant = await Merchant.findById(merchantId).populate('owner');
    
    const emailBody = `
      Daily Inventory Report
      
      CRITICAL (${dashboard.critical.length}):
      ${dashboard.critical.map(i => `- ${i.name}: ${i.currentStock}${i.unit}`).join('\n')}
      
      LOW (${dashboard.low.length}):
      ${dashboard.low.map(i => `- ${i.name}: ${i.currentStock}${i.unit}`).join('\n')}
    `;
    
    await NotificationService.sendEmail({
      to: merchant.owner.email,
      subject: 'Daily Inventory Alert Digest',
      body: emailBody,
    });
  }
}
```

#### 5.2 Add Notification Triggers

In `IngredientService.addStock()` and ingredient `post('save')` hook:

```javascript
ingredientSchema.post('save', async function(doc) {
  // Alert if status changed to LOW or CRITICAL
  if (this.isModified('alertStatus') && 
      (doc.alertStatus === 'LOW' || doc.alertStatus === 'CRITICAL')) {
    await InventoryAlertService.sendLowStockAlert(doc);
  }
  
  // Update menu availability
  if (doc.alertStatus === 'CRITICAL') {
    await MenuAvailabilityService.updateMenuAvailabilityForIngredient(doc._id);
  }
});
```

---

### Phase 6: Reports & Analytics (Week 4) 📊

#### 6.1 Create Reporting Service

**File**: `src/modules/inventory/service/ReportingService.js` (NEW)

```javascript
class ReportingService {
  /**
   * Low stock alert report
   */
  static async getLowStockReport(merchantId) {
    const ingredients = await Ingredient.find({
      merchant: merchantId,
      isActive: true,
      alertStatus: { $in: ['LOW', 'CRITICAL', 'OUT_OF_STOCK'] },
    }).populate('supplier');
    
    const criticalItems = ingredients.filter(i => i.alertStatus === 'CRITICAL');
    
    // Predict stockout dates
    const predictedStockouts = await this.predictStockouts(merchantId);
    
    return {
      summary: {
        total_ingredients: await Ingredient.countDocuments({ merchant: merchantId }),
        critical_items: criticalItems.length,
        low_items: ingredients.filter(i => i.alertStatus === 'LOW').length,
      },
      critical_items: criticalItems.map(i => ({
        ingredient: i.name,
        stock: i.currentStock,
        min_threshold: i.minStock,
        affected_menu_items: 0, // TODO: Calculate
        days_until_stockout: 0,
        action: 'URGENT: Order immediately',
      })),
      predicted_stockouts: predictedStockouts,
    };
  }
  
  /**
   * Inventory movement report
   */
  static async getMovementReport(ingredientId, startDate, endDate) {
    const ingredient = await Ingredient.findById(ingredientId);
    
    const history = await StockHistory.find({
      ingredient: ingredientId,
      recordedAt: { $gte: startDate, $lte: endDate },
    });
    
    const added = history
      .filter(h => h.action === 'ADDED')
      .reduce((sum, h) => sum + h.quantity, 0);
    
    const used = history
      .filter(h => h.action === 'USED')
      .reduce((sum, h) => sum + h.quantity, 0);
    
    const dailyUsage = used / ((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    return {
      ingredient: ingredient.name,
      opening_stock: history[history.length - 1]?.stockBefore || 0,
      added,
      used,
      closing_stock: ingredient.currentStock,
      usage_rate: `${dailyUsage.toFixed(2)} ${ingredient.unit}/day`,
    };
  }
  
  /**
   * Predict stockout dates
   */
  static async predictStockouts(merchantId) {
    const ingredients = await Ingredient.find({
      merchant: merchantId,
      isActive: true,
      dailyUsageRate: { $gt: 0 },
    });
    
    return ingredients.map(ing => {
      const daysUntilStockout = ing.currentStock / ing.dailyUsageRate;
      return {
        ingredient: ing.name,
        stock: ing.currentStock,
        daily_usage: ing.dailyUsageRate,
        days_until_stockout: daysUntilStockout.toFixed(1),
        action: daysUntilStockout < 2 ? 'Order within 24 hours' : 'Monitor',
      };
    }).filter(i => i.days_until_stockout < 7); // Next 7 days
  }
}
```

#### 6.2 Add Report Endpoints

**File**: `src/modules/inventory/inventory.routes.js` (Update)

```javascript
router.get('/reports/low-stock', auth, getL owStockReport);
router.get('/reports/movement', auth, getMovementReport);
router.get('/reports/forecast', auth, getForecastReport);
router.get('/reports/usage', auth, getUsageReport);
```

---

## Integration Points with Existing System

### 1. Order Module Integration

```javascript
// In src/modules/order/orders.routes.js
const { validateOrderStock } = require('./middleware/stockValidation');

router.post('/', auth, validateOrderStock, createOrder);
```

### 2. Menu Module Integration

```javascript
// Add availability check endpoint
router.get('/:id/availability', getMenuItemAvailability);
router.patch('/:id/override-availability', overrideAvailability);
```

### 3. Notification Module (Already exists)

Use existing `NotificationService` for alerts.

### 4. Dashboard Module

Add inventory widget:
```javascript
router.get('/dashboard/inventory-summary', getInventorySummary);
```

---

## Scheduled Jobs

Create scheduled tasks for:

**File**: `src/jobs/inventoryJobs.js` (NEW)

```javascript
const cron = require('node-cron');

// Calculate daily usage rate (every night at midnight)
cron.schedule('0 0 * * *', async () => {
  await IngredientService.updateDailyUsageRates();
});

// Send daily digest (every morning at 8 AM)
cron.schedule('0 8 * * *', async () => {
  const merchants = await Merchant.find({ isActive: true });
  for (const merchant of merchants) {
    await InventoryAlertService.sendDailyDigest(merchant._id);
  }
});

// Check and expire manual overrides (every hour)
cron.schedule('0 * * * *', async () => {
  await MenuAvailabilityService.expireOverrides();
});
```

---

## Database Migration

### Step 1: Add new fields to existing Ingredient documents

```javascript
// migrations/add-inventory-fields.js
await Ingredient.updateMany(
  {},
  {
    $set: {
      reorderQuantity: 0,
      alertStatus: 'OK',
      dailyUsageRate: 0,
    },
  }
);
```

### Step 2: Add availability to Menu documents

```javascript
await Menu.updateMany(
  {},
  {
    $set: {
      'availability.status': 'available',
    },
  }
);
```

---

## Testing Strategy

1. **Unit Tests**: Each service method
2. **Integration Tests**: Order flow with stock deduction
3. **E2E Tests**: Complete workflow from low stock alert to restock
4. **Load Tests**: Concurrent order validation

---

## Rollout Plan

### Week 1
- ✅ Update Ingredient model
- ✅ Create StockHistory model
- ✅ Enhance IngredientService
- ✅ Add new endpoints

### Week 2
- ✅ Menu availability integration
- ✅ Order validation middleware
- ✅ Stock deduction on orders

### Week 3
- ✅ Notification system
- ✅ Dashboard widgets
- ✅ Email/SMS alerts

### Week 4
- ✅ Reporting endpoints
- ✅ Analytics dashboard
- ✅ Scheduled jobs

### Week 5+
- ✅ Advanced forecasting
- ✅ Supplier integration
- ✅ Mobile app alerts
- ✅ Real-time WebSocket updates

---

## Priority Recommendations

Start with:
1. **Phase 1** (Model enhancements) - Foundation
2. **Phase 2** (Add stock workflow) - Immediate value
3. **Phase 3** (Menu integration) - Prevent customer complaints
4. **Phase 4** (Order validation) - Critical for accuracy

Then add:
5. **Phase 5** (Notifications) - Proactive management
6. **Phase 6** (Reports) - Business intelligence

---

## Next Steps

1. **Review this plan** with your team
2. **Prioritize features** - All or MVP first?
3. **Create Git branch**: `feature/inventory-management`
4. **Start with Phase 1** - Model enhancements
5. **Test incrementally** after each phase

Ready to start implementation? Let me know which phase you'd like to begin with!
