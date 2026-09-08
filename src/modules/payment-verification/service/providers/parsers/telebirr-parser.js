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
  const text = $('body').text().replace(/\s+/g, ' ').trim();

  return {
    reference: extractReference($, text),
    amount: extractAmount($),
    status: extractStatus($),
    payerName: extractPayerName($),
    payerAccountOrPhone: extractPayerPhone($),
    receiverName: extractReceiverName($),
    receiverAccount: null,
    transactionDate: extractDate($),
    paymentReason: extractPaymentReason($),
    paymentMode: extractPaymentMode($),
    fullRawText: text,
  };
}

function extractReference($, text = '') {
  const rows = $('tr').toArray();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const cells = $(row).find('td').toArray()
      .map((cell) => $(cell).text().replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const hasInvoiceLabel = cells.some((cell) => /Invoice No|የክፍያ ቁጥር|reference/i.test(cell));
    if (!hasInvoiceLabel) continue;

    const nextRow = rows[index + 1];
    if (nextRow) {
      const nextCells = $(nextRow).find('td').toArray()
        .map((cell) => $(cell).text().replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      const candidate = nextCells.find((cell) => {
        if (!cell || /\d{2}-\d{2}-\d{4}/.test(cell)) return false;
        const cleaned = cell.replace(/[^A-Z0-9]/g, '');
        return /^[A-Z0-9]{8,12}$/.test(cleaned) && !/^\d+$/.test(cleaned);
      });

      if (candidate) return candidate.replace(/[^A-Z0-9]/g, '');
    }

    const candidate = cells.find((cell) => {
      if (!cell || /\d{2}-\d{2}-\d{4}/.test(cell)) return false;
      const cleaned = cell.replace(/[^A-Z0-9]/g, '');
      return /^[A-Z0-9]{8,12}$/.test(cleaned) && !/^\d+$/.test(cleaned);
    });

    if (candidate) return candidate.replace(/[^A-Z0-9]/g, '');
  }

  const fallback = text.match(/(?:Invoice No\.?|የክፍያ ቁጥር)[^A-Z0-9]*(\b[A-Z0-9]{8,12}\b)/i);
  if (fallback && !/\d{2}-\d{2}-\d{4}/.test(fallback[1])) return fallback[1];

  return null;
}

function extractAmount($) {
  const amountLabels = [
    'Settled Amount',
    'የተከፈለው መጠን',
    'Total Paid Amount',
    'ጠቅላላ የተከፈለ',
    'Amount',
    'መጠን',
  ];

  for (const label of amountLabels) {
    const row = $('tr').toArray().find((entry) => {
      const value = $(entry).text().replace(/\s+/g, ' ').trim();
      return value.toLowerCase().includes(label.toLowerCase());
    });

    if (!row) continue;

    const cells = $(row).find('td').toArray()
      .map((cell) => $(cell).text().replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    for (let i = cells.length - 1; i >= 0; i -= 1) {
      const numeric = parseAmountCellValue(cells[i]);
      if (numeric !== null) return numeric;
    }

    const nextRow = $(row).next('tr');
    if (nextRow.length) {
      const nextCells = nextRow.find('td').toArray()
        .map((cell) => $(cell).text().replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      for (let i = nextCells.length - 1; i >= 0; i -= 1) {
        const numeric = parseAmountCellValue(nextCells[i]);
        if (numeric !== null) return numeric;
      }
    }
  }

  logger.warn('telebirr.parse.amount_not_found', { attempted: amountLabels });
  return null;
}

function parseAmountCellValue(value) {
  if (!value) return null;

  const normalized = value.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/(\d+(?:,\d{3})*(?:\.\d+)?)(?:\s*(?:Birr|ETB|BIRR))?/i);
  if (!match) return null;

  if (!/amount|paid|settled|fee|total|birr|etb/i.test(normalized) && !/\d+\s*(?:Birr|ETB|BIRR)/i.test(normalized)) {
    return null;
  }

  const numeric = parseFloat(match[1].replace(/,/g, ''));
  if (!isNaN(numeric) && numeric > 0 && numeric < 10000000) {
    return numeric;
  }

  return null;
}

function extractStatus($) {
  const statusText = $('td').filter((_, el) => {
    const value = $(el).text().replace(/\s+/g, ' ').trim().toLowerCase();
    return value.includes('transaction status') || value.includes('status') || value.includes('completed') || value.includes('failed');
  }).first().next().text().trim();

  if (statusText) {
    const upper = statusText.toUpperCase();
    if (upper.includes('COMPLETE') || upper.includes('SUCCESS')) return 'SUCCESS';
    if (upper.includes('FAIL') || upper.includes('DECLINE')) return 'FAILED';
    if (upper.includes('PENDING')) return 'PENDING';
    return upper;
  }

  const selectors = [
    '.status',
    '.transaction-status',
    '.receipt-status',
    'td:contains("Status") + td',
    'td:contains("ሁኔታ") + td',
    '[class*="status"]',
  ];

  for (const selector of selectors) {
    try {
      const text = $(selector).text().trim().toUpperCase();
      if (text) {
        if (text.includes('SUCCESS') || text.includes('COMPLETE') || text.includes('ተሳክቷል')) return 'SUCCESS';
        if (text.includes('FAIL') || text.includes('አልተሳካም')) return 'FAILED';
        if (text.includes('PENDING')) return 'PENDING';
        return text;
      }
    } catch (e) {
      continue;
    }
  }

  logger.warn('telebirr.parse.status_not_found', { attempted: ['status row'] });
  return 'UNKNOWN';
}

function extractPayerName($) {
  const selectors = [
    '.payer-name',
    '.sender-name',
    '.from-name',
    '.from',
    'td:contains("Payer Name") + td',
    'td:contains("From") + td',
    'td:contains("Sender") + td',
    'td:contains("ከ") + td',
  ];

  for (const selector of selectors) {
    try {
      const text = $(selector).text().trim();
      if (text && text.length > 2) return text;
    } catch (e) {
      continue;
    }
  }

  const row = $('tr').toArray().find((entry) => {
    const value = $(entry).text().replace(/\s+/g, ' ').trim();
    return /Payer Name|የከፋይ ስም/i.test(value);
  });

  if (row) {
    const text = $(row).find('td').last().text().trim();
    if (text) return text;
  }

  return null;
}

function extractPayerPhone($) {
  const selectors = [
    '.payer-phone',
    '.sender-phone',
    '.from-phone',
    'td:contains("Payer telebirr no") + td',
    'td:contains("Phone") + td',
    'td:contains("Mobile") + td',
    'td:contains("ስልክ") + td',
  ];

  for (const selector of selectors) {
    try {
      const text = $(selector).text().trim();
      const cleanPhone = text.replace(/\s/g, '');
      if (/^(\+251|09)\d{8,9}$/.test(cleanPhone)) {
        return cleanPhone;
      }
    } catch (e) {
      continue;
    }
  }

  const row = $('tr').toArray().find((entry) => {
    const value = $(entry).text().replace(/\s+/g, ' ').trim();
    return /Payer telebirr no|የከፋይ ቴሌብር ቁ/i.test(value);
  });

  if (row) {
    const text = $(row).find('td').last().text().trim();
    const cleaned = text.replace(/\s/g, '');
    if (/^(\+251|09)\d{8,9}$/.test(cleaned)) return cleaned;
  }

  return null;
}

function extractReceiverName($) {
  const selectors = [
    '.receiver-name',
    '.recipient-name',
    '.to-name',
    '.to',
    'td:contains("Credited Party name") + td',
    'td:contains("Recipient") + td',
    'td:contains("To") + td',
    'td:contains("ወደ") + td',
  ];

  for (const selector of selectors) {
    try {
      const text = $(selector).text().trim();
      if (text && text.length > 2) return text;
    } catch (e) {
      continue;
    }
  }

  const row = $('tr').toArray().find((entry) => {
    const value = $(entry).text().replace(/\s+/g, ' ').trim();
    return /Credited Party name|የገንዘብ ተቀባይ ስም/i.test(value);
  });

  if (row) {
    const text = $(row).find('td').last().text().trim();
    if (text) return text;
  }

  return null;
}

function extractPaymentReason($) {
  const divs = $('div').toArray().map((entry) => $(entry).text().replace(/\s+/g, ' ').trim());
  const labelIndex = divs.findIndex((text) => /Payment Reason|የክፍያ ምክንያት/i.test(text));
  if (labelIndex !== -1 && divs[labelIndex + 1]) {
    return divs[labelIndex + 1].trim();
  }

  const row = $('tr').toArray().find((entry) => {
    const value = $(entry).text().replace(/\s+/g, ' ').trim();
    return /Payment Reason|የክፍያ ምክንያት/i.test(value);
  });

  if (row) {
    const text = $(row).text().replace(/\s+/g, ' ').trim();
    const match = text.split(/Payment Reason|የክፍያ ምክንያት/i)[1];
    if (match) return match.replace(/^[^A-Za-z0-9\u1200-\u137F]+|[^A-Za-z0-9\u1200-\u137F]+$/g, '').trim();
  }

  const text = $('body').text().replace(/\s+/g, ' ');
  const match = text.match(/Payment Reason[^A-Za-z0-9]*(.+?)(?:Payment Mode|የክፍያ ዘዴ|$)/i);
  if (match) return match[1].trim();

  return null;
}

function extractPaymentMode($) {
  const divs = $('div').toArray().map((entry) => $(entry).text().replace(/\s+/g, ' ').trim());
  const labelIndex = divs.findIndex((text) => /Payment Mode|የክፍያ ዘዴ/i.test(text));
  if (labelIndex !== -1 && divs[labelIndex + 1]) {
    return divs[labelIndex + 1].trim();
  }

  const row = $('tr').toArray().find((entry) => {
    const value = $(entry).text().replace(/\s+/g, ' ').trim();
    return /Payment Mode|የክፍያ ዘዴ/i.test(value);
  });

  if (row) {
    const text = $(row).text().replace(/\s+/g, ' ').trim();
    const match = text.match(/Payment Mode[^A-Za-z0-9]*([A-Za-z0-9\s\-]+?)(?:$|Customer Note|የደንበኛ መልዕክት)/i);
    if (match) return match[1].trim();
  }

  const text = $('body').text().replace(/\s+/g, ' ');
  const match = text.match(/Payment Mode[^A-Za-z0-9]*(.+?)(?:$|Customer Note|የደንበኛ መልዕክት)/i);
  if (match) return match[1].trim();

  return null;
}

function extractDate($) {
  const dateSelectors = [
    'td:contains("Payment date") + td',
    'td:contains("Date") + td',
    'td:contains("Time") + td',
    'td:contains("ቀን") + td',
    'td:contains("Payment Date") + td',
  ];

  for (const selector of dateSelectors) {
    const text = $(selector).text().trim();
    if (text) {
      const date = parseTelebirrDate(text);
      if (date) return date;
    }
  }

  const rows = $('tr').toArray();
  for (const row of rows) {
    const cells = $(row).find('td').toArray()
      .map((cell) => $(cell).text().replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const hasDateLabel = cells.some((cell) => /Payment date|የክፍያ ቀን|Date/i.test(cell));
    if (!hasDateLabel) continue;

    for (const cell of cells) {
      const match = cell.match(/(\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2})/);
      if (match) {
        const date = parseTelebirrDate(match[1]);
        if (date) return date;
      }
    }
  }

  const text = $('body').text().replace(/\s+/g, ' ');
  const match = text.match(/(\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2})/);
  if (match) {
    const date = parseTelebirrDate(match[1]);
    if (date) return date;
  }

  return null;
}

function parseTelebirrDate(value) {
  if (!value) return null;

  const cleaned = value.replace(/\s+/g, ' ').trim();
  const ddMmYyyy = cleaned.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})/);
  if (ddMmYyyy) {
    const [, day, month, year, time] = ddMmYyyy;
    const iso = `${year}-${month}-${day}T${time}`;
    const parsed = new Date(iso);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const generic = new Date(cleaned);
  if (!isNaN(generic.getTime())) return generic;

  return null;
}

module.exports = { parseTelebirrHTML };
