/**
 * @file utils/schemas/commonFields.js
 * @description Reusable common fields for models that need standard tracking and soft-delete
 * 
 * Fields: isActive, createdBy, updatedBy, deletedBy, deletedAt
 * Keep focused - only genuinely shared fields
 * 
 * Usage Pattern:
 * - isActive: Boolean flag for active/inactive records (default: true)
 * - createdBy: User who created the record (set on creation)
 * - updatedBy: User who last updated the record (set on every update)
 * - deletedBy: User who soft-deleted the record (set on soft-delete)
 * - deletedAt: Timestamp when record was soft-deleted (null = not deleted)
 * 
 * Soft Delete Implementation:
 * - Instead of hard deleting, set deletedAt to current timestamp
 * - Set deletedBy to the user performing the deletion
 * - Optionally set isActive to false
 * - Query filters should exclude deletedAt !== null unless explicitly included
 * 
 * @example
 * const mongoose = require('mongoose');
 * const commonFields = require('../utils/schemas/commonFields');
 * 
 * const categorySchema = new mongoose.Schema({
 *   name: String,
 *   merchant: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant' },
 *   ...commonFields
 * }, { timestamps: true });
 * 
 * // Soft delete method
 * categorySchema.methods.softDelete = function(userId) {
 *   this.deletedAt = new Date();
 *   this.deletedBy = userId;
 *   this.isActive = false;
 *   return this.save();
 * };
 * 
 * // Restore method
 * categorySchema.methods.restore = function() {
 *   this.deletedAt = null;
 *   this.deletedBy = null;
 *   this.isActive = true;
 *   return this.save();
 * };
 */

const mongoose = require('mongoose');

const commonFields = {
  /**
   * Active/Inactive flag
   * - true: Record is active and visible
   * - false: Record is inactive (soft disabled)
   * @default true
   */
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  /**
   * User who created this record
   * Set automatically on creation via middleware or service layer
   */
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  /**
   * User who last updated this record
   * Updated automatically on every modification via middleware or service layer
   */
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  /**
   * User who soft-deleted this record
   * Set when deletedAt is set
   */
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  /**
   * Timestamp when record was soft-deleted
   * - null: Record is NOT deleted
   * - Date: Record is soft-deleted (should be excluded from queries)
   * 
   * Query pattern: { deletedAt: null } to get active records only
   * @default null
   */
  deletedAt: {
    type: Date,
    default: null,
    index: true // Index for efficient soft-delete queries
  }
};

module.exports = commonFields;
