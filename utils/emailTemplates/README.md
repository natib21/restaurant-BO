# Email Templates

This directory contains HTML email templates for various notification types.

## Available Templates

### 1. Order Receipt Template (`orderReceipt.js`)

Professional HTML email template for order confirmations and receipts.

**Features:**
- Responsive design optimized for all email clients
- Professional gradient header
- Itemized order breakdown with quantities and prices
- Comprehensive order summary (subtotal, taxes, discounts, delivery fees)
- Payment method and timestamp information
- Plain text fallback for non-HTML email clients

**Usage:**

```javascript
const orderReceiptTemplate = require('./emailTemplates/orderReceipt');

const htmlContent = orderReceiptTemplate({
  orderNumber: 'ORD-12345',
  items: [
    {
      name: 'Pizza Margherita',
      quantity: 2,
      unitPrice: 12.99,
      total: 25.98
    },
    {
      name: 'Coca Cola',
      quantity: 1,
      unitPrice: 2.50,
      total: 2.50
    }
  ],
  subtotal: 28.48,
  taxAmount: 2.28,
  discountAmount: 0,
  deliveryFee: 3.50,
  totalAmount: 34.26,
  paymentMethod: 'Credit Card',
  timestamp: new Date(),
  customerName: 'John Doe',
  merchantName: 'Mesob Foods',
  branchName: 'Downtown Branch'
});
```

## Adding New Templates

To add a new email template:

1. Create a new `.js` file in this directory
2. Export a function that accepts data and returns HTML string
3. Include proper JSDoc comments documenting parameters
4. Follow the existing template structure for consistency
5. Update this README with usage examples

## Template Best Practices

- Use inline CSS styles (external stylesheets don't work in most email clients)
- Keep layout simple and table-based for compatibility
- Include both HTML and plain text versions
- Test templates across multiple email clients
- Use responsive design principles (max-width, padding, etc.)
- Avoid JavaScript (not supported in email clients)
- Use web-safe fonts (Arial, Helvetica, sans-serif, etc.)
- Keep file sizes small (under 100KB recommended)
