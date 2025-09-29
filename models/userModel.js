const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const historySchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  action: { type: String, enum: ['accepted', 'prepared', 'served'], required: true },
  timestamp: { type: Date, default: Date.now },
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
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' }, 
  roleName: { type: String, enum: ['super-admin', 'admin']}, // SaaS/global roles
  business: {
    type: String, // Temporary business name entered during signup
    required: [true, 'Business name is required'],
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Merchant',
    required: function() {
      // Required after signup (can enforce in backend logic)
      return false; // optional at signup, enforce in API after signup
    },
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
    default: false,
    // select: false,
  },
  photo: String,
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetTokenExpires: Date,
  history: [historySchema],
  

});


userSchema.pre('save', async function(next) {
  if (this.role) {
    const Role = mongoose.model('Role');
    const role = await Role.findById(this.role).populate('tasks');
    if (!role || !role.tasks.length) this.history = undefined;
  } else {
    this.history = undefined;
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
