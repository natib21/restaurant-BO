const cheerio = require('cheerio');
const logger = require('../../../../../../utils/logger');

/**
 * ⚠️ PLACEHOLDER SELECTORS - MUST BE UPDATED WITH REAL HTML STRUCTURE
 * 
 * These selectors are placeholders and need to be tested against actual HTML from:
 * https://apps.cbe.com.et:100/?id={reference}
 * 
 * Source: tests/fixtures/payment-verification/CBE-Receipt-*.pdf
 * Test with actual receipts: FT26240JY4DT, DHS81MM04XG, etc.
 */
function parseCBEHTML(html) {
  const $ = cheerio.load(html);
  
  return {
    amount: extractAmount($),
    status: extractStatus($),
    payerName: extractPayerName($),
    payerAccountOrPhone: extractPayerAccount($),
    receiverName: extractReceiverName($),
    receiverAccount: extractReceiverAccount($),
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
    'td:contains("Total") + td',
    'td:contains("መጠን") + td', // Amharic
    '.receipt-amount',
    '[class*="amount"]',
  ];
  
  for (const selector of selectors) {
    try {
      const text = $(selector).text().trim();
      if (text) {
        // Extract number from text like "250.00 Birr" or "250.00"
        const match = text.match(/([\d,]+\.?\d*)/);
        if (match) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(amount) && amount > 0) {
            return amount;
          }
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  logger.warn('cbe.parse.amount_not_found', { 
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
    'td:contains("State") + td',
    'td:contains("ሁኔታ") + td', // Amharic
    '[class*="status"]',
  ];
  
  for (const selector of selectors) {
    try {
      const text = $(selector).text().trim().toUpperCase();
      if (text) {
        // Normalize status values
        if (text.includes('SUCCESS') || text.includes('COMPLETE') || text.includes('APPROVED')) {
          return 'SUCCESS';
        }
        if (text.includes('FAIL') || text.includes('REJECT') || text.includes('DECLINED')) {
          return 'FAILED';
        }
        if (text.includes('PENDING') || text.includes('PROCESSING')) {
          return 'PENDING';
        }
        return text;
      }
    } catch (e) {
      continue;
    }
  }
  
  logger.warn('cbe.parse.status_not_found', { 
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
    'td:contains("Payer") + td',
    'td:contains("ከ") + td', // Amharic
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

function extractPayerAccount($) {
  const selectors = [
    '.payer-account',
    '.sender-account',
    '.from-account',
    'td:contains("From Account") + td',
    'td:contains("Sender Account") + td',
    'td:contains("Account Number") + td',
  ];
  
  for (const selector of selectors) {
    try {
      const text = $(selector).text().trim();
      // CBE account format varies, but typically numeric
      if (/^\d{10,16}$/.test(text.replace(/\s/g, ''))) {
        return text;
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
    'td:contains("Beneficiary") + td',
    'td:contains("ወደ") + td', // Amharic
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

function extractReceiverAccount($) {
  const selectors = [
    '.receiver-account',
    '.recipient-account',
    '.to-account',
    'td:contains("To Account") + td',
    'td:contains("Beneficiary Account") + td',
    'td:contains("Credit Account") + td',
  ];
  
  for (const selector of selectors) {
    try {
      const text = $(selector).text().trim();
      if (/^\d{10,16}$/.test(text.replace(/\s/g, ''))) {
        return text;
      }
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
    'td:contains("Transaction Date") + td',
    'td:contains("Time") + td',
    'td:contains("ቀን") + td', // Amharic
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

module.exports = { parseCBEHTML };
