# 🎯 Feedback System Complete Guide

## 📊 Overview

Your feedback system supports **two types of feedback**:

1. **Overall Experience Feedback** (Currently Implemented)
   - One rating for the entire visit/order
   - General comments about service, food, ambiance, etc.
   - Categories to classify the feedback type

2. **Item-Specific Feedback** (Extension Needed)
   - Individual ratings for each menu item in an order
   - Helps identify which dishes are performing well
   - More granular insights for menu optimization

---

## 🏗️ Current Implementation

### **Feedback Model Structure:**

```javascript
{
  merchant: ObjectId,           // Which restaurant
  branch: ObjectId,             // Which location (required)
  customer: ObjectId,           // Who gave feedback (optional for anonymous)
  order: ObjectId,              // Which order (optional - can be general feedback)
  
  // ── Overall Rating ────────────────────────────────────────────
  rating: Number,               // 1-5 stars (required)
  comment: String,              // Free text feedback (max 1000 chars)
  
  // ── Categorization ────────────────────────────────────────────
  categories: [String],         // What aspects they're rating
  channel: String,              // How they submitted (qr_table, app, etc.)
  
  // ── Visual Evidence ───────────────────────────────────────────
  images: [String],             // Photo URLs
  
  // ── Status & Response ─────────────────────────────────────────
  status: String,               // pending, reviewed, responded, resolved, flagged
  response: {
    text: String,               // Restaurant's reply
    respondedBy: ObjectId,      // Staff who replied
    respondedAt: Date
  },
  
  // ── Privacy & Flags ───────────────────────────────────────────
  isPublic: Boolean,            // Show as public review
  isAnonymous: Boolean,         // Hide customer name
  flaggedReason: String,        // Why it was flagged
  
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🎨 Feedback Categories Explained

### **Available Categories:**

| Category | What It Covers | Example Comments |
|----------|----------------|------------------|
| `food_quality` | Taste, freshness, presentation, temperature | "Food was cold", "Perfectly seasoned", "Presentation was beautiful" |
| `service` | Staff friendliness, speed, attentiveness | "Waiter was very helpful", "Took too long to get attention" |
| `cleanliness` | Table, utensils, restroom, overall hygiene | "Table was sticky", "Very clean environment" |
| `ambiance` | Music, lighting, noise level, atmosphere | "Too noisy", "Perfect romantic setting" |
| `delivery_time` | How fast food arrived | "Food came in 10 minutes!", "Waited 45 minutes" |
| `value_for_money` | Price vs quality ratio | "Worth every penny", "Too expensive for portion size" |
| `other` | General feedback not fitting above | "Parking was difficult", "Love the new decor" |

**Customer can select multiple categories:**
```json
{
  "categories": ["food_quality", "service", "ambiance"]
}
```

---

## 📝 Feedback Channels

| Channel | When Used | Auth Required |
|---------|-----------|---------------|
| `qr_table` | Customer orders via QR menu | Session token |
| `app` | Mobile/web app feedback | Customer login |
| `telegram` | Via Telegram bot | Telegram linked |
| `facebook` | Facebook page reviews (imported) | External |
| `google` | Google reviews (imported) | External |
| `walk_in` | Staff enters feedback verbally given | Staff JWT |
| `other` | Other sources | Varies |

---

## 🔄 Feedback Status Flow

```
pending → reviewed → responded → resolved
                ↓
            flagged (if inappropriate/spam)
```

### **Status Meanings:**

| Status | Meaning | Who Sets | Actions Available |
|--------|---------|----------|-------------------|
| `pending` | New feedback, not yet seen | System (auto) | Staff: mark as reviewed |
| `reviewed` | Staff has seen it | Staff | Staff: respond, flag |
| `responded` | Restaurant replied | Staff (auto) | Staff: mark resolved |
| `resolved` | Issue fixed, closed | Staff | Reopen if needed |
| `flagged` | Spam/inappropriate | Staff | Review, delete, or unflag |

---

## 💡 Current Feedback Flow (Overall Experience)

### **Scenario: Customer Finished Dining**

```
1. Order completed (status: "completed")
   ↓
2. Frontend shows feedback prompt
   ↓
3. Customer rates overall experience (1-5 stars)
   ↓
4. Customer writes comment (optional)
   ↓
5. Customer selects categories (food_quality, service, etc.)
   ↓
6. Customer uploads photos (optional)
   ↓
7. Submit: POST /api/v1/feedback
   ↓
8. Backend creates Feedback document
   ↓
9. Restaurant staff sees it in dashboard
   ↓
10. Staff responds (optional)
   ↓
11. Customer receives response notification
```

### **API Example (Overall Feedback):**

```http
POST /api/v1/feedback
Authorization: Bearer {sessionToken}
Content-Type: application/json
```

**Request:**
```json
{
  "rating": 4,
  "comment": "Great food but service was a bit slow. The grilled chicken was amazing though!",
  "categories": ["food_quality", "service"],
  "channel": "qr_table",
  "order": "6a95476015b8780e437fa865",
  "images": [
    "https://example.com/food-photo.jpg"
  ],
  "isPublic": true,
  "isAnonymous": false
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "feedback": {
      "_id": "6a95476015b8780e437fa867",
      "merchant": "6a9532e46c844d03b33ff55b",
      "branch": "6a9532e46c844d03b33ff55e",
      "customer": "6a95476015b8780e437fa866",
      "order": "6a95476015b8780e437fa865",
      "rating": 4,
      "comment": "Great food but service was a bit slow...",
      "categories": ["food_quality", "service"],
      "channel": "qr_table",
      "status": "pending",
      "isPublic": true,
      "createdAt": "2026-08-22T15:20:00.000Z"
    }
  }
}
```

---

## 🍕 Item-Specific Feedback (Extension)

### **Problem with Current System:**

Customer says: *"The chicken was perfect but the juice was too sweet"*

With overall rating only:
- ❌ Can't tell which item they liked/disliked
- ❌ Kitchen doesn't know which recipe to adjust
- ❌ Menu optimization is guesswork

### **Solution: Add Item-Level Ratings**

---

## 🔧 Implementing Item-Specific Feedback

### **Option 1: Embedded Approach (Recommended)**

Add `itemFeedback` array to existing Feedback model:

```javascript
// Add to models/feedbackModal.js

const itemFeedbackSchema = new Schema({
  menuItem: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  itemName: { type: String, required: true }, // Snapshot name
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: 500 },
  wouldOrderAgain: { type: Boolean, default: null },
  tags: [{ 
    type: String, 
    enum: ['too_salty', 'too_sweet', 'too_spicy', 'cold', 'overcooked', 'undercooked', 'perfect', 'creative', 'authentic']
  }]
}, { _id: true });

const feedbackSchema = new Schema({
  // ... existing fields ...
  
  // ── NEW: Item-specific ratings ────────────────────────────────
  itemFeedback: [itemFeedbackSchema],
  
}, { timestamps: true });
```

**Why this approach?**
- ✅ One feedback submission covers both overall + items
- ✅ Keeps feedback atomic (one transaction)
- ✅ Easier to query "show me all feedback for Order X"
- ✅ Simple API: one POST request

---

### **Option 2: Separate Collection Approach**

Create new `ItemFeedback` collection:

```javascript
// models/ItemFeedback.js

const itemFeedbackSchema = new Schema({
  merchant: { type: Schema.Types.ObjectId, ref: 'Merchant', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
  order: { type: Schema.Types.ObjectId, ref: 'Order' },
  orderFeedback: { type: Schema.Types.ObjectId, ref: 'Feedback' }, // Link to overall feedback
  
  menuItem: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  itemName: String,
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: String,
  wouldOrderAgain: Boolean,
  tags: [String],
  
  status: { type: String, enum: ['pending', 'reviewed', 'resolved'], default: 'pending' },
  isPublic: { type: Boolean, default: true }
}, { timestamps: true });
```

**Why this approach?**
- ✅ Better for heavy analytics (menu performance reports)
- ✅ Can submit item feedback independently
- ✅ Easier to aggregate per menu item
- ❌ More complex queries (join overall + item feedback)
- ❌ Two separate API calls needed

---

## 🎯 Recommended Implementation (Option 1 - Embedded)

### **Step 1: Update Feedback Model**

```javascript
// models/feedbackModal.js

const itemFeedbackSchema = new Schema({
  menuItem: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  itemName: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: 500 },
  wouldOrderAgain: { type: Boolean },
  tags: [{ 
    type: String, 
    enum: [
      'too_salty', 'too_sweet', 'too_spicy', 'bland',
      'cold', 'overcooked', 'undercooked',
      'perfect', 'delicious', 'creative', 'authentic',
      'small_portion', 'large_portion', 'good_value'
    ]
  }]
}, { _id: true });

// Add to main schema
const feedbackSchema = new Schema({
  // ... all existing fields ...
  
  itemFeedback: [itemFeedbackSchema], // NEW FIELD
  
}, { timestamps: true });
```

### **Step 2: Update Validation Schema**

```javascript
// src/modules/feedback/dto/feedback.dto.js

const itemFeedbackSchema = z.object({
  menuItem: z.string().trim().min(1, 'Menu item ID required'),
  itemName: z.string().trim().min(1, 'Item name required'),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
  wouldOrderAgain: z.boolean().optional(),
  tags: z.array(z.enum([
    'too_salty', 'too_sweet', 'too_spicy', 'bland',
    'cold', 'overcooked', 'undercooked',
    'perfect', 'delicious', 'creative', 'authentic',
    'small_portion', 'large_portion', 'good_value'
  ])).optional()
});

exports.createFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
  categories: z.array(z.enum(CATEGORY_VALUES)).optional(),
  channel: z.enum(CHANNEL_VALUES).optional().default('app'),
  order: z.string().trim().optional(),
  images: z.array(z.string().trim().max(1000)).optional(),
  isPublic: z.boolean().optional(),
  
  // NEW: Item-specific feedback
  itemFeedback: z.array(itemFeedbackSchema).optional()
});
```

### **Step 3: Update Service Logic**

```javascript
// src/modules/feedback/service/feedback.service.js

async submitFeedback(req, body) {
  const merchantId = getMerchantId(req);
  const branchId = req.session?.branch || resolveStaffBranchId(req);
  const customerId = req.customer?._id || null;
  
  // Validate order exists and belongs to customer
  if (body.order) {
    const order = await Order.findOne({
      _id: body.order,
      merchant: merchantId,
      ...(customerId && { customer: customerId })
    });
    
    if (!order) {
      throw new AppError('Order not found', 404);
    }
    
    // If itemFeedback provided, validate menu items are in the order
    if (body.itemFeedback && body.itemFeedback.length > 0) {
      const orderItemIds = order.items.map(item => item.menuItem.toString());
      
      for (const itemFb of body.itemFeedback) {
        if (!orderItemIds.includes(itemFb.menuItem)) {
          throw new AppError(
            `Menu item ${itemFb.itemName} was not in this order`,
            400
          );
        }
      }
    }
  }
  
  const feedback = await Feedback.create({
    merchant: merchantId,
    branch: branchId,
    customer: customerId,
    order: body.order || null,
    rating: body.rating,
    comment: body.comment,
    categories: body.categories || [],
    channel: body.channel || 'app',
    images: body.images || [],
    isPublic: body.isPublic !== false,
    isAnonymous: body.isAnonymous || false,
    itemFeedback: body.itemFeedback || [], // NEW
  });
  
  return feedback;
}
```

---

## 📱 Frontend Implementation

### **UI Flow with Item-Specific Feedback:**

```
1. Order completed
   ↓
2. Show feedback screen with two sections:
   ┌─────────────────────────────────────┐
   │ Overall Experience                   │
   │ ★★★★☆ (4 stars)                     │
   │ [Comment text area]                  │
   │ Categories: [Food] [Service] [...]   │
   └─────────────────────────────────────┘
   
   ┌─────────────────────────────────────┐
   │ Rate Your Items (Optional)           │
   │                                      │
   │ 🍗 Grilled Chicken                  │
   │ ★★★★★ (5 stars)                     │
   │ Tags: [Perfect] [Delicious]          │
   │ [Comment for this item...]           │
   │ Would order again? [Yes] [No]        │
   │                                      │
   │ 🥤 Orange Juice                     │
   │ ★★★☆☆ (3 stars)                     │
   │ Tags: [Too Sweet]                    │
   │ [Comment for this item...]           │
   │ Would order again? [Yes] [No]        │
   └─────────────────────────────────────┘
   
3. Submit both in one request
```

### **API Request Example (With Item Feedback):**

```http
POST /api/v1/feedback
Authorization: Bearer {sessionToken}
Content-Type: application/json
```

**Request Body:**
```json
{
  "rating": 4,
  "comment": "Overall great experience but some items were better than others",
  "categories": ["food_quality", "service"],
  "channel": "qr_table",
  "order": "6a95476015b8780e437fa865",
  "isPublic": true,
  
  "itemFeedback": [
    {
      "menuItem": "6a9536846c844d03b340008b",
      "itemName": "Grilled Chicken",
      "rating": 5,
      "comment": "Perfectly cooked, very tender and flavorful!",
      "wouldOrderAgain": true,
      "tags": ["perfect", "delicious"]
    },
    {
      "menuItem": "6a9536846c844d03b340008d",
      "itemName": "Fresh Orange Juice",
      "rating": 3,
      "comment": "Too sweet for my taste, could use less sugar",
      "wouldOrderAgain": false,
      "tags": ["too_sweet"]
    }
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "feedback": {
      "_id": "6a95476015b8780e437fa867",
      "rating": 4,
      "comment": "Overall great experience...",
      "categories": ["food_quality", "service"],
      "itemFeedback": [
        {
          "_id": "6a95476015b8780e437fa868",
          "menuItem": "6a9536846c844d03b340008b",
          "itemName": "Grilled Chicken",
          "rating": 5,
          "comment": "Perfectly cooked...",
          "wouldOrderAgain": true,
          "tags": ["perfect", "delicious"]
        },
        {
          "_id": "6a95476015b8780e437fa869",
          "menuItem": "6a9536846c844d03b340008d",
          "itemName": "Fresh Orange Juice",
          "rating": 3,
          "comment": "Too sweet...",
          "wouldOrderAgain": false,
          "tags": ["too_sweet"]
        }
      ],
      "createdAt": "2026-08-22T15:20:00.000Z"
    }
  }
}
```

---

## 📊 Analytics & Reporting

### **Overall Feedback Queries:**

```javascript
// Average rating per branch
db.feedbacks.aggregate([
  { $match: { merchant: ObjectId('...') } },
  { $group: {
    _id: '$branch',
    avgRating: { $avg: '$rating' },
    totalFeedback: { $sum: 1 }
  }}
]);

// Feedback by category
db.feedbacks.aggregate([
  { $match: { merchant: ObjectId('...') } },
  { $unwind: '$categories' },
  { $group: {
    _id: '$categories',
    count: { $sum: 1 },
    avgRating: { $avg: '$rating' }
  }}
]);
```

### **Item-Specific Analytics:**

```javascript
// Menu item performance report
db.feedbacks.aggregate([
  { $match: { merchant: ObjectId('...') } },
  { $unwind: '$itemFeedback' },
  { $group: {
    _id: '$itemFeedback.menuItem',
    itemName: { $first: '$itemFeedback.itemName' },
    avgRating: { $avg: '$itemFeedback.rating' },
    totalRatings: { $sum: 1 },
    wouldOrderAgainCount: { 
      $sum: { $cond: ['$itemFeedback.wouldOrderAgain', 1, 0] }
    }
  }},
  { $sort: { avgRating: -1 } }
]);

// Find problematic items (low ratings)
db.feedbacks.aggregate([
  { $unwind: '$itemFeedback' },
  { $match: { 'itemFeedback.rating': { $lte: 2 } } },
  { $group: {
    _id: '$itemFeedback.menuItem',
    itemName: { $first: '$itemFeedback.itemName' },
    avgRating: { $avg: '$itemFeedback.rating' },
    complaints: { $sum: 1 },
    commonTags: { $push: '$itemFeedback.tags' }
  }},
  { $sort: { complaints: -1 } }
]);
```

---

## 🎯 Quick Tag System Explained

### **Problem Tags (What's Wrong):**
- `too_salty` - Needs less salt
- `too_sweet` - Needs less sugar
- `too_spicy` - Too much heat
- `bland` - Needs more seasoning
- `cold` - Temperature issue
- `overcooked` - Cooked too long
- `undercooked` - Not cooked enough

### **Positive Tags (What's Right):**
- `perfect` - Just right
- `delicious` - Great taste
- `creative` - Unique/innovative
- `authentic` - Traditional/genuine

### **Portion/Value Tags:**
- `small_portion` - Not enough food
- `large_portion` - Generous serving
- `good_value` - Worth the price

**Benefits:**
- ✅ Quick to select (no typing required)
- ✅ Easy to aggregate (how many "too_salty" complaints?)
- ✅ Actionable insights for kitchen

---

## 🚀 Implementation Checklist

### **Backend Changes:**
- [ ] Update `models/feedbackModal.js` - add `itemFeedback` array
- [ ] Update `src/modules/feedback/dto/feedback.dto.js` - add validation
- [ ] Update `src/modules/feedback/service/feedback.service.js` - handle item feedback
- [ ] Test API with item feedback payload
- [ ] Add analytics queries for menu item performance
- [ ] Update staff dashboard to show item-specific feedback

### **Frontend Changes:**
- [ ] Design feedback UI with item list
- [ ] Implement star rating per item
- [ ] Add tag selection chips
- [ ] Add "Would order again?" toggle
- [ ] Combine overall + item feedback in one form
- [ ] Submit single API request with both
- [ ] Show success message with loyalty points earned

### **Optional Enhancements:**
- [ ] Auto-prompt feedback when order status = "completed"
- [ ] Show photo upload per item
- [ ] Pre-fill item names from order
- [ ] Skip rating for items customer didn't like (show "Prefer not to rate" option)
- [ ] Show item images in feedback form
- [ ] Allow partial submission (overall only OR overall + some items)

---

## 💡 Best Practices

### **For Customers:**
1. **Make it optional:** Don't force item-by-item rating
2. **Smart defaults:** Pre-select items from the order
3. **Quick tags:** Make it faster than writing comments
4. **Skip option:** Let customers skip items they don't want to rate
5. **Incentivize:** Offer loyalty points for detailed feedback

### **For Restaurant:**
1. **Act on feedback:** Close the loop by responding
2. **Share with kitchen:** Show item feedback to chefs daily
3. **Track trends:** Monitor tags over time (sudden spike in "too_salty"?)
4. **Reward specificity:** Give more points for item-level feedback
5. **Public display:** Show positive item feedback on menu (social proof)

---

## 📖 Summary

### **Current System:**
✅ Overall experience rating (1-5 stars)
✅ General comment
✅ Categories for classification
✅ Photo uploads
✅ Public/private toggle
✅ Staff response capability

### **With Item-Specific Extension:**
✅ All of the above PLUS:
✅ Individual ratings per menu item
✅ Item-specific comments
✅ Quick tags for common issues
✅ "Would order again?" flag
✅ Menu performance analytics
✅ Actionable insights for kitchen

### **Recommended Approach:**
**Option 1 (Embedded)** - Add `itemFeedback` array to existing Feedback model
- Simpler implementation
- One API call
- Keeps feedback atomic
- Perfect for your use case

---

**Ready to implement? Start with the backend model update, then add validation, then update the service logic!**
