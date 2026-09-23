const cheerio = require('cheerio');
const logger = require('../../../../../../utils/logger');

/**
 * ✅ UPDATED WITH REAL TELEBIRR HTML STRUCTURE
 * 
 * Tested against actual receipts from:
 * https://transactioninfo.ethiotelecom.et/receipt/{receiptNumber}
 * 
 * Verified with receipts: DIN62HZ4DU, DB80L94QPK
 * Structure: Table-based, bilingual (Amharic/English) labels
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
    receiverAccount: extractReceiverAccount($),
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
  // ✅ CRITICAL: Use "Total Paid Amount" (includes service fee + VAT)
  // NOT "Settled Amount" (what merchant receives after fees)
  // Customer confirms they paid the total, so validate against that
  
  const amountLabels = [
    'Total Paid Amount',
    'ጠቅላላ የተከፈለ',
    'Settled Amount',
    'የተከፈለው መጠን',
  ];

  const rows = $('tr').toArray();
  
  // First try to find Total Paid Amount (preferred)
  for (const row of rows) {
    const rowText = $(row).text();
    if (/Total Paid Amount|ጠቅላላ የተከፈለ/i.test(rowText)) {
      const lastCell = $(row).find('td').last().text().trim();
      const match = lastCell.match(/(\d+(?:\.\d+)?)\s*Birr/i);
      if (match) {
        const amount = parseFloat(match[1]);
        if (!isNaN(amount) && amount > 0) {
          logger.info('telebirr.parse.amount_extracted', { 
            amount, 
            type: 'total_paid',
            source: 'Total Paid Amount' 
          });
          return amount;
        }
      }
    }
  }
  
  // Fallback to Settled Amount if Total Paid not found
  for (const row of rows) {
    const cells = $(row).find('td').toArray();
    if (cells.length === 3) {
      // Check if this is the data row (has Invoice No, Date, Amount)
      const cell2Text = $(cells[2]).text().trim();
      const match = cell2Text.match(/(\d+(?:\.\d+)?)\s*Birr/i);
      if (match) {
        const amount = parseFloat(match[1]);
        if (!isNaN(amount) && amount > 0 && amount < 10000000) {
          logger.warn('telebirr.parse.amount_fallback', { 
            amount, 
            type: 'settled_amount',
            note: 'Using Settled Amount as fallback - may not match customer total'
          });
          return amount;
        }
      }
    }
  }

  logger.warn('telebirr.parse.amount_not_found', { attempted: amountLabels });
  return null;
}

function extractStatus($) {
  // ✅ Real structure: <td>የክፍያው ሁኔታ/transaction status<td>Completed</td>
  const rows = $('tr').toArray();
  
  for (const row of rows) {
    const cells = $(row).find('td').toArray();
    if (cells.length >= 2) {
      const firstCellText = $(cells[0]).text();
      if (/transaction status|የክፍያው ሁኔታ/i.test(firstCellText)) {
        const statusText = $(cells[1]).text().trim().toUpperCase();
        if (statusText.includes('COMPLET')) return 'SUCCESS';
        if (statusText.includes('FAIL') || statusText.includes('DECLINE')) return 'FAILED';
        if (statusText.includes('PENDING')) return 'PENDING';
        return statusText;
      }
    }
  }

  logger.warn('telebirr.parse.status_not_found');
  return 'UNKNOWN';
}

function extractPayerName($) {
  // ✅ Real structure: <td>የከፋይ ስም/Payer Name</td><td>Nathnael Zelalem Teshome</td>
  const rows = $('tr').toArray();
  
  for (const row of rows) {
    const cells = $(row).find('td').toArray();
    if (cells.length >= 2) {
      const firstCellText = $(cells[0]).text();
      if (/Payer Name|የከፋይ ስም/i.test(firstCellText)) {
        const name = $(cells[1]).text().trim();
        if (name && name.length > 2) {
          return name;
        }
      }
    }
  }

  return null;
}

function extractPayerPhone($) {
  // ✅ Real structure: <td>የከፋይ ቴሌብር ቁ./Payer telebirr no.</td><td>2519****9921</td>
  // Note: Phone numbers are masked (e.g., 2519****9921)
  const rows = $('tr').toArray();
  
  for (const row of rows) {
    const cells = $(row).find('td').toArray();
    if (cells.length >= 2) {
      const firstCellText = $(cells[0]).text();
      if (/Payer telebirr no|የከፋይ ቴሌብር ቁ/i.test(firstCellText)) {
        const phone = $(cells[1]).text().trim();
        // Accept masked format: 2519****9921 or full: 251912345678
        if (phone && /^251/.test(phone)) {
          return phone;
        }
      }
    }
  }

  return null;
}

function extractReceiverName($) {
  // ✅ Real structure: <td>የገንዘብ ተቀባይ ስም/Credited Party name</td><td>Ethiswitch standard QR payment</td>
  const rows = $('tr').toArray();
  
  for (const row of rows) {
    const cells = $(row).find('td').toArray();
    if (cells.length >= 2) {
      const firstCellText = $(cells[0]).text();
      if (/Credited Party name|የገንዘብ ተቀባይ ስም/i.test(firstCellText)) {
        const name = $(cells[1]).text().trim();
        if (name && name.length > 2) {
          return name;
        }
      }
    }
  }

  return null;
}

function extractReceiverAccount($) {
  // ✅ Real structure: <td>የገንዘብ ተቀባይ ቴሌብር ቁ./Credited party account no</td><td>0070</td>
  const rows = $('tr').toArray();
  
  for (const row of rows) {
    const cells = $(row).find('td').toArray();
    if (cells.length >= 2) {
      const firstCellText = $(cells[0]).text();
      if (/Credited party account no|የገንዘብ ተቀባይ ቴሌብር ቁ/i.test(firstCellText)) {
        const account = $(cells[1]).text().trim();
        if (account) {
          return account;
        }
      }
    }
  }

  return null;
}

function extractPaymentReason($) {
  // ✅ Real structure: row with label, then value in bordered cell below
  const rows = $('tr').toArray();
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cells = $(row).find('td').toArray();
    
    for (const cell of cells) {
      const cellText = $(cell).text().trim();
      if (/Payment Reason|የክፍያ ምክንያት/i.test(cellText)) {
        // Value is in next cell with bottom border
        const nextCell = $(row).find('td').eq(1);
        if (nextCell.length) {
          const reason = nextCell.text().trim();
          if (reason && reason.length > 0) {
            return reason;
          }
        }
      }
    }
  }

  return null;
}

function extractPaymentMode($) {
  // ✅ Real structure: similar to payment reason
  const rows = $('tr').toArray();
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cells = $(row).find('td').toArray();
    
    for (const cell of cells) {
      const cellText = $(cell).text().trim();
      if (/Payment Mode|የክፍያ ዘዴ/i.test(cellText)) {
        // Value is in next cell
        const nextCell = $(row).find('td').eq(1);
        if (nextCell.length) {
          const mode = nextCell.text().trim();
          if (mode && mode.length > 0) {
            return mode;
          }
        }
      }
    }
  }

  return null;
}

function extractDate($) {
  // ✅ Real structure: Date is in the invoice details table
  // Format: DD-MM-YYYY HH:MM:SS (e.g., 23-09-2026 14:21:29)
  const rows = $('tr').toArray();
  
  for (const row of rows) {
    const cells = $(row).find('td').toArray();
    if (cells.length === 3) {
      // This is likely the data row with Invoice No, Date, Amount
      const cell1Text = $(cells[1]).text().trim();
      const dateMatch = cell1Text.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})/);
      if (dateMatch) {
        const [, day, month, year, time] = dateMatch;
        const isoDate = `${year}-${month}-${day}T${time}`;
        const parsed = new Date(isoDate);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }
  }

  // Fallback: search body text for date pattern
  const text = $('body').text();
  const match = text.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})/);
  if (match) {
    const [, day, month, year, time] = match;
    const isoDate = `${year}-${month}-${day}T${time}`;
    const parsed = new Date(isoDate);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
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
