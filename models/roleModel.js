// models/Role.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const roleSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Role must have a name'],
      trim: true,
      uppercase: true,
      minlength: [3, 'Role name too short'],
      maxlength: [50, 'Role name too long'],
    },
    description: {
      type: String,
      required: [true, 'Role must have a description'],
      trim: true,
      minlength: [10, 'Description too short'],
    },
    isSystemRole: {
      type: Boolean,
      default: false,
    },
    isSubscriptionBased: {
      type: Boolean,
      default: false,
    },
    merchant: {
      type: Schema.Types.ObjectId,
      ref: 'Merchant',
      default: null,
    },
    tasks: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Task',
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
      // select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// === INDEX: Unique role name per merchant (or system-wide) ===
roleSchema.index(
  { name: 1, merchant: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 }, // case-insensitive
  }
);

// === PRE-SAVE: Prevent non-super-admin from setting isSystemRole = true ===
roleSchema.pre('save', function (next) {
  if (this.isModified('isSystemRole') && this.isSystemRole && !this.isNew) {
    return next(new Error('isSystemRole cannot be changed after creation'));
  }
  next();
});

const Role = mongoose.model('Role', roleSchema);
module.exports = Role;
