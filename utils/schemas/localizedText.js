/**
 * @file utils/schemas/localizedText.js
 * @description Reusable localized text schema for multilingual fields
 * 
 * Supports: English (en) and Amharic (am)
 * Usage: Embedded subdocument (no separate collection, no _id)
 * 
 * @example
 * const mongoose = require('mongoose');
 * const localizedTextSchema = require('../utils/schemas/localizedText');
 * 
 * const categorySchema = new mongoose.Schema({
 *   name: {
 *     type: localizedTextSchema,
 *     required: true
 *   }
 * });
 */

const mongoose = require('mongoose');

const localizedTextSchema = new mongoose.Schema({
  en: {
    type: String,
    trim: true,
    default: ''
  },
  am: {
    type: String,
    trim: true,
    default: ''
  }
}, { 
  _id: false  // No _id for embedded subdocuments
});

module.exports = localizedTextSchema;
