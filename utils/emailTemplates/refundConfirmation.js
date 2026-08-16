/**
 * Refund Confirmation Email Template
 * 
 * Sends refund notification to customers when their order is refunded.
 * 
 * Requirements: 16.5
 */

/**
 * Generates HTML email template for refund confirmation
 * 
 * @param {Object} refundData - Refund details
 * @param {string} refundData.customerName - Customer's name
 * @param {string} refundData.orderNumber - Order reference number
 * @param {number} refundData.refundAmount - Amount refunded
 * @param {string} refundData.currency - Currency code (e.g., 'USD')
 * @param {string} refundData.refundReason - Reason for refund
 * @param {string} refundData.refundMethod - Method of refund (e.g., 'original payment method')
 * @param {Date} refundData.refundDate - Date of refund
 * @param {string} refundData.merchantName - Merchant/restaurant name
 * @param {string} refundData.supportEmail - Support contact email
 * @returns {string} HTML email content
 */
function generateRefundConfirmationEmail(refundData) {
  const {
    customerName,
    orderNumber,
    refundAmount,
    currency = 'USD',
    refundReason,
    refundMethod,
    refundDate,
    merchantName,
    supportEmail
  } = refundData;

  const formattedDate = new Date(refundDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(refundAmount);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Refund Confirmation</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .content {
      padding: 30px 20px;
    }
    .refund-box {
      background: #f8f9fa;
      border-left: 4px solid #667eea;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .refund-amount {
      font-size: 32px;
      font-weight: bold;
      color: #667eea;
      margin: 10px 0;
    }
    .details-table {
      width: 100%;
      margin: 20px 0;
      border-collapse: collapse;
    }
    .details-table td {
      padding: 10px;
      border-bottom: 1px solid #e0e0e0;
    }
    .details-table td:first-child {
      font-weight: bold;
      color: #666;
      width: 40%;
    }
    .reason-box {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .reason-box strong {
      display: block;
      margin-bottom: 5px;
      color: #856404;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px;
      text-align: center;
      font-size: 14px;
      color: #666;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
    .note {
      background: #e7f3ff;
      border-left: 4px solid #2196f3;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💰 Refund Confirmation</h1>
    </div>
    
    <div class="content">
      <p>Dear ${customerName},</p>
      
      <p>Your refund has been processed successfully. The details of your refund are below:</p>
      
      <div class="refund-box">
        <div style="color: #666; font-size: 14px;">Refund Amount</div>
        <div class="refund-amount">${formattedAmount}</div>
        <div style="color: #666; font-size: 14px; margin-top: 5px;">
          For Order #${orderNumber}
        </div>
      </div>
      
      <table class="details-table">
        <tr>
          <td>Order Number:</td>
          <td>#${orderNumber}</td>
        </tr>
        <tr>
          <td>Refund Date:</td>
          <td>${formattedDate}</td>
        </tr>
        <tr>
          <td>Refund Method:</td>
          <td>${refundMethod}</td>
        </tr>
        <tr>
          <td>Amount Refunded:</td>
          <td>${formattedAmount}</td>
        </tr>
      </table>
      
      <div class="reason-box">
        <strong>Refund Reason:</strong>
        ${refundReason}
      </div>
      
      <div class="note">
        <strong>ℹ️ Important Information:</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>Refunds typically appear within 5-10 business days depending on your bank or card issuer</li>
          <li>You will see the credit from <strong>${merchantName}</strong> on your statement</li>
          <li>If you don't see the refund after 10 business days, please contact your bank</li>
        </ul>
      </div>
      
      <p>We apologize for any inconvenience. If you have any questions about this refund, please don't hesitate to contact us.</p>
      
      <p>Thank you for your understanding.</p>
      
      <p>Best regards,<br>
      <strong>${merchantName}</strong></p>
    </div>
    
    <div class="footer">
      <p>Need help? Contact us at <a href="mailto:${supportEmail}">${supportEmail}</a></p>
      <p style="margin-top: 10px; font-size: 12px; color: #999;">
        This is an automated message. Please do not reply directly to this email.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generates plain text version of refund confirmation email
 * 
 * @param {Object} refundData - Refund details
 * @returns {string} Plain text email content
 */
function generateRefundConfirmationText(refundData) {
  const {
    customerName,
    orderNumber,
    refundAmount,
    currency = 'USD',
    refundReason,
    refundMethod,
    refundDate,
    merchantName,
    supportEmail
  } = refundData;

  const formattedDate = new Date(refundDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(refundAmount);

  return `
REFUND CONFIRMATION
===================

Dear ${customerName},

Your refund has been processed successfully.

REFUND DETAILS
--------------
Order Number: #${orderNumber}
Refund Amount: ${formattedAmount}
Refund Date: ${formattedDate}
Refund Method: ${refundMethod}

REFUND REASON
-------------
${refundReason}

IMPORTANT INFORMATION
--------------------
- Refunds typically appear within 5-10 business days depending on your bank or card issuer
- You will see the credit from ${merchantName} on your statement
- If you don't see the refund after 10 business days, please contact your bank

We apologize for any inconvenience. If you have any questions about this refund, 
please don't hesitate to contact us.

Thank you for your understanding.

Best regards,
${merchantName}

---
Need help? Contact us at ${supportEmail}
This is an automated message. Please do not reply directly to this email.
  `.trim();
}

module.exports = {
  generateRefundConfirmationEmail,
  generateRefundConfirmationText
};
