// utils/auditPlugin.js
// ✅ PHASE 1: Global audit logging via Mongoose plugin
const { getCurrentUser, getCorrelationId, getRequest } = require('./request-context');
const AuditLog = require('../models/auditLogModel');
const logger = require('./logger');

/**
 * Mongoose plugin for automatic audit logging on create/update/delete
 * 
 * Usage:
 * orderSchema.plugin(auditPlugin, { 
 *   resource: 'Order',
 *   auditedFields: ['status', 'totalPrice', 'isPaid']
 * });
 * 
 * @param {mongoose.Schema} schema 
 * @param {Object} options
 * @param {string} options.resource - Resource name (e.g., 'Order', 'Merchant')
 * @param {string[]} [options.auditedFields] - Fields to track (default: all)
 * @param {boolean} [options.auditDeletes=true] - Whether to audit delete operations
 */
function auditPlugin(schema, options = {}) {
  const { resource, auditedFields, auditDeletes = true } = options;

  if (!resource) {
    throw new Error('auditPlugin requires a resource name');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRE-SAVE HOOK (Capture isNew flag + old state for updates)
  // ══════════════════════════════════════════════════════════════════════════
  schema.pre('save', async function (next) {
    // CRITICAL: Capture isNew BEFORE Mongoose sets it to false
    // doc.isNew is true for creates, false for updates — but only before save completes
    this.$locals.wasNew = this.isNew;

    // If this is an update (not new), fetch the old document
    if (!this.isNew && this._id) {
      try {
        const OldDoc = this.constructor;
        const oldDoc = await OldDoc.findById(this._id).lean();
        if (oldDoc) {
          // Store in $locals (not persisted to DB)
          this.$locals.auditOldDoc = oldDoc;
        }
      } catch (error) {
        logger.error('audit.plugin.pre-save.fetch-old.failed', {
          resource,
          resourceId: this._id,
          error: error.message,
        });
      }
    }
    next();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST-SAVE HOOK (CREATE and UPDATE)
  // ══════════════════════════════════════════════════════════════════════════
  schema.post('save', async function (doc, next) {
    try {
      const user = getCurrentUser();
      const correlationId = getCorrelationId();
      const req = getRequest();

      // Skip if no request context (e.g., seeding, cron jobs)
      if (!req) return next();

      // FIX #1: Use captured wasNew flag from pre('save')
      const wasNew = doc.$locals.wasNew;
      const action = wasNew ? 'CREATE' : 'UPDATE';

      // Build changes array for updates
      let changes = [];
      let oldValues = null;
      let newValues = null;

      if (!wasNew && doc.$locals.auditOldDoc) {
        // Compare old vs new for specified fields
        const fieldsToCheck = auditedFields || Object.keys(doc.toObject());
        
        for (const field of fieldsToCheck) {
          const oldVal = doc.$locals.auditOldDoc[field];
          const newVal = doc[field];

          // ✅ Skip fields with type mismatches (e.g., old ObjectId vs new Object)
          // This handles schema migrations gracefully
          const oldType = oldVal?.constructor?.name || typeof oldVal;
          const newType = newVal?.constructor?.name || typeof newVal;
          
          if (oldType !== newType && oldVal !== null && newVal !== null && oldVal !== undefined && newVal !== undefined) {
            logger.warn('audit.plugin.type-mismatch', {
              resource,
              resourceId: doc._id,
              field,
              oldType,
              newType,
              message: 'Skipping field comparison due to type mismatch (possible schema migration)',
            });
            continue;
          }

          // Only log if changed (deep comparison for primitives)
          try {
            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
              changes.push({
                field,
                oldValue: oldVal,
                newValue: newVal,
              });
            }
          } catch (jsonError) {
            // Skip fields that can't be stringified (circular references, etc.)
            logger.warn('audit.plugin.stringify-failed', {
              resource,
              resourceId: doc._id,
              field,
              error: jsonError.message,
            });
          }
        }

        // Also store complete old/new for complex queries
        oldValues = doc.$locals.auditOldDoc;
        newValues = doc.toObject();
      }

      // Extract merchant/branch context
      // Special case: if auditing a Merchant document, use its own _id
      const merchant = resource === 'Merchant' 
        ? doc._id 
        : (doc.merchant || user?.merchant?._id || user?.merchant);
      const branch = doc.branch || null;

      // Build audit log entry
      const auditData = {
        user: user?._id || null,
        merchant,
        branch,
        action,
        resource,
        resourceId: doc._id,
        method: wasNew ? 'POST' : 'PATCH',
        endpoint: req.originalUrl || 'internal',
        statusCode: 200,
        correlationId,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get?.('User-Agent'),
        oldValues,
        newValues,
        metadata: {
          wasNew,
          changedFields: changes.length > 0 ? changes.map(c => c.field) : undefined,
        },
      };

      // Only add changes if there are any
      if (changes.length > 0) {
        auditData.changes = changes;
      }

      // Non-blocking audit log creation
      setImmediate(async () => {
        try {
          await AuditLog.create(auditData);
        } catch (auditError) {
          logger.error('audit.plugin.save.failed', {
            resource,
            resourceId: doc._id,
            error: auditError.message,
            stack: auditError.stack,
          });
        }
      });
    } catch (error) {
      // Never fail the actual operation due to audit logging
      logger.error('audit.plugin.save.error', {
        resource,
        error: error.message,
      });
    }

    next();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST-FINDONEANDUPDATE HOOK (For .findByIdAndUpdate, .findOneAndUpdate)
  // ══════════════════════════════════════════════════════════════════════════
  schema.post('findOneAndUpdate', async function (doc, next) {
    if (!doc) return next();

    try {
      const user = getCurrentUser();
      const correlationId = getCorrelationId();
      const req = getRequest();

      if (!req) return next();

      // this.getUpdate() contains the update operations
      const update = this.getUpdate();
      const oldDoc = this._oldDoc; // Set in pre hook

      // Build changes array by comparing old vs new
      let changes = [];
      if (oldDoc) {
        const fieldsToCheck = auditedFields || Object.keys(doc.toObject());
        
        for (const field of fieldsToCheck) {
          const oldVal = oldDoc[field];
          const newVal = doc[field];

          // Only log if changed
          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes.push({
              field,
              oldValue: oldVal,
              newValue: newVal,
            });
          }
        }
      }

      // Extract merchant/branch
      // Special case: if auditing a Merchant document, use its own _id
      const merchant = resource === 'Merchant' 
        ? doc._id 
        : (doc.merchant || user?.merchant?._id || user?.merchant);
      const branch = doc.branch || null;

      const auditData = {
        user: user?._id || null,
        merchant,
        branch,
        action: 'UPDATE',
        resource,
        resourceId: doc._id,
        method: 'PATCH',
        endpoint: req.originalUrl || 'internal',
        statusCode: 200,
        correlationId,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get?.('User-Agent'),
        oldValues: oldDoc,
        newValues: doc.toObject(),
        metadata: {
          wasNew: false, // findOneAndUpdate is always an update
          updateType: 'findOneAndUpdate',
          update,
          changedFields: changes.length > 0 ? changes.map(c => c.field) : undefined,
        },
      };

      // Only add changes if there are any
      if (changes.length > 0) {
        auditData.changes = changes;
      }

      setImmediate(async () => {
        try {
          await AuditLog.create(auditData);
        } catch (auditError) {
          logger.error('audit.plugin.findOneAndUpdate.failed', {
            resource,
            resourceId: doc._id,
            error: auditError.message,
          });
        }
      });
    } catch (error) {
      logger.error('audit.plugin.findOneAndUpdate.error', {
        resource,
        error: error.message,
      });
    }

    next();
  });

  // Capture old doc before update
  schema.pre('findOneAndUpdate', async function (next) {
    try {
      const oldDoc = await this.model.findOne(this.getQuery()).lean();
      if (oldDoc) {
        this._oldDoc = oldDoc;
      }
    } catch (error) {
      logger.error('audit.plugin.pre-findOneAndUpdate.failed', {
        resource,
        error: error.message,
      });
    }
    next();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE HOOKS (if enabled)
  // ══════════════════════════════════════════════════════════════════════════
  if (auditDeletes) {
    schema.post('deleteOne', async function (doc, next) {
      try {
        const user = getCurrentUser();
        const correlationId = getCorrelationId();
        const req = getRequest();

        if (!req) return next();

        const deletedDoc = this._deletedDoc;
        if (!deletedDoc) return next();

        // Special case: if auditing a Merchant document, use its own _id
        const merchant = resource === 'Merchant' 
          ? deletedDoc._id 
          : (deletedDoc.merchant || user?.merchant?._id || user?.merchant);
        const branch = deletedDoc.branch || null;

        const auditData = {
          user: user?._id || null,
          merchant,
          branch,
          action: 'DELETE',
          resource,
          resourceId: deletedDoc._id,
          method: 'DELETE',
          endpoint: req.originalUrl || 'internal',
          statusCode: 200,
          correlationId,
          ip: req.ip || req.connection?.remoteAddress,
          userAgent: req.get?.('User-Agent'),
          oldValues: deletedDoc,
          newValues: null,
          metadata: {
            deleteType: 'deleteOne',
          },
        };

        setImmediate(async () => {
          try {
            await AuditLog.create(auditData);
          } catch (auditError) {
            logger.error('audit.plugin.deleteOne.failed', {
              resource,
              resourceId: deletedDoc._id,
              error: auditError.message,
            });
          }
        });
      } catch (error) {
        logger.error('audit.plugin.deleteOne.error', {
          resource,
          error: error.message,
        });
      }

      next();
    });

    schema.pre('deleteOne', async function (next) {
      try {
        const doc = await this.model.findOne(this.getQuery()).lean();
        if (doc) {
          this._deletedDoc = doc;
        }
      } catch (error) {
        logger.error('audit.plugin.pre-deleteOne.failed', {
          resource,
          error: error.message,
        });
      }
      next();
    });
  }
}

module.exports = auditPlugin;
