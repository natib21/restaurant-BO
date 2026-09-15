# Inventory System - Frontend Integration Guide

**Backend Architecture:** Branch-scoped inventory with recipe-based deduction  
**Last Updated:** 2026-09-03  
**Status:** Production-ready after recipe resolution fix

---

## 🎯 System Overview

The inventory system manages:
- **Ingredients** - Branch-scoped stock items (Chicken, Tomatoes, etc.)
- **Recipes** - Menu item ingredient lists (Doro Wat needs 0.5kg Chicken)
- **Stock Movements** - Purchase orders, consumption, adjustments, waste
- **Profitability** - COGS tracking with cost averaging

### Key Architecture Points

1. **Branch Isolation**: Each branch maintains separate ingredient stocks
2. **Recipe Resolution**: Recipes store `ingredientName` (String), resolved to branch-specific ingredient at order time
3. **Automatic Deduction**: Order placement automatically deducts from branch inventory
4. **Cost Tracking**: FIFO/Average costing for profit calculations

---

## 📦 Quick Setup

```bash
npm install axios socket.io-client react-hot-toast
```

```javascript
// config.js
export const API_BASE_URL = 'http://localhost:3000/api/v1';
export const SOCKET_URL = 'http://localhost:3000';
```

---

## 🏗️ Data Models

### Ingredient
```typescript
interface Ingredient {
  _id: string;
  merchant: string;
  branch: string;              // Branch-scoped!
  name: string;                // "Chicken", "Tomatoes"
  unit: 'kg' | 'g' | 'liter' | 'ml' | 'pieces' | 'boxes' | 'cans';
  category: 'meat' | 'vegetables' | 'dairy' | 'spices' | 'beverages' | 'other';
  currentStock: number;        // Current available quantity
  minStock: number;            // Alert threshold
  costPerUnit: number;         // Weighted average cost
  isActive: boolean;
  lastRestocked?: Date;
}
```

### Recipe
```typescript
interface Recipe {
  _id: string;
  merchant: string;
  menuItem: string;            // References MenuItem._id
  name: string;
  items: RecipeItem[];         // Ingredient list
  yield: number;               // Portions per recipe
  isActive: boolean;
}

interface RecipeItem {
  ingredientName: string;      // ⚠️ STRING, not ObjectId!
  quantity: number;            // e.g., 0.5
  unit: string;                // Must match Ingredient.unit
}
```

### StockMovement
```typescript
interface StockMovement {
  _id: string;
  merchant: string;
  branch: string;
  ingredient: string;          // Ingredient._id
  type: 'in' | 'out';
  movementType: 'purchase' | 'adjustment' | 'waste' | 'order_consumption' | 'refund';
  quantity: number;
  unitCost?: number;           // For purchases
  reference: string;           // e.g., "Order #DI-000042"
  performedBy: string;         // User._id
  reason?: string;
  createdAt: Date;
}
```

### PurchaseOrder
```typescript
interface PurchaseOrder {
  _id: string;
  merchant: string;
  branch: string;
  orderNumber: string;
  supplier?: {
    name: string;
    phone?: string;
  };
  items: POItem[];
  subtotal: number;
  tax: number;
  totalAmount: number;
  status: 'pending' | 'approved' | 'received' | 'cancelled';
  createdBy: string;
  approvedBy?: string;
  receivedAt?: Date;
}

interface POItem {
  ingredient: string;          // Ingredient._id
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}
```

---

## 🔌 API Endpoints

### Ingredients

#### List Ingredients (Branch-Scoped)
```javascript
GET /api/v1/inventory/ingredients?branchId={branchId}

// Response
{
  status: 'success',
  results: 15,
  data: {
    ingredients: [
      {
        _id: '...',
        name: 'Chicken',
        unit: 'kg',
        currentStock: 45.5,
        minStock: 20,
        costPerUnit: 125,
        category: 'meat',
        branch: '...',
        isActive: true
      }
    ]
  }
}
```

#### Create Ingredient
```javascript
POST /api/v1/inventory/ingredients
Authorization: Bearer {token}

{
  branchId: '...',
  name: 'Tomatoes',
  unit: 'kg',
  category: 'vegetables',
  minStock: 10,
  costPerUnit: 15  // Optional initial cost
}

// Response: 201 Created
{
  status: 'success',
  data: { ingredient: {...} }
}
```

#### Update Ingredient Stock (Manual Adjustment)
```javascript
PUT /api/v1/inventory/ingredients/{id}/adjust
Authorization: Bearer {token}

{
  quantity: 5,              // Can be positive or negative
  reason: 'Damaged stock',
  movementType: 'waste'     // 'adjustment' | 'waste'
}

// Response
{
  status: 'success',
  data: {
    ingredient: { currentStock: 40.5, ... },
    movement: { type: 'out', quantity: 5, ... }
  }
}
```

#### Get Low Stock Items
```javascript
GET /api/v1/inventory/ingredients/low-stock?branchId={branchId}

// Response
{
  status: 'success',
  results: 3,
  data: {
    lowStockItems: [
      {
        ingredient: { name: 'Chicken', currentStock: 15, minStock: 20, ... },
        deficit: 5  // minStock - currentStock
      }
    ]
  }
}
```

### Recipes

#### List Recipes
```javascript
GET /api/v1/inventory/recipes?merchantId={merchantId}

// Response
{
  status: 'success',
  data: {
    recipes: [
      {
        _id: '...',
        name: 'Doro Wat Recipe',
        menuItem: {...},  // Populated MenuItem
        items: [
          { ingredientName: 'Chicken', quantity: 0.5, unit: 'kg' },
          { ingredientName: 'Onions', quantity: 0.2, unit: 'kg' }
        ],
        yield: 1,
        isActive: true
      }
    ]
  }
}
```

#### Create Recipe
```javascript
POST /api/v1/inventory/recipes
Authorization: Bearer {token}

{
  menuItemId: '...',
  name: 'Doro Wat Recipe',
  items: [
    {
      ingredientName: 'Chicken',  // ⚠️ Must match existing ingredient name
      quantity: 0.5,
      unit: 'kg'
    },
    {
      ingredientName: 'Onions',
      quantity: 0.2,
      unit: 'kg'
    }
  ],
  yield: 1  // 1 portion
}

// Response: 201 Created
// ⚠️ Backend validates ingredientName exists in merchant's ingredients
```

#### Update Recipe
```javascript
PUT /api/v1/inventory/recipes/{id}
Authorization: Bearer {token}

{
  items: [
    { ingredientName: 'Chicken', quantity: 0.6, unit: 'kg' }  // Updated quantity
  ]
}
```

### Purchase Orders

#### Create Purchase Order
```javascript
POST /api/v1/inventory/purchase-orders
Authorization: Bearer {token}

{
  branchId: '...',
  supplier: {
    name: 'ABC Suppliers',
    phone: '+251911234567'
  },
  items: [
    {
      ingredientId: '...',
      quantity: 50,
      unit: 'kg',
      unitPrice: 120,
      totalPrice: 6000
    }
  ],
  subtotal: 6000,
  tax: 900,
  totalAmount: 6900
}

// Response: 201 Created
{
  status: 'success',
  data: {
    purchaseOrder: {
      orderNumber: 'PO-001',
      status: 'pending',
      ...
    }
  }
}
```

#### Receive Purchase Order (Updates Stock)
```javascript
POST /api/v1/inventory/purchase-orders/{id}/receive
Authorization: Bearer {token}

// No body needed - uses PO items

// Response
{
  status: 'success',
  message: 'Purchase order received and stock updated',
  data: {
    purchaseOrder: { status: 'received', receivedAt: '...', ... },
    stockMovements: [...]  // Created movements
  }
}

// ⚠️ This automatically:
// 1. Updates ingredient.currentStock
// 2. Recalculates ingredient.costPerUnit (weighted average)
// 3. Creates StockMovement records
```

### Stock Movements

#### Get Movement History
```javascript
GET /api/v1/inventory/movements?branchId={branchId}&limit=50

// Response
{
  status: 'success',
  data: {
    movements: [
      {
        _id: '...',
        ingredient: { name: 'Chicken', ... },
        type: 'out',
        movementType: 'order_consumption',
        quantity: 1,
        reference: 'Order #DI-000042',
        performedBy: { firstName: 'John', ... },
        createdAt: '2026-09-03T10:30:00.000Z'
      }
    ]
  }
}
```

#### Filter by Ingredient
```javascript
GET /api/v1/inventory/movements?ingredientId={ingredientId}&startDate=2026-09-01&endDate=2026-09-30
```

---

## 🎨 React Components

### 1. Ingredient List Component

```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export function IngredientList({ branchId }) {
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lowStockOnly, setLowStockOnly] = useState(false);

  useEffect(() => {
    loadIngredients();
  }, [branchId, lowStockOnly]);

  const loadIngredients = async () => {
    try {
      setLoading(true);
      const endpoint = lowStockOnly 
        ? `/api/v1/inventory/ingredients/low-stock?branchId=${branchId}`
        : `/api/v1/inventory/ingredients?branchId=${branchId}`;
      
      const response = await axios.get(endpoint);
      
      const data = lowStockOnly 
        ? response.data.data.lowStockItems.map(item => ({
            ...item.ingredient,
            deficit: item.deficit
          }))
        : response.data.data.ingredients;
      
      setIngredients(data);
    } catch (error) {
      toast.error('Failed to load ingredients');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustStock = async (ingredientId, quantity, reason) => {
    try {
      await axios.put(
        `/api/v1/inventory/ingredients/${ingredientId}/adjust`,
        { quantity, reason, movementType: 'adjustment' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('Stock adjusted');
      loadIngredients();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to adjust stock');
    }
  };

  if (loading) return <div>Loading ingredients...</div>;

  return (
    <div>
      <div className="filters">
        <button onClick={() => setLowStockOnly(!lowStockOnly)}>
          {lowStockOnly ? 'Show All' : 'Low Stock Only'}
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Current Stock</th>
            <th>Min Stock</th>
            <th>Unit</th>
            <th>Cost/Unit</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {ingredients.map(ing => (
            <tr key={ing._id} className={ing.currentStock < ing.minStock ? 'low-stock' : ''}>
              <td>{ing.name}</td>
              <td>
                {ing.currentStock.toFixed(2)}
                {ing.deficit && <span className="badge">-{ing.deficit}</span>}
              </td>
              <td>{ing.minStock}</td>
              <td>{ing.unit}</td>
              <td>{ing.costPerUnit.toFixed(2)} ETB</td>
              <td>
                {ing.currentStock < ing.minStock ? (
                  <span className="badge badge-warning">Low</span>
                ) : (
                  <span className="badge badge-success">OK</span>
                )}
              </td>
              <td>
                <button onClick={() => openAdjustModal(ing)}>Adjust</button>
                <button onClick={() => openPOModal(ing)}>Restock</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### 2. Recipe Management Component

```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export function RecipeForm({ menuItemId, existingRecipe, onSave }) {
  const [recipe, setRecipe] = useState({
    menuItemId,
    name: '',
    items: [{ ingredientName: '', quantity: 0, unit: 'kg' }],
    yield: 1
  });
  const [availableIngredients, setAvailableIngredients] = useState([]);

  useEffect(() => {
    loadAvailableIngredients();
    if (existingRecipe) {
      setRecipe(existingRecipe);
    }
  }, [existingRecipe]);

  const loadAvailableIngredients = async () => {
    try {
      const response = await axios.get(
        `/api/v1/inventory/ingredients?branchId=${branchId}`
      );
      setAvailableIngredients(response.data.data.ingredients);
    } catch (error) {
      toast.error('Failed to load ingredients');
    }
  };

  const addIngredient = () => {
    setRecipe(prev => ({
      ...prev,
      items: [...prev.items, { ingredientName: '', quantity: 0, unit: 'kg' }]
    }));
  };

  const removeIngredient = (index) => {
    setRecipe(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const updateIngredient = (index, field, value) => {
    setRecipe(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const endpoint = existingRecipe 
        ? `/api/v1/inventory/recipes/${existingRecipe._id}`
        : '/api/v1/inventory/recipes';
      
      const method = existingRecipe ? 'put' : 'post';
      
      await axios[method](
        endpoint,
        recipe,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`Recipe ${existingRecipe ? 'updated' : 'created'}`);
      onSave();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save recipe');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Recipe Name</label>
        <input
          type="text"
          value={recipe.name}
          onChange={e => setRecipe({...recipe, name: e.target.value})}
          required
        />
      </div>

      <div>
        <label>Yield (Portions)</label>
        <input
          type="number"
          value={recipe.yield}
          onChange={e => setRecipe({...recipe, yield: Number(e.target.value)})}
          min="1"
          required
        />
      </div>

      <div className="ingredients-section">
        <h3>Ingredients</h3>
        {recipe.items.map((item, index) => (
          <div key={index} className="ingredient-row">
            <select
              value={item.ingredientName}
              onChange={e => updateIngredient(index, 'ingredientName', e.target.value)}
              required
            >
              <option value="">Select ingredient...</option>
              {availableIngredients.map(ing => (
                <option key={ing._id} value={ing.name}>
                  {ing.name} ({ing.unit})
                </option>
              ))}
            </select>

            <input
              type="number"
              step="0.01"
              value={item.quantity}
              onChange={e => updateIngredient(index, 'quantity', Number(e.target.value))}
              placeholder="Quantity"
              required
            />

            <select
              value={item.unit}
              onChange={e => updateIngredient(index, 'unit', e.target.value)}
              required
            >
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="liter">liter</option>
              <option value="ml">ml</option>
              <option value="pieces">pieces</option>
            </select>

            <button type="button" onClick={() => removeIngredient(index)}>
              Remove
            </button>
          </div>
        ))}
        
        <button type="button" onClick={addIngredient}>
          + Add Ingredient
        </button>
      </div>

      <button type="submit">
        {existingRecipe ? 'Update Recipe' : 'Create Recipe'}
      </button>
    </form>
  );
}
```

### 3. Purchase Order Component

```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export function PurchaseOrderForm({ branchId, onSuccess }) {
  const [po, setPO] = useState({
    branchId,
    supplier: { name: '', phone: '' },
    items: [{ ingredientId: '', quantity: 0, unit: 'kg', unitPrice: 0 }],
    subtotal: 0,
    tax: 0,
    totalAmount: 0
  });
  const [ingredients, setIngredients] = useState([]);

  useEffect(() => {
    loadIngredients();
  }, [branchId]);

  useEffect(() => {
    calculateTotals();
  }, [po.items]);

  const loadIngredients = async () => {
    try {
      const response = await axios.get(
        `/api/v1/inventory/ingredients?branchId=${branchId}`
      );
      setIngredients(response.data.data.ingredients);
    } catch (error) {
      toast.error('Failed to load ingredients');
    }
  };

  const calculateTotals = () => {
    const subtotal = po.items.reduce((sum, item) => 
      sum + (item.quantity * item.unitPrice), 0
    );
    const tax = subtotal * 0.15;  // 15% VAT
    const totalAmount = subtotal + tax;
    
    setPO(prev => ({ ...prev, subtotal, tax, totalAmount }));
  };

  const addItem = () => {
    setPO(prev => ({
      ...prev,
      items: [...prev.items, { ingredientId: '', quantity: 0, unit: 'kg', unitPrice: 0 }]
    }));
  };

  const updateItem = (index, field, value) => {
    setPO(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const response = await axios.post(
        '/api/v1/inventory/purchase-orders',
        po,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`PO ${response.data.data.purchaseOrder.orderNumber} created`);
      onSuccess(response.data.data.purchaseOrder);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create PO');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="supplier-section">
        <h3>Supplier Information</h3>
        <input
          type="text"
          placeholder="Supplier Name"
          value={po.supplier.name}
          onChange={e => setPO({...po, supplier: {...po.supplier, name: e.target.value}})}
          required
        />
        <input
          type="tel"
          placeholder="Phone"
          value={po.supplier.phone}
          onChange={e => setPO({...po, supplier: {...po.supplier, phone: e.target.value}})}
        />
      </div>

      <div className="items-section">
        <h3>Items</h3>
        {po.items.map((item, index) => {
          const ingredient = ingredients.find(ing => ing._id === item.ingredientId);
          
          return (
            <div key={index} className="po-item-row">
              <select
                value={item.ingredientId}
                onChange={e => {
                  const ing = ingredients.find(i => i._id === e.target.value);
                  updateItem(index, 'ingredientId', e.target.value);
                  updateItem(index, 'unit', ing?.unit || 'kg');
                }}
                required
              >
                <option value="">Select ingredient...</option>
                {ingredients.map(ing => (
                  <option key={ing._id} value={ing._id}>
                    {ing.name} (Current: {ing.currentStock} {ing.unit})
                  </option>
                ))}
              </select>

              <input
                type="number"
                step="0.01"
                placeholder="Quantity"
                value={item.quantity}
                onChange={e => updateItem(index, 'quantity', Number(e.target.value))}
                required
              />

              <span>{ingredient?.unit || 'kg'}</span>

              <input
                type="number"
                step="0.01"
                placeholder="Unit Price"
                value={item.unitPrice}
                onChange={e => updateItem(index, 'unitPrice', Number(e.target.value))}
                required
              />

              <span className="total">
                {(item.quantity * item.unitPrice).toFixed(2)} ETB
              </span>
            </div>
          );
        })}
        
        <button type="button" onClick={addItem}>
          + Add Item
        </button>
      </div>

      <div className="totals">
        <div>Subtotal: {po.subtotal.toFixed(2)} ETB</div>
        <div>Tax (15%): {po.tax.toFixed(2)} ETB</div>
        <div className="total-amount">Total: {po.totalAmount.toFixed(2)} ETB</div>
      </div>

      <button type="submit">Create Purchase Order</button>
    </form>
  );
}
```

### 4. Stock Movement History

```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

export function StockMovementHistory({ branchId }) {
  const [movements, setMovements] = useState([]);
  const [filters, setFilters] = useState({
    ingredientId: '',
    startDate: '',
    endDate: '',
    movementType: ''
  });

  useEffect(() => {
    loadMovements();
  }, [branchId, filters]);

  const loadMovements = async () => {
    try {
      const params = new URLSearchParams({
        branchId,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, v]) => v !== '')
        )
      });
      
      const response = await axios.get(
        `/api/v1/inventory/movements?${params}`
      );
      
      setMovements(response.data.data.movements);
    } catch (error) {
      console.error('Failed to load movements', error);
    }
  };

  const getMovementColor = (movement) => {
    if (movement.type === 'in') return 'green';
    if (movement.movementType === 'order_consumption') return 'blue';
    if (movement.movementType === 'waste') return 'red';
    return 'orange';
  };

  return (
    <div>
      <div className="filters">
        <select 
          value={filters.movementType}
          onChange={e => setFilters({...filters, movementType: e.target.value})}
        >
          <option value="">All Types</option>
          <option value="purchase">Purchase</option>
          <option value="order_consumption">Order Consumption</option>
          <option value="adjustment">Adjustment</option>
          <option value="waste">Waste</option>
          <option value="refund">Refund</option>
        </select>

        <input
          type="date"
          value={filters.startDate}
          onChange={e => setFilters({...filters, startDate: e.target.value})}
          placeholder="Start Date"
        />

        <input
          type="date"
          value={filters.endDate}
          onChange={e => setFilters({...filters, endDate: e.target.value})}
          placeholder="End Date"
        />
      </div>

      <div className="movement-list">
        {movements.map(movement => (
          <div 
            key={movement._id} 
            className="movement-card"
            style={{ borderLeftColor: getMovementColor(movement) }}
          >
            <div className="movement-header">
              <span className="ingredient-name">
                {movement.ingredient.name}
              </span>
              <span className={`movement-type ${movement.type}`}>
                {movement.type === 'in' ? '+' : '-'}{movement.quantity} {movement.ingredient.unit}
              </span>
            </div>

            <div className="movement-details">
              <span className="movement-type-label">
                {movement.movementType}
              </span>
              {movement.reference && (
                <span className="reference">{movement.reference}</span>
              )}
            </div>

            <div className="movement-footer">
              <span className="performed-by">
                {movement.performedBy?.firstName} {movement.performedBy?.lastName}
              </span>
              <span className="timestamp">
                {new Date(movement.createdAt).toLocaleString()}
              </span>
            </div>

            {movement.reason && (
              <div className="movement-reason">
                Reason: {movement.reason}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## ⚠️ Critical Implementation Notes

### 1. Recipe Resolution by Name

**⚠️ CRITICAL:** Recipes store `ingredientName` as a **STRING**, not an ObjectId.

```javascript
// ❌ WRONG - Don't do this
const recipe = {
  items: [
    { ingredient: ingredientObjectId, quantity: 0.5, unit: 'kg' }
  ]
};

// ✅ CORRECT - Use ingredientName
const recipe = {
  items: [
    { ingredientName: 'Chicken', quantity: 0.5, unit: 'kg' }  // String!
  ]
};
```

**Why?** The backend resolves `ingredientName` to the correct branch-specific ingredient ObjectId at order time, enabling branch isolation.

### 2. Branch Context is Required

Always pass `branchId` when:
- Listing ingredients
- Creating recipes (backend validates ingredient exists in any branch)
- Placing orders (order placement resolves to correct branch's ingredients)

```javascript
// ❌ WRONG
const ingredients = await axios.get('/api/v1/inventory/ingredients');

// ✅ CORRECT
const ingredients = await axios.get(
  `/api/v1/inventory/ingredients?branchId=${branchId}`
);
```

### 3. Order Placement Auto-Deducts

When a customer places an order with inventory-enabled:

```javascript
// Frontend just places order normally
await axios.post('/api/v1/orders', {
  items: [{ menuItemId: '...', quantity: 2 }],
  branchId: '...',
  // ... other fields
});

// Backend automatically:
// 1. Looks up recipe for menuItem
// 2. Resolves recipe.items[].ingredientName to branch-specific ingredients
// 3. Deducts stock from branch inventory
// 4. Creates StockMovement records
```

**No frontend action needed** — inventory deduction is automatic!

### 4. Cost Per Unit is Weighted Average

When receiving a purchase order, `costPerUnit` is recalculated:

```
newCostPerUnit = (oldStock * oldCost + newStock * newCost) / (oldStock + newStock)
```

This happens automatically on PO receipt — no frontend calculation needed.

### 5. Validation Errors

Common validation errors to handle:

```javascript
try {
  await createRecipe();
} catch (error) {
  const message = error.response?.data?.message;
  
  if (message.includes('not found for this merchant')) {
    // Ingredient name doesn't exist
    toast.error('Ingredient not found. Create it first!');
  } else if (message.includes('Insufficient stock')) {
    // Order placement failed due to low stock
    toast.error('Insufficient stock for this order');
  } else {
    toast.error(message);
  }
}
```

---

## 🎯 Common UI Patterns

### Low Stock Alert Badge

```jsx
function StockBadge({ ingredient }) {
  const { currentStock, minStock } = ingredient;
  const stockPercent = (currentStock / minStock) * 100;
  
  let color = 'green';
  let label = 'OK';
  
  if (stockPercent < 50) {
    color = 'red';
    label = 'Critical';
  } else if (stockPercent < 100) {
    color = 'orange';
    label = 'Low';
  }
  
  return (
    <span className={`badge badge-${color}`}>
      {label}
    </span>
  );
}
```

### Ingredient Autocomplete

```jsx
import { useState } from 'react';

function IngredientAutocomplete({ ingredients, onSelect }) {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = ingredients.filter(ing =>
    ing.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="autocomplete">
      <input
        type="text"
        value={search}
        onChange={e => {
          setSearch(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        placeholder="Search ingredient..."
      />

      {showDropdown && filtered.length > 0 && (
        <div className="autocomplete-dropdown">
          {filtered.map(ing => (
            <div
              key={ing._id}
              className="autocomplete-item"
              onClick={() => {
                onSelect(ing);
                setSearch(ing.name);
                setShowDropdown(false);
              }}
            >
              {ing.name} - {ing.currentStock} {ing.unit}
              <StockBadge ingredient={ing} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Recipe Cost Calculator

```jsx
function RecipeCostDisplay({ recipe, branchId }) {
  const [cost, setCost] = useState(null);

  useEffect(() => {
    calculateCost();
  }, [recipe, branchId]);

  const calculateCost = async () => {
    try {
      // Load ingredients for this branch
      const response = await axios.get(
        `/api/v1/inventory/ingredients?branchId=${branchId}`
      );
      const ingredients = response.data.data.ingredients;

      // Calculate total cost
      let totalCost = 0;
      let missingIngredients = [];

      for (const item of recipe.items) {
        const ingredient = ingredients.find(
          ing => ing.name === item.ingredientName && ing.unit === item.unit
        );

        if (!ingredient) {
          missingIngredients.push(item.ingredientName);
        } else {
          totalCost += item.quantity * ingredient.costPerUnit;
        }
      }

      setCost({
        total: totalCost,
        perPortion: totalCost / recipe.yield,
        missing: missingIngredients
      });
    } catch (error) {
      console.error('Failed to calculate cost', error);
    }
  };

  if (!cost) return <div>Calculating cost...</div>;

  return (
    <div className="recipe-cost">
      <div>Total Cost: {cost.total.toFixed(2)} ETB</div>
      <div>Cost per Portion: {cost.perPortion.toFixed(2)} ETB</div>
      {cost.missing.length > 0 && (
        <div className="warning">
          Missing ingredients: {cost.missing.join(', ')}
        </div>
      )}
    </div>
  );
}
```

---

## 🔔 Real-Time Updates (Optional)

If implementing real-time stock updates via Socket.IO:

```javascript
import io from 'socket.io-client';

// Connect
const socket = io(SOCKET_URL, {
  auth: { token: authToken }
});

// Join branch inventory room
socket.emit('join', `branch:${branchId}:inventory`);

// Listen for stock changes
socket.on('inventory:stock-changed', (data) => {
  /*
  data = {
    ingredientId: string,
    ingredientName: string,
    oldStock: number,
    newStock: number,
    branchId: string,
    movementType: string
  }
  */
  
  // Update local state
  setIngredients(prev => prev.map(ing =>
    ing._id === data.ingredientId
      ? { ...ing, currentStock: data.newStock }
      : ing
  ));
  
  // Show notification
  toast.info(`${data.ingredientName} stock updated: ${data.newStock}`);
});

// Listen for low stock alerts
socket.on('inventory:low-stock-alert', (data) => {
  toast.warning(
    `Low stock alert: ${data.ingredientName} (${data.currentStock}/${data.minStock})`
  );
});
```

---

## ✅ Testing Checklist

### Ingredient Management
- [ ] Can create ingredient for branch
- [ ] Can update ingredient stock
- [ ] Low stock items show with badge
- [ ] Branch filtering works
- [ ] Stock adjustments reflect immediately

### Recipe Management
- [ ] Recipe creation validates ingredient names
- [ ] Can add/remove ingredients from recipe
- [ ] Recipe cost calculation accurate
- [ ] Can link recipe to menu item
- [ ] Ingredient autocomplete works

### Purchase Orders
- [ ] Can create PO with multiple items
- [ ] Tax calculation (15%) correct
- [ ] Receiving PO updates stock
- [ ] Receiving PO updates cost per unit
- [ ] PO approval flow works

### Order Integration
- [ ] Placing order deducts stock automatically
- [ ] Stock movement created for order
- [ ] Insufficient stock error handled
- [ ] Branch isolation maintained (orders deduct from correct branch)

### Edge Cases
- [ ] Recipe with non-existent ingredient shows error
- [ ] Cannot adjust stock below zero
- [ ] Cannot create duplicate ingredients (same name+unit+branch)
- [ ] PO receipt with zero quantity rejected

---

## 🐛 Common Issues & Solutions

### Issue: "Ingredient not found for this merchant"

**Cause:** Recipe uses `ingredientName` that doesn't exist in any branch.

**Solution:** 
1. Check ingredient spelling exactly matches
2. Ensure ingredient exists in at least one branch
3. Use ingredient autocomplete to avoid typos

### Issue: "Insufficient stock for this order"

**Cause:** Order quantity exceeds available stock.

**Solution:**
```javascript
// Before placing order, check stock availability
const checkStock = async (menuItemId, quantity, branchId) => {
  try {
    const response = await axios.post('/api/v1/inventory/check-availability', {
      menuItemId,
      quantity,
      branchId
    });
    
    return response.data.available;
  } catch (error) {
    return false;
  }
};

// Use in order form
if (!await checkStock(menuItemId, quantity, branchId)) {
  toast.error('Insufficient stock for this item');
  return;
}
```

### Issue: Cost per unit not updating after PO receipt

**Cause:** PO not marked as "received".

**Solution:** Call the receive endpoint:
```javascript
await axios.post(`/api/v1/inventory/purchase-orders/${poId}/receive`);
```

### Issue: Recipe validation failing

**Cause:** Unit mismatch between recipe and ingredient.

**Example:**
- Recipe: `{ ingredientName: 'Chicken', unit: 'kg' }`
- Ingredient in DB: `{ name: 'Chicken', unit: 'g' }`

**Solution:** Ensure units match exactly. Show ingredient unit in recipe form.

---

## 📚 Additional Resources

- **Backend API Documentation:** See Swagger at `/api-docs`
- **Inventory Architecture:** `docs/INVENTORY-AI-AGENT-INTEGRATION-GUIDE.md`
- **Test Examples:** `tests/inventory-recipe-resolution-real-e2e.test.js`
- **Order Integration:** `FRONTEND-QUICK-REFERENCE.md`

---

## 💡 Pro Tips

1. **Always show branch context** in UI — users should know which branch they're managing
2. **Implement autocomplete for ingredient names** to prevent typos
3. **Show real-time cost calculations** when building recipes
4. **Add confirmation dialogs** for destructive actions (delete ingredient, cancel PO)
5. **Cache ingredient list** to reduce API calls in recipe forms
6. **Implement optimistic updates** for stock adjustments (revert on error)
7. **Show historical cost** for purchased ingredients to track price changes
8. **Add bulk import** for initial ingredient setup (CSV upload)
9. **Implement barcode scanning** for ingredient management (if applicable)
10. **Generate inventory reports** (usage, waste, value) for managers

---

*Frontend integration guide for inventory system — Production-ready after September 2026 fix*
