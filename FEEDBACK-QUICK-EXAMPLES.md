# 🎯 Feedback System - Quick Examples

## 📊 Two Types of Feedback

### **Type 1: Overall Experience** (Current - Already Works)
One rating for the entire visit/order.

```json
POST /api/v1/feedback
{
  "rating": 4,
  "comment": "Good experience overall",
  "categories": ["food_quality", "service"],
  "order": "ORDER_ID"
}
```

**Use when:** Customer wants quick feedback without details.

---

### **Type 2: Item-Specific** (Extension - Requires Model Update)
Individual ratings for each menu item.

```json
POST /api/v1/feedback
{
  "rating": 4,
  "comment": "Mixed experience",
  "categories": ["food_quality"],
  "order": "ORDER_ID",
  
  "itemFeedback": [
    {
      "menuItem": "CHICKEN_ID",
      "itemName": "Grilled Chicken",
      "rating": 5,
      "comment": "Perfect!",
      "tags": ["delicious"]
    },
    {
      "menuItem": "JUICE_ID",
      "itemName": "Orange Juice",
      "rating": 2,
      "comment": "Too sweet",
      "tags": ["too_sweet"]
    }
  ]
}
```

**Use when:** Customer wants to rate specific dishes separately.

---

## 🎨 Frontend UI Examples

### **Simple Feedback (Overall Only):**

```
┌─────────────────────────────────────┐
│  How was your experience?            │
│                                      │
│  ★★★★☆ (4 stars)                    │
│                                      │
│  ┌────────────────────────────────┐ │
│  │ Great food, friendly staff!    │ │
│  │                                │ │
│  └────────────────────────────────┘ │
│                                      │
│  What did you like?                  │
│  [Food Quality] [Service] [Ambiance] │
│                                      │
│  [Submit Feedback]                   │
└─────────────────────────────────────┘
```

---

### **Detailed Feedback (Overall + Items):**

```
┌─────────────────────────────────────┐
│  How was your experience?            │
│                                      │
│  ★★★★☆ (4 stars)                    │
│                                      │
│  ┌────────────────────────────────┐ │
│  │ Good but some items better     │ │
│  │ than others                    │ │
│  └────────────────────────────────┘ │
│                                      │
│  Categories: [Food Quality]          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Rate Each Item (Optional)           │
│                                      │
│  🍗 Grilled Chicken                 │
│  ★★★★★ (5 stars)                    │
│  Tags: [Perfect] [Delicious]         │
│  ┌────────────────────────────────┐ │
│  │ Amazing! Very tender           │ │
│  └────────────────────────────────┘ │
│  Would order again? ✓ Yes  ○ No    │
│                                      │
│  ─────────────────────────────────  │
│                                      │
│  🥤 Fresh Orange Juice              │
│  ★★★☆☆ (3 stars)                    │
│  Tags: [Too Sweet]                   │
│  ┌────────────────────────────────┐ │
│  │ Way too sweet                  │ │
│  └────────────────────────────────┘ │
│  Would order again? ○ Yes  ✓ No    │
│                                      │
│  [Submit Feedback]                   │
└─────────────────────────────────────┘
```

---

## 🔄 How It Works

### **Scenario: Customer Ordered 2 Items**

**Order Items:**
- Grilled Chicken (loved it)
- Orange Juice (too sweet)

**What Customer Submits:**

```javascript
// Overall rating: 4 stars (good but not perfect)
// Chicken: 5 stars (amazing)
// Juice: 3 stars (mediocre)

{
  rating: 4,  // Overall
  comment: "Chicken was perfect but juice too sweet",
  
  itemFeedback: [
    {
      menuItem: "chicken_id",
      rating: 5,
      comment: "Best chicken I've had!",
      tags: ["perfect", "delicious"],
      wouldOrderAgain: true
    },
    {
      menuItem: "juice_id", 
      rating: 3,
      comment: "Needs less sugar",
      tags: ["too_sweet"],
      wouldOrderAgain: false
    }
  ]
}
```

### **What Restaurant Sees:**

**Dashboard View:**
```
┌─────────────────────────────────────┐
│ New Feedback - Order #0042          │
│ Customer: John Doe                   │
│ Overall: ★★★★☆ (4 stars)            │
│                                      │
│ "Chicken was perfect but juice too  │
│  sweet"                             │
│                                      │
│ Categories: Food Quality             │
│                                      │
│ ▼ Item Breakdown                    │
│                                      │
│ Grilled Chicken: ★★★★★ (5 stars)    │
│ "Best chicken I've had!"             │
│ Tags: perfect, delicious             │
│ Would reorder: Yes                   │
│                                      │
│ Fresh Orange Juice: ★★★☆☆ (3 stars) │
│ "Needs less sugar"                   │
│ Tags: too_sweet                      │
│ Would reorder: No                    │
│                                      │
│ [Mark as Reviewed] [Respond]         │
└─────────────────────────────────────┘
```

### **What Kitchen Sees:**

**Menu Analytics:**
```
┌─────────────────────────────────────┐
│ Menu Item Performance                │
│                                      │
│ Grilled Chicken                      │
│ ★★★★★ 4.8/5 (245 ratings)           │
│ Would reorder: 92%                   │
│ Common tags: perfect, delicious      │
│ ✓ Top performer                     │
│                                      │
│ Fresh Orange Juice                   │
│ ★★★☆☆ 3.2/5 (112 ratings)           │
│ Would reorder: 45%                   │
│ Common tags: too_sweet (78 mentions) │
│ ⚠️ Needs improvement                │
│                                      │
│ → Action: Reduce sugar in OJ recipe │
└─────────────────────────────────────┘
```

---

## 📊 Data Structure

### **Current (Overall Only):**
```javascript
{
  _id: "feedback_id",
  merchant: "merchant_id",
  branch: "branch_id",
  customer: "customer_id",
  order: "order_id",
  
  rating: 4,        // Overall only
  comment: "...",
  categories: ["food_quality", "service"],
  
  status: "pending",
  createdAt: "..."
}
```

### **Extended (With Item Feedback):**
```javascript
{
  _id: "feedback_id",
  merchant: "merchant_id",
  branch: "branch_id",
  customer: "customer_id",
  order: "order_id",
  
  rating: 4,        // Overall
  comment: "...",
  categories: ["food_quality"],
  
  itemFeedback: [   // NEW FIELD
    {
      _id: "item_feedback_1",
      menuItem: "chicken_id",
      itemName: "Grilled Chicken",
      rating: 5,
      comment: "Perfect!",
      tags: ["delicious"],
      wouldOrderAgain: true
    },
    {
      _id: "item_feedback_2",
      menuItem: "juice_id",
      itemName: "Orange Juice",
      rating: 3,
      comment: "Too sweet",
      tags: ["too_sweet"],
      wouldOrderAgain: false
    }
  ],
  
  status: "pending",
  createdAt: "..."
}
```

---

## 🚀 Implementation Steps

### **Step 1: Update Model** (Backend)
```javascript
// models/feedbackModal.js

const itemFeedbackSchema = new Schema({
  menuItem: { type: ObjectId, ref: 'MenuItem', required: true },
  itemName: String,
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, maxlength: 500 },
  wouldOrderAgain: Boolean,
  tags: [String]
});

// Add to main schema:
itemFeedback: [itemFeedbackSchema]
```

### **Step 2: Update Validation** (Backend)
```javascript
// dto/feedback.dto.js

itemFeedback: z.array(z.object({
  menuItem: z.string(),
  itemName: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string().max(500).optional(),
  wouldOrderAgain: z.boolean().optional(),
  tags: z.array(z.string()).optional()
})).optional()
```

### **Step 3: Update UI** (Frontend)
```javascript
// FeedbackForm.jsx

function FeedbackForm({ order }) {
  const [overallRating, setOverallRating] = useState(0);
  const [itemRatings, setItemRatings] = useState({});
  
  const handleSubmit = () => {
    const feedback = {
      rating: overallRating,
      comment: overallComment,
      order: order._id,
      
      itemFeedback: order.items.map(item => ({
        menuItem: item.menuItem,
        itemName: item.name,
        rating: itemRatings[item._id]?.rating || 0,
        comment: itemRatings[item._id]?.comment || '',
        tags: itemRatings[item._id]?.tags || []
      })).filter(item => item.rating > 0) // Only include rated items
    };
    
    submitFeedback(feedback);
  };
  
  return (
    <div>
      {/* Overall section */}
      <OverallRating onChange={setOverallRating} />
      
      {/* Item-by-item section */}
      <h3>Rate Each Item (Optional)</h3>
      {order.items.map(item => (
        <ItemRating 
          key={item._id}
          item={item}
          onChange={(rating) => setItemRatings({
            ...itemRatings,
            [item._id]: rating
          })}
        />
      ))}
      
      <button onClick={handleSubmit}>Submit</button>
    </div>
  );
}
```

---

## 💡 Key Points

### **For Customers:**
- Can give overall rating only (quick)
- Can add item ratings (detailed)
- Item ratings are optional
- Quick tags make it faster

### **For Restaurant:**
- Gets both overall sentiment AND specific insights
- Knows exactly which dishes need improvement
- Can track trends per menu item
- Actionable data for kitchen

### **Technical:**
- Single API call handles both
- Backward compatible (itemFeedback is optional)
- Easy to query and aggregate
- No breaking changes to existing feedback

---

## 📖 See Full Documentation

- [FEEDBACK-SYSTEM-GUIDE.md](./FEEDBACK-SYSTEM-GUIDE.md) - Complete implementation guide
- [QR-CUSTOMER-WORKFLOW.md](./QR-CUSTOMER-WORKFLOW.md) - Customer journey with feedback
- [QR-ENDPOINTS-QUICK-REFERENCE.md](./QR-ENDPOINTS-QUICK-REFERENCE.md) - API reference

---

**Questions?** Check the full guide for validation schemas, analytics queries, and best practices!
