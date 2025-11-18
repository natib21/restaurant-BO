const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const historySchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
  },
  action: {
    type: String,
    enum: ['accepted', 'prepared', 'served'],
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    trim: true,
    required: [true, 'User Must Have firstName'],
  },
  lastName: {
    type: String,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 6,
    select: false,
  },
  passwordConfirm: {
    type: String,
    required: function () {
      // Only require passwordConfirm when:
      // 1. It's a new document AND
      // 2. The password is NOT already hashed (i.e., we're hashing it now)
      return this.isNew && !this.password?.startsWith('$2');
    },
    validate: {
      validator: function (el) {
        return el === this.password;
      },
      message: 'Passwords do not match',
    },
  },

  merchant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Merchant',
    default: null,
  },
  email: {
    type: String,
    trim: true,
    required: function () {
      // Only require email if the role is 'admin'
      console.log('User role:', this.role);
      return this.role === 'admin';
    },
    validate: {
      validator: function (value) {
        if (this.role === 'admin') {
          // Only validate email for admins
          return validator.isEmail(value);
        }
        return true; // Skip validation for non-admin roles
      },
      message: 'Please provide a valid email',
    },
    // validate: [validator.isEmail, 'Please provide a valid email'],
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
    // select: false,
  },
  photo: String,
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetTokenExpires: Date,
  history: [historySchema],
});

userSchema.pre('save', async function (next) {
  if (this.role) {
    const Role = mongoose.model('Role');
    // This query is redundant if pre('validate') already fetched the role.
    // But for safety, we keep it as it requires 'tasks' which pre('validate') did not fetch.
    const role = await Role.findById(this.role).populate('tasks');
    if (!role || !role.tasks.length) this.history = undefined;
  } else {
    this.history = undefined;
  }
  next();
});

// ------------------------------------
// --- USER SCHEMA INDEXES & METHODS ---
// ------------------------------------
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $exists: true, $ne: null } },
  }
);

// 2. Password Hashing
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  // If password is already a bcrypt hash (from seeder), skip re-hashing
  if (this.password?.startsWith('$2a$') || this.password?.startsWith('$2b$')) {
    this.passwordConfirm = undefined;
    return next();
  }

  // Otherwise, hash it
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = undefined;
  next();
});

userSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimeStamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);

    return JWTTimestamp < changedTimeStamp;
  }

  return false;
};
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  console.log({ resetToken }, this.passwordResetToken);
  this.passwordResetTokenExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

// ------------------------------------
// --- USER SCHEMA QUERY MIDDLEWARE ---
// ------------------------------------
/* userSchema.pre(/^find/, function (next) {
  this.find({ restaurant: { $ne: null } });
  next();
}); */

// --- MODEL EXPORT ---
const User = mongoose.model('user', userSchema);

module.exports = User;
