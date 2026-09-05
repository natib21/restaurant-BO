/**
 * @file src/modules/menu/templates/index.js
 * @description Template registry - maps template IDs to template functions
 * 
 * All 7 templates are registered here.
 * Frontend specifies which template via templateId in payload.
 */

const defaultMenu = require('./default-menu');
const luxury = require('./luxury');
const compact = require('./compact');
const listWithPhotos = require('./list-with-photos');
const modern = require('./modern');
const traditional = require('./traditional');
const minimalist = require('./minimalist');

/**
 * Template Registry
 * Maps templateId → template function
 * 
 * Usage:
 *   const template = templates[templateId];
 *   const html = await template(settings);
 */
const templates = {
  // Core templates
  'default-menu': defaultMenu,
  'luxury': luxury,
  'compact': compact,
  'list-with-photos': listWithPhotos,
  'modern': modern,
  'traditional': traditional,
  'minimalist': minimalist,
};

/**
 * Get template by ID
 * Falls back to 'default-menu' if ID not found
 * 
 * @param {string} templateId - Template ID (e.g., 'luxury', 'compact')
 * @returns {Function} Template function
 */
function getTemplate(templateId) {
  if (!templateId || typeof templateId !== 'string') {
    return templates['default-menu'];
  }

  const template = templates[templateId.toLowerCase()];
  if (!template) {
    console.warn(`Template '${templateId}' not found, using 'default-menu'`);
    return templates['default-menu'];
  }

  return template;
}

/**
 * List all available templates
 * 
 * @returns {Array<string>} Array of template IDs
 */
function listAvailableTemplates() {
  return Object.keys(templates);
}

/**
 * Check if template exists
 * 
 * @param {string} templateId - Template ID
 * @returns {boolean} True if template exists
 */
function hasTemplate(templateId) {
  return templates.hasOwnProperty(templateId?.toLowerCase?.());
}

module.exports = {
  templates,
  getTemplate,
  listAvailableTemplates,
  hasTemplate,
};
