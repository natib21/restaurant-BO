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
    required: [true, 'Please confirm your password'],
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
    lowercase: true,
    validate: {
      validator: function (value) {
        // Only validate email format if email is provided
        return !value || validator.isEmail(value);
      },
      message: 'Please provide a valid email',
    },
    sparse: true, // allows multiple nulls
  },
  emailConfirmed: {
    type: Boolean,
    default: false,
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
  branch: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Branch',
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
const User = mongoose.model('User', userSchema);

module.exports = User;
