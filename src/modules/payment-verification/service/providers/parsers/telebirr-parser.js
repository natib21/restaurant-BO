const cheerio = require('cheerio');
const logger = require('../../../../../../utils/logger');

/**
 * ⚠️ PLACEHOLDER SELECTORS - MUST BE UPDATED WITH REAL HTML STRUCTURE
 * 
 * These selectors are placeholders and need to be tested against actual HTML from:
 * https://transactioninfo.ethiotelecom.et/receipt/{receiptNumber}
 * 
 * Source: tests/fixtures/payment-verification/telebirr.png
 * Test with actual receipts: CHQ0FJ403O, DB80L94QPK, etc.
 */
function parseTelebirrHTML(html) {
  const $ = cheerio.load(html);
  
  return {
    amount: extractAmount($),
    status: extractStatus($),
    payerName: extractPayerName($),
    payerAccountOrPhone: extractPayerPhone($),
    receiverName: extractReceiverName($),
    receiverAccount: null, // Not reliably available on Telebirr receipts
    transactionDate: extractDate($),
    fullRawText: $('body').text().replace(/\s+/g, ' ').trim(),
  };
}

function extractAmount($) {
  // Try multiple possible selectors
  const selectors = [
    '.amount',
    '.total-amount',
    '.transaction-amount',
    'td:contains("Amount") + td',
    'td:contains("መጠን") + td', // Amharic for "Amount"
    '.receipt-amount',
    '[class*="amount"]',
  ];
  
  for (const selector of selectors) {
    try {
      const text = $(selector).text().trim();
      if (text) {
        // Extract number from text like "250.00 ETB" or "250.00" or "ETB 250"
        const match = text.match(/([\d,]+\.?\d*)/);
        if (match) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(amount) && amount > 0) {
            return amount;
          }
        }
      }
    } catch (e) {
      // Selector might not exist, continue to next
      continue;
    }
  }
  
  logger.warn('telebirr.parse.amount_not_found', { 
    attempted: selectors 
  });
  return null;
}

function extractStatus($) {
  const selectors = [
    '.status',
    '.transaction-status',
    '.receipt-status',
    'td:contains("Status") + td',
    'td:contains("ሁኔታ") + td', // Amharic for "Status"
    '[class*="status"]',
  ];
  
  for (const selector of selectors) {
    try {
      const text = $(selector).text().trim().toUpperCase();
      if (text) {
        // Normalize status values
        if (text.includes('SUCCESS') || text.includes('COMPLETE') || text.includes('ተሳክቷል')) {
          return 'SUCCESS';
        }
        if (text.includes('FAIL') || text.includes('አልተሳካም')) {
          return 'FAILED';
        }
        if (text.includes('PENDING')) {
          return 'PENDING';
        }
        // Return raw if no match
        return text;
      }
    } catch (e) {
      continue;
    }
  }
  
  logger.warn('telebirr.parse.status_not_found', { 
    attempted: selectors 
  });
  return 'UNKNOWN';
}

function extractPayerName($) {
  const selectors = [
    '.payer-name',
    '.sender-name',
    '.from-name',
    '.from',
    'td:contains("From") + td',
    'td:contains("Sender") + td',
    'td:contains("ከ") + td', // Amharic for "From"
  ];
  
  for (const selector of selectors) {
    try {
      const text = $(selector).text().trim();
      if (text && text.length > 2) return text;
    } catch (e) {
      continue;
    }
  }
  
  return null;
}

function extractPayerPhone($) {
  const selectors = [
    '.payer-phone',
    '.sender-phone',
    '.from-phone',
    'td:contains("Phone") + td',
    'td:contains("Mobile") + td',
    'td:contains("ስልክ") + td', // Amharic for "Phone"
  ];
  
  for (const selector of selectors) {
    try {
      const text = $(selector).text().trim();
      // Ethiopian phone format: 09XXXXXXXX or +251XXXXXXXXX
      const cleanPhone = text.replace(/\s/g, '');
      if (/^(\+251|09)\d{8,9}$/.test(cleanPhone)) {
        return cleanPhone;
      }
    } catch (e) {
      continue;
    }
  }
  
  return null;
}

function extractReceiverName($) {
  const selectors = [
    '.receiver-name',
    '.recipient-name',
    '.to-name',
    '.to',
    'td:contains("To") + td',
    'td:contains("Recipient") + td',
    'td:contains("ወደ") + td', // Amharic for "To"
  ];
  
  for (const selector of selectors) {
    try {
      const text = $(selector).text().trim();
      if (text && text.length > 2) return text;
    } catch (e) {
      continue;
    }
  }
  
  return null;
}

function extractDate($) {
  const selectors = [
    '.transaction-date',
    '.date',
    '.receipt-date',
    'td:contains("Date") + td',
    'td:contains("Time") + td',
    'td:contains("ቀን") + td', // Amharic for "Date"
  ];
  
  for (const selector of selectors) {
    try {
      const text = $(selector).text().trim();
      if (text) {
        const date = new Date(text);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  return null;
}

module.exports = { parseTelebirrHTML };
