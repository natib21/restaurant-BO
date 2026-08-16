# Mailer Service Documentation

## Overview

The Mailer Service extends the existing basic email utility (`utils/email.js`) with support for HTML templates and specialized email types, including order receipts and status updates.

## Task 16.1 Implementation Summary

**What was implemented:**

1. **Order Receipt Email Template** (`utils/emailTemplates/orderReceipt.js`)
   - Professional HTML email template for order confirmations
   - Responsive design with gradient header
   - Itemized order breakdown with quantities and prices
   - Comprehensive summary section (subtotal, taxes, discounts, delivery fees)
   - Plain text fallback for non-HTML email clients

2. **Enhanced Mailer Service** (`utils/mailerService.js`)
   - `sendOrderReceipt(customerEmail, orderData)` - Send order receipt emails
   - `sendOrderStatusUpdate(customerEmail, statusData)` - Send order status updates
   - `sendEmail(options)` - Base email sending function
   - Comprehensive error handling and logging
   - Follows existing codebase patterns

3. **Test Suite** (`tests/mailerService.test.js`)
   - Full test coverage for all mailer service functions
   - Tests for success cases, error handling, and edge cases
   - Mock implementation for nodemailer

## Architecture

```
┌─────────────────────────────────────────────────────┐
│           Mailer Service (New)                      │
│                                                     │
│  ┌────────────────────────────────────────────┐   │
│  │  sendOrderReceipt(email, orderData)        │   │
│  │  sendOrderStatusUpdate(email, statusData)  │   │
│  │  sendEmail(options)                        │   │
│  └────────────────────────────────────────────┘   │
│                      ▼                              │
│  ┌────────────────────────────────────────────┐   │
│  │      Email Templates                       │   │
│  │  - orderReceipt.js (HTML generator)        │   │
│  └────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│           NodeMailer (Existing)                     │
│  - SMTP Transport Configuration                    │
│  - Email Delivery                                   │
└─────────────────────────────────────────────────────┘
```

## Usage

### 1. Sending Order Receipt Emails

```javascript
const { sendOrderReceipt } = require('../utils/mailerService');

// Example: Send receipt after order payment
const orderData = {
  orderNumber: order._id.toString(),
  items: order.items.map(item => ({
    name: item.menuItemId.name,
    quantity: item.quantity,
    unitPrice: item.price,
    total: item.total
  })),
  subtotal: order.items.reduce((sum, item) => sum + item.total, 0),
  taxAmount: order.taxAmount || 0,
  discountAmount: order.discountAmount || 0,
  deliveryFee: order.deliveryFee || 0,
  totalAmount: order.totalAmount,
  paymentMethod: order.paymentDetails?.method || 'N/A',
  timestamp: order.placedAt,
  customerName: order.customer?.name,
  merchantName: merchant.businessName,
  branchName: branch.name
};

try {
  await sendOrderReceipt(customer.email, orderData);
  console.log('Order receipt sent successfully');
} catch (error) {
  console.error('Failed to send order receipt:', error.message);
  // Don't block order processing - just log the error
}
```

### 2. Sending Order Status Updates

```javascript
const { sendOrderStatusUpdate } = require('../utils/mailerService');

// Example: Notify customer when order is ready
const statusData = {
  orderNumber: order._id.toString(),
  status: 'Ready',
  message: 'Your order is ready for pickup!'
};

try {
  await sendOrderStatusUpdate(customer.email, statusData);
  console.log('Status update sent successfully');
} catch (error) {
  console.error('Failed to send status update:', error.message);
}
```

### 3. Integration Example - Order Service

Here's how to integrate the mailer service into the order workflow:

```javascript
// In OrderService or OrderStateMachineService

const { sendOrderReceipt, sendOrderStatusUpdate } = require('../../utils/mailerService');

class OrderService {
  // After order is paid
  async handlePaymentSuccess(orderId) {
    const order = await Order.findById(orderId)
      .populate('customer')
      .populate('merchant')
      .populate('branch')
      .populate('items.menuItemId');
    
    order.paymentStatus = 'paid';
    await order.save();
    
    // Send receipt email if customer has email
    if (order.customer?.email) {
      try {
        await sendOrderReceipt(order.customer.email, {
          orderNumber: order._id.toString(),
          items: order.items.map(item => ({
            name: item.menuItemId.name,
            quantity: item.quantity,
            unitPrice: item.price,
            total: item.total
          })),
          subtotal: order.items.reduce((sum, item) => sum + item.total, 0),
          taxAmount: order.taxAmount || 0,
          discountAmount: order.discountAmount || 0,
          deliveryFee: order.deliveryFee || 0,
          totalAmount: order.totalAmount,
          paymentMethod: order.paymentDetails?.method || 'Cash',
          timestamp: order.placedAt,
          customerName: order.customer.name,
          merchantName: order.merchant.businessName,
          branchName: order.branch?.name
        });
      } catch (error) {
        // Log but don't throw - email failure shouldn't block order processing
        console.error('Failed to send order receipt:', error);
      }
    }
    
    return order;
  }
  
  // When order status changes to 'ready'
  async markOrderReady(orderId) {
    const order = await Order.findById(orderId).populate('customer');
    
    order.status = 'ready';
    order.readyAt = new Date();
    await order.save();
    
    // Send status update email if customer has email
    if (order.customer?.email) {
      try {
        await sendOrderStatusUpdate(order.customer.email, {
          orderNumber: order._id.toString(),
          status: 'Ready',
          message: 'Your order is ready for pickup!'
        });
      } catch (error) {
        console.error('Failed to send status update:', error);
      }
    }
    
    return order;
  }
}
```

## Configuration

The mailer service uses the following environment variables (same as existing email utility):

```env
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USERNAME=your-email@example.com
EMAIL_PASSWORD=your-password
EMAIL_FROM=Your Restaurant <noreply@example.com>
```

## Error Handling

The mailer service follows these error handling principles:

1. **Validation Errors**: Throw immediately if required parameters are missing
   ```javascript
   if (!customerEmail) {
     throw new Error('Customer email is required');
   }
   ```

2. **SMTP Errors**: Throw and let caller handle (with logging)
   ```javascript
   try {
     await sendOrderReceipt(email, data);
   } catch (error) {
     logger.error('Email send failed', { error: error.message });
     // Don't block order processing
   }
   ```

3. **Non-Blocking**: Email failures should **never** block order processing
   - Always wrap email sends in try-catch
   - Log errors but don't throw to caller
   - Email is supplementary, not critical

## Logging

The service logs all email operations:

**Success:**
```
INFO Email sent successfully
  to: customer@example.com
  subject: Order Confirmation - ORD-12345
  messageId: <abc123@mail.example.com>
```

**Failure:**
```
ERROR Email send failed
  to: customer@example.com
  subject: Order Confirmation - ORD-12345
  error: Connection timeout
```

## Testing

Run the test suite:

```bash
npm test -- tests/mailerService.test.js
```

**Test Coverage:**
- ✅ Send order receipt with valid data
- ✅ Handle missing customer email
- ✅ Handle missing order number
- ✅ Handle orders with no discounts/fees
- ✅ Handle SMTP failures
- ✅ Send order status updates
- ✅ Validate status update data

## File Structure

```
restaurant-BO/
├── utils/
│   ├── email.js                    # Existing basic email utility (untouched)
│   ├── mailerService.js            # NEW: Enhanced mailer service
│   └── emailTemplates/
│       ├── orderReceipt.js         # NEW: Order receipt HTML template
│       └── README.md               # NEW: Template documentation
├── tests/
│   └── mailerService.test.js       # NEW: Test suite
└── MAILER-SERVICE-DOCUMENTATION.md # NEW: This file
```

## Future Enhancements

Potential improvements for future iterations:

1. **Additional Templates**
   - Refund confirmation email
   - Order cancellation email
   - Delivery tracking updates
   - Welcome/registration emails

2. **Email Queuing**
   - Implement email queue for better reliability
   - Retry failed emails automatically
   - Rate limiting for bulk sends

3. **Analytics**
   - Track email open rates
   - Track link clicks
   - Delivery status tracking

4. **Personalization**
   - Customer preferences (email frequency, language)
   - Template customization per merchant
   - A/B testing for email templates

5. **Internationalization**
   - Multi-language support
   - Locale-specific formatting
   - Currency conversion

## Requirements Fulfilled

This implementation fulfills **Requirements 16.1 and 16.3** from the Advanced Reporting spec:

✅ **Requirement 16.1**: Email Receipt Notifications
- Extended existing mailer service without new infrastructure
- Created order receipt email template with all required fields
- Implemented proper error handling and logging

✅ **Requirement 16.3**: Order receipt email includes:
- Order number
- Items list with quantities and prices
- Taxes, discounts, delivery fees
- Total amount
- Payment method
- Timestamp

## Notes

- The existing `utils/email.js` remains unchanged and continues to work for password reset emails
- The new mailer service is a **superset** of the existing functionality
- All email operations are logged for troubleshooting
- Email failures never block order processing (fail gracefully)
- Tests use mocked nodemailer to avoid actual SMTP calls

## Support

For questions or issues:
1. Check the test suite for usage examples
2. Review error logs in `logs/error.log`
3. Verify SMTP configuration in environment variables
4. Test email sending manually using the basic `sendEmail` function first
