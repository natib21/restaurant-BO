/**
 * Mailer Service
 * 
 * Enhanced email service that extends the basic sendEmail utility
 * with support for HTML templates and specialized email types
 */

const nodeMailer = require('nodemailer');
const orderReceiptTemplate = require('./emailTemplates/orderReceipt');
const {
  generateRefundConfirmationEmail,
  generateRefundConfirmationText
} = require('./emailTemplates/refundConfirmation');
const logger = require('./logger');

/**
 * Create email transporter (reusable across all methods)
 */
const createTransporter = () => {
  return nodeMailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

/**
 * Base email sending function
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content (optional)
 * @param {string} options.html - HTML content (optional)
 * @returns {Promise<Object>} Email send result
 */
const sendEmail = async (options) => {
  try {
    const transport = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'Mesob Foods <hello@mesob.io>',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    const result = await transport.sendMail(mailOptions);
    
    // Log successful email send
    logger.info('Email sent successfully', {
      to: options.to,
      subject: options.subject,
      messageId: result.messageId,
    });

    return result;
  } catch (error) {
    // Log email send failure
    logger.error('Email send failed', {
      to: options.to,
      subject: options.subject,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Send order receipt email to customer
 * 
 * @param {string} customerEmail - Customer's email address
 * @param {Object} orderData - Order data for receipt
 * @param {string} orderData.orderNumber - Order number/ID
 * @param {Array} orderData.items - Array of order items
 * @param {Object} orderData.items[] - Order item details
 * @param {string} orderData.items[].name - Item name
 * @param {number} orderData.items[].quantity - Item quantity
 * @param {number} orderData.items[].unitPrice - Price per unit
 * @param {number} orderData.items[].total - Item total
 * @param {number} orderData.subtotal - Subtotal before fees/taxes
 * @param {number} orderData.taxAmount - Tax amount
 * @param {number} orderData.discountAmount - Discount amount
 * @param {number} orderData.deliveryFee - Delivery fee
 * @param {number} orderData.totalAmount - Final total amount
 * @param {string} orderData.paymentMethod - Payment method used
 * @param {string|Date} orderData.timestamp - Order timestamp
 * @param {string} orderData.customerName - Customer name (optional)
 * @param {string} orderData.merchantName - Merchant/Restaurant name (optional)
 * @param {string} orderData.branchName - Branch name (optional)
 * 
 * @returns {Promise<Object>} Email send result
 * 
 * @example
 * await sendOrderReceipt('customer@example.com', {
 *   orderNumber: 'ORD-12345',
 *   items: [
 *     { name: 'Pizza Margherita', quantity: 2, unitPrice: 12.99, total: 25.98 },
 *     { name: 'Coca Cola', quantity: 1, unitPrice: 2.50, total: 2.50 }
 *   ],
 *   subtotal: 28.48,
 *   taxAmount: 2.28,
 *   discountAmount: 0,
 *   deliveryFee: 3.50,
 *   totalAmount: 34.26,
 *   paymentMethod: 'Credit Card',
 *   timestamp: new Date(),
 *   customerName: 'John Doe',
 *   merchantName: 'Mesob Foods',
 *   branchName: 'Downtown Branch'
 * });
 */
const sendOrderReceipt = async (customerEmail, orderData) => {
  if (!customerEmail) {
    throw new Error('Customer email is required');
  }

  if (!orderData || !orderData.orderNumber) {
    throw new Error('Order data with orderNumber is required');
  }

  try {
    // Generate HTML from template
    const htmlContent = orderReceiptTemplate(orderData);

    // Generate plain text fallback
    const textContent = generatePlainTextReceipt(orderData);

    // Send email
    const result = await sendEmail({
      to: customerEmail,
      subject: `Order Confirmation - ${orderData.orderNumber}`,
      text: textContent,
      html: htmlContent,
    });

    logger.info('Order receipt email sent', {
      customerEmail,
      orderNumber: orderData.orderNumber,
      totalAmount: orderData.totalAmount,
    });

    return result;
  } catch (error) {
    logger.error('Failed to send order receipt email', {
      customerEmail,
      orderNumber: orderData.orderNumber,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Generate plain text version of order receipt (fallback for non-HTML email clients)
 * @param {Object} orderData - Order data
 * @returns {string} Plain text receipt
 */
const generatePlainTextReceipt = (orderData) => {
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
  } = orderData;

  const formatCurrency = (amount) => {
    return typeof amount === 'number' ? amount.toFixed(2) : '0.00';
  };

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

  let text = `
========================================
       ORDER CONFIRMATION
========================================

Order Number: ${orderNumber}
Date: ${formatDate(timestamp)}
${customerName ? `Customer: ${customerName}\n` : ''}Restaurant: ${merchantName}${branchName ? ` - ${branchName}` : ''}
Payment Method: ${paymentMethod}

========================================
       ORDER DETAILS
========================================

`;

  // Add items
  items.forEach((item) => {
    text += `${item.name || 'Unknown Item'}\n`;
    text += `  Qty: ${item.quantity || 0} x $${formatCurrency(item.unitPrice)} = $${formatCurrency(item.total)}\n\n`;
  });

  // Add summary
  text += `========================================
       ORDER SUMMARY
========================================

Subtotal:        $${formatCurrency(subtotal)}
`;

  if (discountAmount > 0) {
    text += `Discount:        -$${formatCurrency(discountAmount)}\n`;
  }

  if (taxAmount > 0) {
    text += `Tax:             $${formatCurrency(taxAmount)}\n`;
  }

  if (deliveryFee > 0) {
    text += `Delivery Fee:    $${formatCurrency(deliveryFee)}\n`;
  }

  text += `
----------------------------------------
TOTAL:           $${formatCurrency(totalAmount)}
========================================

Thank you for choosing ${merchantName}!

This is an automated receipt.
Please do not reply to this email.
`;

  return text;
};

/**
 * Send order status update email
 * @param {string} customerEmail - Customer's email
 * @param {Object} statusData - Status update data
 * @param {string} statusData.orderNumber - Order number
 * @param {string} statusData.status - New status
 * @param {string} statusData.message - Status message
 * @returns {Promise<Object>} Email send result
 */
const sendOrderStatusUpdate = async (customerEmail, statusData) => {
  if (!customerEmail || !statusData || !statusData.orderNumber) {
    throw new Error('Customer email and order data are required');
  }

  try {
    const { orderNumber, status, message } = statusData;

    const htmlContent = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1A1A2E 0%, #2E2E3E 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="margin: 0;">Order Status Update</h1>
  </div>
  <div style="padding: 30px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; color: #333;">Your order <strong>${orderNumber}</strong> has been updated:</p>
    <div style="background-color: #f0f0f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0; font-size: 18px; font-weight: bold; color: #1A1A2E;">Status: ${status}</p>
      ${message ? `<p style="margin: 10px 0 0 0; color: #666;">${message}</p>` : ''}
    </div>
    <p style="color: #666;">Thank you for your patience!</p>
  </div>
</body>
</html>
    `;

    const textContent = `
Order Status Update

Your order ${orderNumber} has been updated:
Status: ${status}
${message ? `\n${message}` : ''}

Thank you for your patience!
    `;

    const result = await sendEmail({
      to: customerEmail,
      subject: `Order ${orderNumber} - Status Update`,
      text: textContent,
      html: htmlContent,
    });

    logger.info('Order status update email sent', {
      customerEmail,
      orderNumber,
      status,
    });

    return result;
  } catch (error) {
    logger.error('Failed to send order status update email', {
      customerEmail,
      orderNumber: statusData.orderNumber,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Send refund confirmation email to customer
 * 
 * Requirements: 16.5
 * Note: This is a Phase 3 dependency - hook will be added when refund system is implemented
 * 
 * @param {string} customerEmail - Customer's email address
 * @param {Object} refundData - Refund data
 * @param {string} refundData.customerName - Customer's name
 * @param {string} refundData.orderNumber - Order number
 * @param {number} refundData.refundAmount - Amount refunded
 * @param {string} refundData.currency - Currency code (default: 'USD')
 * @param {string} refundData.refundReason - Reason for refund
 * @param {string} refundData.refundMethod - Method of refund
 * @param {Date|string} refundData.refundDate - Date of refund
 * @param {string} refundData.merchantName - Merchant/restaurant name
 * @param {string} refundData.supportEmail - Support contact email
 * @returns {Promise<Object>} Email send result
 * 
 * @example
 * await sendRefundConfirmation('customer@example.com', {
 *   customerName: 'John Doe',
 *   orderNumber: 'ORD-12345',
 *   refundAmount: 34.26,
 *   currency: 'USD',
 *   refundReason: 'Order cancelled by customer request',
 *   refundMethod: 'Original payment method (Visa ending in 1234)',
 *   refundDate: new Date(),
 *   merchantName: 'Mesob Foods',
 *   supportEmail: 'support@mesob.io'
 * });
 */
const sendRefundConfirmation = async (customerEmail, refundData) => {
  if (!customerEmail) {
    throw new Error('Customer email is required');
  }

  if (!refundData || !refundData.orderNumber || !refundData.refundAmount) {
    throw new Error('Refund data with orderNumber and refundAmount is required');
  }

  try {
    // Generate HTML from template
    const htmlContent = generateRefundConfirmationEmail(refundData);

    // Generate plain text fallback
    const textContent = generateRefundConfirmationText(refundData);

    // Send email
    const result = await sendEmail({
      to: customerEmail,
      subject: `Refund Confirmation - Order ${refundData.orderNumber}`,
      text: textContent,
      html: htmlContent,
    });

    logger.info('Refund confirmation email sent', {
      customerEmail,
      orderNumber: refundData.orderNumber,
      refundAmount: refundData.refundAmount,
    });

    return result;
  } catch (error) {
    logger.error('Failed to send refund confirmation email', {
      customerEmail,
      orderNumber: refundData.orderNumber,
      error: error.message,
    });
    throw error;
  }
};

module.exports = {
  sendEmail,
  sendOrderReceipt,
  sendOrderStatusUpdate,
  sendRefundConfirmation,
};
