/**
 * Order Receipt Email Template
 * 
 * Generates HTML email for order confirmations/receipts
 * @param {Object} data - Order data for receipt
 * @param {string} data.orderNumber - Order number/ID
 * @param {Array} data.items - Array of order items
 * @param {string} data.items[].name - Item name
 * @param {number} data.items[].quantity - Item quantity
 * @param {number} data.items[].unitPrice - Price per unit
 * @param {number} data.items[].total - Item total
 * @param {number} data.subtotal - Subtotal amount
 * @param {number} data.taxAmount - Tax amount
 * @param {number} data.discountAmount - Discount amount
 * @param {number} data.deliveryFee - Delivery fee
 * @param {number} data.totalAmount - Total amount
 * @param {string} data.paymentMethod - Payment method
 * @param {string} data.timestamp - Order timestamp
 * @param {string} data.customerName - Customer name (optional)
 * @param {string} data.merchantName - Merchant/Restaurant name
 * @param {string} data.branchName - Branch name (optional)
 */
module.exports = (data) => {
  const {
    orderNumber,
    items = [],
    subtotal = 0,
    taxAmount = 0,
    discountAmount = 0,
    deliveryFee = 0,
    totalAmount = 0,
    paymentMethod = 'N/A',
    timestamp,
    customerName,
    merchantName = 'Mesob Foods',
    branchName,
  } = data;

  // Format currency
  const formatCurrency = (amount) => {
    return typeof amount === 'number' ? amount.toFixed(2) : '0.00';
  };

  // Format date
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return dateString || 'N/A';
    }
  };

  // Generate items HTML
  const itemsHtml = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">
        ${item.name || 'Unknown Item'}
      </td>
      <td style="padding: 12px 8px; border-bottom: 1px solid #eee; text-align: center;">
        ${item.quantity || 0}
      </td>
      <td style="padding: 12px 8px; border-bottom: 1px solid #eee; text-align: right;">
        $${formatCurrency(item.unitPrice)}
      </td>
      <td style="padding: 12px 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">
        $${formatCurrency(item.total)}
      </td>
    </tr>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Receipt - ${orderNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1A1A2E 0%, #2E2E3E 100%); color: white; padding: 30px 20px; text-align: center;">
      <h1 style="margin: 0 0 10px 0; font-size: 28px; font-weight: bold;">Order Confirmation</h1>
      <p style="margin: 0; font-size: 14px; opacity: 0.9;">Thank you for your order!</p>
    </div>

    <!-- Order Info Section -->
    <div style="padding: 30px 20px; background-color: #f9f9f9; border-bottom: 1px solid #e0e0e0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0;">
            <strong style="color: #333;">Order Number:</strong>
            <div style="font-size: 18px; color: #1A1A2E; font-weight: 600; margin-top: 4px;">
              ${orderNumber}
            </div>
          </td>
          <td style="padding: 8px 0; text-align: right;">
            <strong style="color: #333;">Date:</strong>
            <div style="font-size: 14px; color: #666; margin-top: 4px;">
              ${formatDate(timestamp)}
            </div>
          </td>
        </tr>
      </table>
      
      ${customerName ? `
      <div style="margin-top: 15px;">
        <strong style="color: #333;">Customer:</strong>
        <span style="color: #666; margin-left: 8px;">${customerName}</span>
      </div>
      ` : ''}
      
      <div style="margin-top: 10px;">
        <strong style="color: #333;">Restaurant:</strong>
        <span style="color: #666; margin-left: 8px;">
          ${merchantName}${branchName ? ` - ${branchName}` : ''}
        </span>
      </div>
      
      <div style="margin-top: 10px;">
        <strong style="color: #333;">Payment Method:</strong>
        <span style="color: #666; margin-left: 8px;">${paymentMethod}</span>
      </div>
    </div>

    <!-- Order Items Section -->
    <div style="padding: 30px 20px;">
      <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #1A1A2E; border-bottom: 2px solid #1A1A2E; padding-bottom: 10px;">
        Order Details
      </h2>
      
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f0f0f0;">
            <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #333; border-bottom: 2px solid #ddd;">
              Item
            </th>
            <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #333; border-bottom: 2px solid #ddd;">
              Qty
            </th>
            <th style="padding: 12px 8px; text-align: right; font-weight: 600; color: #333; border-bottom: 2px solid #ddd;">
              Price
            </th>
            <th style="padding: 12px 8px; text-align: right; font-weight: 600; color: #333; border-bottom: 2px solid #ddd;">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>

    <!-- Order Summary Section -->
    <div style="padding: 20px; background-color: #f9f9f9; border-top: 1px solid #e0e0e0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;">Subtotal:</td>
          <td style="padding: 8px 0; text-align: right; color: #333;">$${formatCurrency(subtotal)}</td>
        </tr>
        
        ${discountAmount > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #28a745;">Discount:</td>
          <td style="padding: 8px 0; text-align: right; color: #28a745;">-$${formatCurrency(discountAmount)}</td>
        </tr>
        ` : ''}
        
        ${taxAmount > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #666;">Tax:</td>
          <td style="padding: 8px 0; text-align: right; color: #333;">$${formatCurrency(taxAmount)}</td>
        </tr>
        ` : ''}
        
        ${deliveryFee > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #666;">Delivery Fee:</td>
          <td style="padding: 8px 0; text-align: right; color: #333;">$${formatCurrency(deliveryFee)}</td>
        </tr>
        ` : ''}
        
        <tr style="border-top: 2px solid #1A1A2E;">
          <td style="padding: 15px 0 0 0; font-size: 18px; font-weight: bold; color: #1A1A2E;">
            Total:
          </td>
          <td style="padding: 15px 0 0 0; text-align: right; font-size: 22px; font-weight: bold; color: #1A1A2E;">
            $${formatCurrency(totalAmount)}
          </td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="padding: 20px; text-align: center; background-color: #f0f0f0; border-top: 1px solid #e0e0e0;">
      <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">
        Thank you for choosing ${merchantName}!
      </p>
      <p style="margin: 0; color: #999; font-size: 12px;">
        This is an automated receipt. Please do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>
`;
};
