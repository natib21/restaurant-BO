const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const historySchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order', // Reference to the Order model
  },
  timestamp: {
    type: Date,
    default: Date.now, // Record when the order was accepted
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
    required: [true, 'Please provide a password'],
    validate: {
      validator: function (el) {
        return el === this.password;
      },
      message: 'password are not the same',
    },
  },
  role: {
    type: String,
    enum: ['admin', 'waiter', 'kitchen', 'cashier', 'manager'],
    required: true,
    default: 'waiter',
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
  isActive: {
    type: Boolean,
    default: true,
    // select: false,
  },
  photo: String,
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetTokenExpires: Date,
  history: {
    type: [historySchema],
    validate: {
      validator: function (value) {
        // Allow history to be defined only for waiter or kitchen roles
        return this.role === 'waiter' || this.role === 'kitchen'
          ? true
          : !value.length;
      },
      message: 'History is allowed only for waiters and kitchen staff',
    },
  },
});
userSchema.pre('save', function (next) {
  // Remove history if the role is not waiter or kitchen
  if (this.role !== 'waiter' && this.role !== 'kitchen') {
    this.history = undefined; // Remove the history field from the document
  }
  next();
});
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $exists: true, $ne: null } },
  }
);
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);

  this.passwordConfirm = undefined;
  next();
});

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimeStamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );

    return JWTTimestamp < changedTimeStamp;
  }

  return false;
};
/* userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  console.log({ resetToken }, this.passwordResetToken);
  this.passwordResetTokenExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
}; */
userSchema.pre(/^find/, function (next) {
  this.find({ isActive: { $ne: false } });
  next();
});
const User = mongoose.model('user', userSchema);

module.exports = User;
