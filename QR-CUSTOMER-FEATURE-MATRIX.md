# 🎯 QR Customer Features Matrix

## Feature Availability by Customer Type

| Feature | Guest (No Account) | Registered Customer | Benefits |
|---------|-------------------|---------------------|----------|
| **Scan QR & Start Session** | ✅ | ✅ | Access menu instantly |
| **Browse Menu** | ✅ | ✅ | View items, prices, ingredients, images |
| **Place Orders** | ✅ | ✅ | Order food from table |
| **Track Order Status** | ✅ | ✅ | Real-time order updates |
| **Payment** | ✅ | ✅ | Pay via staff or digital |
| **Order History** | ❌ | ✅ | View past orders, reorder easily |
| **Loyalty Points** | ❌ | ✅ | Earn points, unlock rewards |
| **Favorite Items** | ❌ | ✅ | Quick access to preferred dishes |
| **Telegram Notifications** | ❌ | ✅ | Get updates on Telegram |
| **Submit Feedback** | ❌ | ✅ | Rate orders, provide reviews |
| **Special Offers** | ❌ | ✅ | Receive personalized promotions |
| **Dietary Preferences** | ❌ | ✅ | Save preferences, get recommendations |

---

## 🔄 Customer Journey Stages

### **Stage 1: Anonymous Guest (QR Scan)**
```
Customer → Scans QR → Session Created → Browse Menu → Place Order
```
**Capabilities:**
- One-time session (2 hours)
- Basic ordering
- No data persistence
- No notifications

**Transition Point:** After first order or during checkout

---

### **Stage 2: First-Time Registration**
```
Guest → Prompted to Sign Up → Provides Phone/Name → Account Created
```
**New Capabilities Unlocked:**
- Session linked to customer account
- Order saved to history
- Loyalty points earned
- Eligible for promotions

**Onboarding Checklist:**
- [ ] Explain benefits (3-4 key points)
- [ ] Quick signup form (phone required, name/email optional)
- [ ] Auto-link current order to new account
- [ ] Show loyalty points earned
- [ ] Prompt Telegram connection (optional)

---

### **Stage 3: Active Customer (Telegram Connected)**
```
Registered Customer → Connects Telegram → Receives Notifications
```
**Enhanced Experience:**
- Order status updates on Telegram
- Promotional messages
- Reservation confirmations
- Loyalty rewards notifications
- Direct communication with restaurant

**Telegram Integration Steps:**
1. Display "Connect Telegram" CTA
2. Generate unique bot URL with customer ID
3. Customer opens Telegram and starts bot
4. Backend auto-updates customer record
5. Confirmation shown in app

---

### **Stage 4: Loyal Customer (Repeat Visitor)**
```
Returning Customer → Scans QR → Auto-Recognized → Personalized Experience
```
**Personalization:**
- Welcome message with name
- Favorite items highlighted
- Order history quick-reorder
- Loyalty tier badge display
- Personalized recommendations
- Exclusive menu items (if applicable)

---

## 📱 Feature Implementation Priority

### **MVP (Minimum Viable Product):**
1. ✅ QR scan → Session start
2. ✅ Public menu browsing
3. ✅ Order placement
4. ✅ Order status tracking
5. ✅ Basic payment flow

**Effort:** Low | **Value:** High | **Required for launch:** YES

---

### **Phase 2 (Enhanced Experience):**
6. ⭐ Customer account creation
7. ⭐ Order history
8. ⭐ Feedback submission
9. ⭐ Loyalty points display

**Effort:** Medium | **Value:** High | **Retention impact:** HIGH

---

### **Phase 3 (Engagement & Retention):**
10. 🚀 Telegram integration
11. 🚀 Favorite items
12. 🚀 Reorder functionality
13. 🚀 Push notifications

**Effort:** Medium | **Value:** Medium | **Engagement boost:** HIGH

---

### **Phase 4 (Personalization):**
14. 🎯 Dietary preferences
15. 🎯 Smart recommendations
16. 🎯 Personalized offers
17. 🎯 Birthday rewards

**Effort:** High | **Value:** Medium | **Long-term retention:** HIGH

---

## 🎨 UI Components Needed

### **Core Components:**
```
✓ QR Scanner Screen
✓ Session Loading Screen
✓ Menu Grid/List View
✓ Menu Item Detail Modal
✓ Cart/Basket Component
✓ Order Confirmation Screen
✓ Order Tracking Screen
✓ Payment Screen
```

### **Account Components:**
```
□ Signup/Login Modal
□ Profile Screen
□ Order History List
□ Order Detail View (from history)
□ Loyalty Points Display
□ Telegram Connection Screen
```

### **Feedback Components:**
```
□ Feedback Modal/Screen
□ Star Rating Widget
□ Category Selector (chips)
□ Photo Upload Component
□ Item-by-Item Rating View
```

### **Common Components:**
```
✓ Navigation Bar
✓ Error Messages
✓ Loading Spinners
✓ Empty States
✓ Success Confirmations
□ Bottom Sheet/Drawer
□ Toast Notifications
```

---

## 🔐 Authentication & Security

### **Session Token (Table QR):**
```
Source: QR scan verification
Lifespan: 2 hours or until table freed
Scope: Public menu, order placement, order tracking
Storage: localStorage/sessionStorage
```

### **Customer Token (Account Login):**
```
Source: POST /customers/login
Lifespan: Extended (30 days)
Scope: All customer features + session features
Storage: localStorage (with refresh token)
```

### **Security Best Practices:**
```
✓ HTTPS only
✓ HMAC signature validation on QR
✓ Session expiry checks
✓ Rate limiting on API calls
✓ XSS protection (sanitize inputs)
✓ CSRF tokens for state-changing operations
✓ Secure token storage (not in cookies without HttpOnly)
```

---

## 📊 Analytics Events to Track

### **Session Events:**
```javascript
- qr_scanned { merchantId, branchId, tableId }
- session_started { sessionId, tableNumber }
- menu_viewed { sessionId }
- menu_item_clicked { itemId, itemName }
```

### **Order Events:**
```javascript
- order_placed { orderId, total, itemCount }
- order_status_changed { orderId, status }
- payment_completed { orderId, total, paymentMethod }
```

### **Account Events:**
```javascript
- account_created { customerId, source }
- telegram_connected { customerId }
- order_history_viewed { customerId }
- reorder_clicked { originalOrderId }
```

### **Feedback Events:**
```javascript
- feedback_submitted { feedbackId, rating, orderId }
- feedback_with_photo { feedbackId }
- item_feedback_submitted { itemId, rating }
```

### **Engagement Metrics:**
```javascript
- session_duration (track time on app)
- menu_browse_depth (items viewed)
- cart_abandonment (items added but not ordered)
- repeat_customer_rate (orders per customer)
- telegram_notification_click_rate
```

---

## 🎁 Customer Rewards Flow

### **Points Earning:**
```
Order Completed: +10 points per $1 spent
Feedback Submitted: +50 bonus points
Telegram Connected: +100 bonus points
Birthday Month: 2× points multiplier
Refer a Friend: +500 points (when friend orders)
```

### **Points Redemption:**
```
100 points = $1 discount
500 points = Free appetizer
1000 points = 10% off entire order
2000 points = Free main course
```

### **Tier System:**
```
Bronze: 0-999 points (default)
Silver: 1000-2999 points (+5% discount)
Gold: 3000-9999 points (+10% discount + priority support)
Platinum: 10000+ points (+15% discount + exclusive menu access)
```

---

## 🌐 Telegram Bot Features

### **Bot Commands:**
```
/start - Link account
/orders - View current orders
/history - View order history
/menu - Browse menu
/loyalty - Check points and tier
/feedback - Submit feedback
/help - Get support
```

### **Auto Notifications:**
```
✓ Order received
✓ Order accepted by kitchen
✓ Food is being prepared
✓ Food ready for serving
✓ Order completed
✓ Loyalty points earned
✓ New promotion available
✓ Reservation reminder
```

### **Interactive Features:**
```
□ Inline menu browsing
□ Quick reorder buttons
□ Feedback rating buttons
□ Table reservation booking
□ Direct chat with restaurant
```

---

## 🚀 Quick Integration Checklist

### **Backend:**
- [x] Session management endpoints
- [x] Public menu API
- [x] Order placement API
- [x] Customer account API
- [x] Order history API
- [x] Feedback API
- [ ] Telegram bot webhook
- [ ] Loyalty points calculation
- [ ] Notification service

### **Frontend:**
- [ ] QR scanner integration
- [ ] Session token management
- [ ] Menu display with images
- [ ] Cart and checkout flow
- [ ] Order tracking screen
- [ ] Account signup/login
- [ ] Telegram connection UI
- [ ] Order history view
- [ ] Feedback submission form
- [ ] Loyalty points display

### **Testing:**
- [ ] QR scan to order flow (end-to-end)
- [ ] Account creation and login
- [ ] Order history accuracy
- [ ] Feedback submission
- [ ] Telegram bot connection
- [ ] Loyalty points calculation
- [ ] Session expiry handling
- [ ] Error states and fallbacks

---

## 💡 Best Practices

### **User Experience:**
1. **Minimize friction:** One-tap QR scan should get to menu in <2 seconds
2. **Progressive disclosure:** Don't overwhelm guests with account signup
3. **Clear value props:** Explain benefits before asking for information
4. **Smart defaults:** Pre-fill customer data from previous orders
5. **Graceful degradation:** All core features work without account

### **Performance:**
1. **Lazy load images:** Load menu images as user scrolls
2. **Cache menu data:** Reduce API calls for repeat views
3. **Optimistic UI:** Show feedback immediately, sync in background
4. **Polling strategy:** Use exponential backoff for order status
5. **Bundle splitting:** Load account features only when needed

### **Accessibility:**
1. **Screen reader support:** Proper ARIA labels
2. **Keyboard navigation:** Tab through all interactive elements
3. **Color contrast:** WCAG AA compliance minimum
4. **Font sizing:** Readable on small screens
5. **Error messages:** Clear, actionable error text

---

**Next Steps:** Choose your implementation phase and start with the MVP features!
