/**
 * @file src/modules/payment-verification/utils/telebirr-pdf-generator.js
 * @description Download PDF from Telebirr receipt page by clicking the download button
 * 
 * Telebirr receipts have a "Download PDF" button that triggers PDF download.
 * This utility automates clicking that button and captures the downloaded PDF.
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../../../utils/logger');

/**
 * Download PDF from Telebirr receipt by clicking the download button
 * 
 * @param {string} receiptNumber - Telebirr receipt number (e.g., DIN62HZ4DU)
 * @param {object} options - Options
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateTelebirrPDF(receiptNumber, options = {}) {
  const { timeout = 30000 } = options;
  const url = `https://transactioninfo.ethiotelecom.et/receipt/${receiptNumber}`;
  
  let browser = null;
  const downloadPath = path.join(process.cwd(), 'temp-downloads');
  
  try {
    logger.info('telebirr.pdf_download_started', { receiptNumber, url });
    
    // Create temporary download directory
    await fs.mkdir(downloadPath, { recursive: true });
    
    // Launch headless browser
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    
    const page = await browser.newPage();
    
    // Set download behavior
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadPath,
    });
    
    // Set viewport
    await page.setViewport({ width: 1200, height: 1600 });
    
    // Navigate to receipt page
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout,
    });
    
    logger.info('telebirr.pdf_page_loaded', { receiptNumber });
    
    // Wait for the Download PDF button to be available
    await page.waitForSelector('#button', { timeout: 5000 });
    
    logger.info('telebirr.pdf_button_found', { receiptNumber });
    
    // Click the "Download PDF" button
    await page.click('#button');
    
    logger.info('telebirr.pdf_button_clicked', { receiptNumber });
    
    // Wait for download to complete (check for file in download directory)
    // The file name pattern: "telebirr_Send Money to Registered Customer.pdf" or similar
    const maxWaitTime = 10000; // 10 seconds
    const checkInterval = 500; // Check every 500ms
    let elapsedTime = 0;
    let downloadedFile = null;
    
    while (elapsedTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsedTime += checkInterval;
      
      // Check if any PDF file exists in download directory
      const files = await fs.readdir(downloadPath);
      const pdfFile = files.find(f => f.endsWith('.pdf') && !f.endsWith('.crdownload'));
      
      if (pdfFile) {
        downloadedFile = path.join(downloadPath, pdfFile);
        break;
      }
    }
    
    if (!downloadedFile) {
      throw new Error('PDF download timeout: file not found in download directory');
    }
    
    logger.info('telebirr.pdf_downloaded', { 
      receiptNumber,
      filename: path.basename(downloadedFile),
    });
    
    // Read the downloaded PDF file
    const pdfBuffer = await fs.readFile(downloadedFile);
    
    // Clean up: delete the downloaded file
    await fs.unlink(downloadedFile);
    
    logger.info('telebirr.pdf_captured', {
      receiptNumber,
      size: pdfBuffer.length,
    });
    
    return pdfBuffer;
    
  } catch (error) {
    logger.error('telebirr.pdf_download_failed', {
      receiptNumber,
      error: error.message,
      stack: error.stack,
    });
    
    throw new Error(`Failed to download Telebirr PDF: ${error.message}`);
    
  } finally {
    if (browser) {
      await browser.close();
    }
    
    // Clean up download directory
    try {
      const files = await fs.readdir(downloadPath);
      for (const file of files) {
        await fs.unlink(path.join(downloadPath, file));
      }
      await fs.rmdir(downloadPath);
    } catch (cleanupError) {
      logger.warn('telebirr.cleanup_failed', { error: cleanupError.message });
    }
  }
}

module.exports = { generateTelebirrPDF };
