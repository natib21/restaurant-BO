const AppError = require('../../../../utils/appError');
const logger = require('../../../../utils/logger');

class PdfExtractionService {
  static extractNativeText(pdfBuffer) {
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
      throw new AppError('PDF buffer is required for native extraction', 400);
    }

    const text = pdfBuffer
      .toString('latin1')
      .match(/BT\\s*.*?\\(.*?\\)\s*Tj/g)?.join(' ') || '';

    if (!text || text.length < 10) {
      logger.warn('pdf.extraction.failed', { size: pdfBuffer.length });
      throw new AppError('PDF_EXTRACTION_FAILED', 422);
    }

    return text;
  }
}

module.exports = PdfExtractionService;
