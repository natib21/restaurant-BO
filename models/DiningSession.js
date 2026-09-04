/**
 * DiningSession Model
 * 
 * Represents a complete table visit (dining session) that can contain
 * multiple orders from multiple customers (both QR and staff-created).
 * 
 * Key Differences from CustomerSession:
 * - Represents table visit, not individual customer session
 * - Has lifecycle status (active, ended, cancelled)
 * - Tracks who created the session (staff or QR)
 * - No customer or deviceInfo fields (session != customer)
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const SESSION_DURATION_HOURS = process.env.SESSION_DURATION_HOURS || 4;
const SESSION_DURATION_MS = 1000 * 60 * 60 * SESSION_DURATION_HOURS;

const diningSessionSchema = new Schema(
  {
    // Core references
    table: {
      type: Schema.Types.ObjectId,
      ref: 'Table',
      required: true,
      index: true,
      comment: 'Table this dining session is for'
    },
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    branch: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    
    // Session identity
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
      comment: 'Secure token for QR access and API calls'
    },
    
    // Lifecycle management
    status: {
      type: String,
      enum: ['active', 'ended', 'cancelled'],
      default: 'active',
      required: true,
      index: true,
      comment: 'Session lifecycle status'
    },
    
    startedAt: {
      type: Date,
      default: Date.now,
      required: true,
      comment: 'When the dining session started'
    },
    
    endedAt: {
      type: Date,
      default: null,
      comment: 'When the dining session ended (null if still active)'
    },
    
    // Auto-expiration for abandoned sessions
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + SESSION_DURATION_MS),
      index: { expires: '1d' },
      comment: 'Auto-expire abandoned sessions after X hours'
    },
    
    // Tracking
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      comment: 'Staff member who created session (null for QR-initiated)'
    },
    
    // Metadata
    metadata: {
      guestCount: { 
        type: Number, 
        default: null,
        min: 0,
        comment: 'Number of guests at table (optional)'
      },
      notes: { 
        type: String, 
        trim: true,
        maxlength: 500,
        comment: 'Optional notes about the session'
      }
    },
    
    // Backward compatibility (will be removed in future)
    isActive: {
      type: Boolean,
      default: true,
      comment: 'DEPRECATED: Use status field instead. Kept for migration compatibility.'
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ====================== INDEXES ======================

/**
 * CRITICAL: Only one active session per table
 * This partial unique index ensures at most one session with status='active' per table
 */
diningSessionSchema.index(
  { table: 1 },
  { 
    unique: true, 
    partialFilterExpression: { status: 'active' },
    name: 'unique_active_session_per_table'
  }
);

// Query optimization indexes
diningSessionSchema.index({ merchant: 1, branch: 1, status: 1 });
diningSessionSchema.index({ status: 1, endedAt: 1 });
diningSessionSchema.index({ branch: 1, status: 1, startedAt: -1 });

// Backward compatibility index (matches old CustomerSession)
diningSessionSchema.index({ merchant: 1, branch: 1 });

// ====================== VIRTUALS ======================

/**
 * Virtual: orders
 * Get all orders that belong to this dining session
 */
diningSessionSchema.virtual('orders', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'session',
  match: { status: { $nin: ['canceled'] } }
});

/**
 * Virtual: tableDetails
 * Get populated table information
 */
diningSessionSchema.virtual('tableDetails', {
  ref: 'Table',
  localField: 'table',
  foreignField: '_id',
  justOne: true
});

/**
 * Virtual: branchDetails
 * Get populated branch information
 */
diningSessionSchema.virtual('branchDetails', {
  ref: 'Branch',
  localField: 'branch',
  foreignField: '_id',
  justOne: true
});

/**
 * Virtual: duration
 * Calculate session duration in milliseconds
 */
diningSessionSchema.virtual('duration').get(function() {
  if (!this.endedAt) {
    return Date.now() - this.startedAt.getTime();
  }
  return this.endedAt.getTime() - this.startedAt.getTime();
});

// ====================== INSTANCE METHODS ======================

/**
 * Check if session is active and not expired
 */
diningSessionSchema.methods.isCurrentlyActive = function() {
  return this.status === 'active' && 
         this.expiresAt > new Date();
};

/**
 * Get human-readable session duration
 */
diningSessionSchema.methods.getDurationFormatted = function() {
  const durationMs = this.duration;
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

// ====================== PRE-SAVE HOOKS ======================

/**
 * Auto-populate branch and merchant from table
 */
diningSessionSchema.pre('save', async function (next) {
  // Only run on new documents or if table changed
  if (!this.isNew && !this.isModified('table')) {
    return next();
  }
  
  if (!this.branch && this.table) {
    const Table = mongoose.model('Table');
    const tableDoc = await Table.findById(this.table).select('branch merchant');

    if (!tableDoc) {
      return next(new Error('Table not found'));
    }
    
    this.branch = tableDoc.branch;
    this.merchant = tableDoc.merchant;
  }

  // Validate table belongs to branch
  if (this.table && this.branch) {
    const Table = mongoose.model('Table');
    const tableDoc = await Table.findById(this.table).select('branch');

    if (!tableDoc) {
      return next(new Error('Table not found'));
    }
    
    if (tableDoc.branch.toString() !== this.branch.toString()) {
      return next(new Error('Table does not belong to this branch'));
    }
  }

  next();
});

/**
 * Sync isActive with status for backward compatibility
 */
diningSessionSchema.pre('save', function(next) {
  this.isActive = (this.status === 'active');
  next();
});

// ====================== STATICS ======================

/**
 * Find active session for a table
 */
diningSessionSchema.statics.findActiveByTable = function(tableId) {
  return this.findOne({
    table: tableId,
    status: 'active'
  });
};

/**
 * Find active sessions for a branch
 */
diningSessionSchema.statics.findActiveByBranch = function(branchId) {
  return this.find({
    branch: branchId,
    status: 'active'
  }).sort({ startedAt: -1 });
};

// ====================== MODEL ======================

module.exports = mongoose.model('DiningSession', diningSessionSchema);
