/**
 * Localization Helper Utilities
 * 
 * Provides helper functions to extract localized text from objects that support
 * multilingual content (English and Amharic).
 * 
 * Supports both:
 * - New localized format: { en: 'Text', am: 'ጽሑፍ' }
 * - Legacy string format: 'Text' (for backward compatibility)
 */

/**
 * Get localized text value from a field that may be a string or localized object
 * 
 * @param {Object|String|null|undefined} field - Localized object or legacy string
 * @param {String} language - Language code ('en' or 'am'), defaults to 'en'
 * @returns {String} - Extracted text value
 * 
 * @example
 * getLocalizedText({ en: 'Pizza', am: 'ፒዛ' }, 'en') // Returns: 'Pizza'
 * getLocalizedText({ en: 'Pizza', am: 'ፒዛ' }, 'am') // Returns: 'ፒዛ'
 * getLocalizedText('Pizza', 'am') // Returns: 'Pizza' (legacy format)
 * getLocalizedText(null, 'en') // Returns: ''
 */
function getLocalizedText(field, language = 'en') {
  if (!field) return '';
  
  // Legacy string format (backward compatibility)
  if (typeof field === 'string') {
    return field;
  }
  
  // New localized object format
  if (typeof field === 'object' && field !== null) {
    // Return requested language, fallback to English, then empty string
    return field[language] || field.en || '';
  }
  
  return '';
}

/**
 * Get menu item name in specified language
 * 
 * @param {Object} menu - Menu document with name field
 * @param {String} language - Language code ('en' or 'am'), defaults to 'en'
 * @returns {String} - Menu name in requested language
 * 
 * @example
 * getMenuName({ name: { en: 'Margherita Pizza', am: 'ማርጋሪታ ፒዛ' } }, 'en')
 * // Returns: 'Margherita Pizza'
 */
function getMenuName(menu, language = 'en') {
  if (!menu) return '';
  return getLocalizedText(menu.name, language);
}

/**
 * Get menu item description in specified language
 * 
 * @param {Object} menu - Menu document with description field
 * @param {String} language - Language code ('en' or 'am'), defaults to 'en'
 * @returns {String} - Menu description in requested language
 * 
 * @example
 * getMenuDescription({ description: { en: 'Classic Italian pizza', am: 'ክላሲክ ፒዛ' } }, 'am')
 * // Returns: 'ክላሲክ ፒዛ'
 */
function getMenuDescription(menu, language = 'en') {
  if (!menu) return '';
  return getLocalizedText(menu.description, language);
}

/**
 * Get category name in specified language
 * 
 * @param {Object} category - Category document with name field
 * @param {String} language - Language code ('en' or 'am'), defaults to 'en'
 * @returns {String} - Category name in requested language
 */
function getCategoryName(category, language = 'en') {
  if (!category) return '';
  return getLocalizedText(category.name, language);
}

/**
 * Get combo name in specified language
 * 
 * @param {Object} combo - Combo document with name field
 * @param {String} language - Language code ('en' or 'am'), defaults to 'en'
 * @returns {String} - Combo name in requested language
 */
function getComboName(combo, language = 'en') {
  if (!combo) return '';
  return getLocalizedText(combo.name, language);
}

/**
 * Get combo description in specified language
 * 
 * @param {Object} combo - Combo document with description field
 * @param {String} language - Language code ('en' or 'am'), defaults to 'en'
 * @returns {String} - Combo description in requested language
 */
function getComboDescription(combo, language = 'en') {
  if (!combo) return '';
  return getLocalizedText(combo.description, language);
}

/**
 * Get menu group name in specified language
 * 
 * @param {Object} menuGroup - MenuGroup document with name field
 * @param {String} language - Language code ('en' or 'am'), defaults to 'en'
 * @returns {String} - Menu group name in requested language
 */
function getMenuGroupName(menuGroup, language = 'en') {
  if (!menuGroup) return '';
  return getLocalizedText(menuGroup.name, language);
}

/**
 * Get menu group description in specified language
 * 
 * @param {Object} menuGroup - MenuGroup document with description field
 * @param {String} language - Language code ('en' or 'am'), defaults to 'en'
 * @returns {String} - Menu group description in requested language
 */
function getMenuGroupDescription(menuGroup, language = 'en') {
  if (!menuGroup) return '';
  return getLocalizedText(menuGroup.description, language);
}

/**
 * Convert legacy string name/description to localized format
 * 
 * @param {String} text - Legacy string text
 * @returns {Object} - Localized object with en field
 * 
 * @example
 * convertToLocalized('Pizza') // Returns: { en: 'Pizza' }
 */
function convertToLocalized(text) {
  if (!text || typeof text !== 'string') {
    return { en: '' };
  }
  return { en: text.trim() };
}

/**
 * Normalize name input - converts string to localized object if needed
 * Handles both legacy string format and new localized format
 * 
 * @param {String|Object} nameInput - Name as string or localized object
 * @returns {Object} - Localized name object { en, am? }
 * @throws {Error} - If name format is invalid
 * 
 * @example
 * normalizeName('Pizza') // Returns: { en: 'Pizza' }
 * normalizeName({ en: 'Pizza', am: 'ፒዛ' }) // Returns: { en: 'Pizza', am: 'ፒዛ' }
 */
function normalizeName(nameInput) {
  if (!nameInput) {
    throw new Error('Name is required');
  }
  
  // If already an object (localized format)
  if (typeof nameInput === 'object') {
    if (!nameInput.en || !nameInput.en.trim()) {
      throw new Error('English name (en) is required');
    }
    return {
      en: nameInput.en.trim(),
      ...(nameInput.am && nameInput.am.trim() && { am: nameInput.am.trim() })
    };
  }
  
  // If string (legacy format), convert to localized
  if (typeof nameInput === 'string') {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      throw new Error('Name cannot be empty');
    }
    return { en: trimmed };
  }
  
  throw new Error('Invalid name format');
}

/**
 * Normalize description input - converts string to localized object if needed
 * 
 * @param {String|Object|null|undefined} descriptionInput - Description as string or localized object
 * @returns {Object|null} - Localized description object { en?, am? } or null
 * 
 * @example
 * normalizeDescription('Classic pizza') // Returns: { en: 'Classic pizza' }
 * normalizeDescription(null) // Returns: null
 */
function normalizeDescription(descriptionInput) {
  if (!descriptionInput) {
    return null;
  }
  
  // If already an object (localized format)
  if (typeof descriptionInput === 'object') {
    const result = {};
    if (descriptionInput.en && descriptionInput.en.trim()) {
      result.en = descriptionInput.en.trim();
    }
    if (descriptionInput.am && descriptionInput.am.trim()) {
      result.am = descriptionInput.am.trim();
    }
    return Object.keys(result).length > 0 ? result : null;
  }
  
  // If string (legacy format), convert to localized
  if (typeof descriptionInput === 'string') {
    const trimmed = descriptionInput.trim();
    return trimmed ? { en: trimmed } : null;
  }
  
  return null;
}

/**
 * Get localized field for MongoDB queries
 * Useful for building search queries across multiple languages
 * 
 * @param {String} fieldName - Base field name (e.g., 'name', 'description')
 * @param {String} searchTerm - Search term
 * @param {Array<String>} languages - Languages to search, defaults to ['en', 'am']
 * @returns {Object} - MongoDB $or query object
 * 
 * @example
 * getLocalizedSearchQuery('name', 'pizza')
 * // Returns: { $or: [{ 'name.en': /pizza/i }, { 'name.am': /pizza/i }] }
 */
function getLocalizedSearchQuery(fieldName, searchTerm, languages = ['en', 'am']) {
  if (!searchTerm || !fieldName) {
    return {};
  }
  
  const regex = new RegExp(searchTerm, 'i');
  const conditions = languages.map(lang => ({
    [`${fieldName}.${lang}`]: regex
  }));
  
  return { $or: conditions };
}

module.exports = {
  getLocalizedText,
  getMenuName,
  getMenuDescription,
  getCategoryName,
  getComboName,
  getComboDescription,
  getMenuGroupName,
  getMenuGroupDescription,
  convertToLocalized,
  normalizeName,
  normalizeDescription,
  getLocalizedSearchQuery,
};
