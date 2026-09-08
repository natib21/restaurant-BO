const AppError = require('../../../../utils/appError');

class TransactionNormalizer {
  static normalizeReference(reference, provider) {
    if (!reference || typeof reference !== 'string') {
      throw new AppError('Reference is required', 400);
    }

    const cleaned = reference.trim();
    if (!cleaned) {
      throw new AppError('Reference cannot be empty', 400);
    }

    const withoutSeparators = cleaned.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    if (provider === 'telebirr') {
      return withoutSeparators.slice(0, 12);
    }

    if (provider === 'cbe' || provider === 'cbebirr') {
      return withoutSeparators.slice(0, 20);
    }

    return withoutSeparators;
  }

  static normalizeAmount(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      return null;
    }

    return Number(numeric.toFixed(2));
  }

  static normalizeCurrency(value) {
    if (!value) return null;
    return String(value).trim().toUpperCase();
  }

  static normalizeDate(value) {
    if (!value) return null;

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}

module.exports = TransactionNormalizer;
