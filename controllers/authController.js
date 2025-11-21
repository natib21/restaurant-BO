const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const catchAsync = require('./../utils/catchAsync'); // Wraps async functions to catch errors automatically
const AppError = require('../utils/appError'); // Custom error class for operational errors
const { promisify } = require('util');
const mongoose = require('mongoose');
const Merchant = require('../models/merchantModel');
const Task = require('../models/taskModel');
const Role = require('../models/roleModel');
const sendEmail = require('./../utils/email');
const crypto = require('crypto');
const MenuGroup = require('../models/menuGroupModel')

/**
 * Generates a JWT token for a user
 * Payload includes: user ID and optionally merchant ID
 */


const signToken = user => {
  console.log('user : -', user);
  if (!user || !user._id) {
    throw new AppError('Invalid user for token generation', 500);
  }

  const payload = { id: user._id };
  if (user.merchant && user.merchant._id) {
    payload.merchant = user.merchant._id.toString(); // Attach merchant context to token
  }

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE_IN } // e.g., '90d'
  );
};

/**
 * Sends JWT token in response + sets secure HTTP-only cookie
 * Also removes sensitive fields (password, merchant ref) from response
 */
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user);

  const cookieOptions = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
    httpOnly: true, // Prevents XSS attacks (JS can't access cookie)
    sameSite: 'strict', // Protects against CSRF
  };

  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true; // Only send over HTTPS in prod

  res.cookie('jwt', token, cookieOptions);

  // Clean user object before sending
  user.password = undefined;
  user.passwordConfirm = undefined;
  user.merchant = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: { user },
  });
};

/**
 * SIGNUP - Merchant Admin Registration
 * Creates a new merchant + first super admin user for that business
 */
exports.signup = catchAsync(async (req, res, next) => {
  const { firstName, lastName, phone, email, business, password, passwordConfirm } = req.body;

  // Validate all required fields
  if (!firstName || !lastName || !phone || !email || !business || !password || !passwordConfirm) {
    return next(new AppError('Please provide all required fields', 400));
  }
  if (password !== passwordConfirm) {
    return next(new AppError('Passwords do not match', 400));
  }

  // Check for duplicates
  const [existingUser, existingMerchant] = await Promise.all([
    User.findOne({ phone }),
    Merchant.findOne({ businessName: business }),
  ]);

  if (existingUser) return next(new AppError('Phone number already registered', 400));
  if (existingMerchant) return next(new AppError('A business with that name already exists.', 400));

  // Create new merchant account (starts in 'pending' and 'Test' mode)
  const newMerchant = await Merchant.create({
    businessName: business,
    status: 'pending',
    phone,
    mode: 'Test',
  });

  // Find the master SUPER-MERCHANT-ADMIN role template
  const existingSuperAdminRole = await Role.findOne({ name: 'SUPER-MERCHANT-ADMIN' });
  if (!existingSuperAdminRole) {
    return next(
      new AppError('Master "Super Merchant Admin" role template not found. Setup error.', 500)
    );
  }

  // Create the first admin user linked to this merchant
  const newUser = await User.create({
    firstName,
    lastName,
    phone,
    email,
    password,
    passwordConfirm,
    merchant: newMerchant._id,
    role: existingSuperAdminRole._id,
  });

  await MenuGroup.create({
        merchant: newMerchant._id,
        name: 'All Items (System Default)',
        description: 'Hidden system group for all menu items. Used for public fallback.',
        priority: -100, // Lowest priority
        visibility: 'always',
        isSystemDefault: true, // Marker for system management
        items: [] // Starts empty
    });
  // Fetch full user with populated role + tasks
  let finalUser = await User.findById(newUser._id).populate({
    path: 'role',
    select: 'name endpoint description tasks',
    populate: { path: 'tasks', select: 'name description target method' },
  });

  // Bug Fix Note: This block has a typo (`populatedUser` not defined)
  // Should be `finalUser` instead
  if (newUser.role?.name !== 'SUPER-ADMIN') {
    finalUser = await finalUser.populate({
      path: 'merchant',
      select: 'businessName status mode',
    });
  }

  createSendToken(finalUser, 201, res);
});

/**
 * LOGIN - Authenticate user with email & password
 */
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email or password', 400));
  }

  // Get user with password (it's excluded by default)
  const user = await User.findOne({ email }).select('+password');
  const users = await User.find();
  console.log(user);
  // Check user exists + password correct
  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  // Populate role and permissions
  const populatedUser = await User.findById(user._id).populate({
    path: 'role',
    select: 'name endpoint description tasks',
    populate: {
      path: 'tasks',
      select: 'name endpoint method description',
    },
  });

  createSendToken(populatedUser, 200, res);
});

/* ──────────────────────── SOCIAL / GUEST LOGIN ──────────────────────── */
exports.socialOrGuestLogin = catchAsync(async (req, res, next) => {
  const { fullName, platform, token, phone, tableNumber } = req.body;
  const merchantId = req.merchantId; // <-- your multi-tenant middleware must set this

  if (!fullName) return next(new AppError('Name is required', 400));

  let customerData = {
    merchant: merchantId,
    fullName: fullName.trim(),
    phone,
    tableNumber,
    source: 'guest',
  };

  // ────── FACEBOOK ──────
  if (platform === 'facebook' && token) {
    const fbRes = await axios.get(
      `https://graph.facebook.com/v20.0/me?fields=id,name,username,email&access_token=${token}`
    );
    const fb = fbRes.data;
    if (!fb.id) return next(new AppError('Invalid Facebook token', 401));

    customerData = {
      ...customerData,
      source: 'facebook',
      facebook: { id: fb.id, username: fb.username || fb.name },
    };
  }

  // ────── TIKTOK ──────
  if (platform === 'tiktok' && token) {
    const ttRes = await axios.get('https://open-api.tiktok.com/v2/user/info/', {
      params: { fields: 'open_id,username,display_name', access_token: token },
    });
    const tt = ttRes.data.data.user;
    if (!tt.open_id) return next(new AppError('Invalid TikTok token', 401));

    customerData = {
      ...customerData,
      source: 'tiktok',
      tiktok: { id: tt.open_id, username: tt.username || tt.display_name },
    };
  }

  // ────── UPSERT CUSTOMER (single model) ──────
  const filter = { merchant: merchantId };
  if (customerData.source === 'facebook') filter['facebook.id'] = customerData.facebook.id;
  else if (customerData.source === 'tiktok') filter['tiktok.id'] = customerData.tiktok.id;
  else filter.fullName = customerData.fullName; // guest – simple name match (you can add phone later)

  const customer = await Customer.findOneAndUpdate(filter, customerData, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  // ────── RETURN SAME JWT AS ADMIN USERS ──────
  // we embed the Customer _id as the JWT subject so protect() can load it
  const fakeUser = {
    _id: customer._id,
    merchant: { _id: merchantId },
    // dummy role so protect() does not break – you can add a real role later
    role: { name: 'CUSTOMER', tasks: [] },
  };
  createSendToken(fakeUser, 200, res);
});

/**
 * PROTECT - Middleware to verify JWT and load current user
 * Runs on all protected routes
 */
exports.protect = catchAsync(async (req, res, next) => {
  let token;

  // 1. Extract token from Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('You are not logged in! Please log in.', 401));
  }

  // 2. Verify token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3. Find user and populate role + merchant
  const currentUser = await User.findById(decoded.id)
    .populate({
      path: 'role',
      select: 'name context description tasks',
      populate: { path: 'tasks', select: 'name endpoint method description' },
    })
    .populate({
      path: 'merchant',
      select: 'businessName status mode',
    });

  if (!currentUser) {
    return next(new AppError('User belonging to this token no longer exists.', 401));
  }

  // 4. Prevent token reuse after merchant change
  if (
    currentUser.merchant &&
    decoded.merchant &&
    currentUser.merchant._id.toString() !== decoded.merchant
  ) {
    return next(new AppError('Token merchant mismatch. Please re-login.', 401));
  }

  // 5. Check if password was changed after token issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('User recently changed password! Please log in again.', 401));
  }

  // 6. Block inactive accounts
  if (currentUser.isActive === false) {
    return next(new AppError('Your account is inactive. Contact support.', 403));
  }

  // Attach user to request
  req.user = currentUser;
  next();
});

function convertUrlToPattern(url) {
  if (!url) return '';
  return url
    .replace(/\/$/, '') // remove trailing slash
    .replace(/[a-fA-F0-9]{24}/g, ':id'); // ← ONLY THIS: real ID → :id
}

/**
 * RESTRICT TO - FINAL VERSION (Exactly what you asked for)
 *
 * We modify ONLY the incoming URL
 * We NEVER modify the task.endpoint from the database
 * Direct string or regex comparison
 */
exports.restrictTo = () => {
  return (req, res, next) => {
    const fullUrl = req.originalUrl.replace(/\/$/, '');
    const httpMethod = req.method.toUpperCase();
    const user = req.user;

    if (!user) {
      return next(new AppError('Authentication required', 401));
    }

    const { role } = user;

    // Array of routes that are accessible WITHOUT any authentication or RBAC check.
    const publicRoutes = [
      // Merchant Registration & Login
      { path: /^\/api\/v1\/users\/signup$/, method: 'POST' },
      { path: /^\/api\/v1\/users\/login$/, method: 'POST' },

      // Social/Guest Login (assuming this route is /api/v1/users/social-login)
      { path: /^\/api\/v1\/users\/social-login$/, method: 'POST' },

      // Password Reset
      { path: /^\/api\/v1\/users\/forgotPassword$/, method: 'POST' },
      { path: /^\/api\/v1\/users\/resetPassword\/[^/]+$/, method: 'PATCH' }, // Matches resetPassword/:token

      // Public Menu Endpoints (if they exist, e.g., to fetch a menu)
      // { path: /^\/api\/v1\/public\/menu\/[^/]+$/, method: 'GET' }, // Example
    ];
    const isPublic = publicRoutes.some(
      r => (!r.method || r.method === httpMethod) && r.path.test(fullUrl)
    );
    if (isPublic) return next();

    if (role && (role.name === 'SUPER-ADMIN' || role.isSystemRole === true)) {
      console.log('SUPER-ADMIN bypass: full access');
      return next();
    }

    // MAIN RBAC
    if (!Array.isArray(role.tasks) || role.tasks.length === 0) {
      return next(new AppError('No permissions assigned to your role', 403));
    }

    // THIS IS THE ONLY THING WE MODIFY: the incoming URL
    const requestPattern = convertUrlToPattern(fullUrl);
    console.log(requestPattern);
    const hasAccess = role.tasks.some(task => {
      const taskEndpoint = (task.endpoint || '').trim();
      if (!taskEndpoint) return false;

      // Match HTTP method
      const methodMatch =
        !task.method || task.method === '*' || task.method.toUpperCase() === httpMethod;
      if (!methodMatch) return false;

      const cleanTaskEndpoint = taskEndpoint.replace(/\/$/, '');
      console.log(cleanTaskEndpoint);
      // OPTION 1: Exact match (after converting real IDs to :id)
      if (requestPattern === cleanTaskEndpoint) {
        return true;
      }

      // OPTION 2: Task uses :id or * → use regex (but task endpoint is untouched)
      if (cleanTaskEndpoint.includes(':') || cleanTaskEndpoint.includes('*')) {
        const taskRegex = new RegExp(
          '^' +
            cleanTaskEndpoint
              .replace(/:[^\/]+/g, '[^/]+') // :id → match any segment
              .replace(/\*/g, '.*') // * → wildcard
              .replace(/\//g, '\\/') +
            '$'
        );
        return taskRegex.test(requestPattern);
      }

      return false;
    });

    if (!hasAccess) {
      return next(new AppError(`Access denied: ${httpMethod} ${fullUrl}`, 403));
    }

    next();
  };
};

/**
 *  RESET PASSWORD - Reset any user's password by phone (admin only)
 */
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new AppError('Please provide email address', 400));
  }

  const user = await User.findOne({ email });
  if (!user) {
    return next(new AppError('No user found with that email address', 404));
  }
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const resetURL = `${req.protocol}://${req.get('host')}/api/v1/user/resetPassword/${resetToken}`;
  const message = `Forgot your password ? Submit a PATCH request with your new password and passwordConfirm
    to: ${resetURL} if you didn't forget your password, please ignore this email`;
  try {
    await sendEmail({
      email: user.email,
      subject: 'Your password reset token (valid for 10min)',
      message,
    });

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(new AppError('there was an error sending the email. try again later '), 500);
  }

  // createSendToken(user, 200, res); // Logs them in after reset
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetTokenExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetTokenExpires = undefined;

  await user.save();
  createSendToken(user, 200, res);
});

/**
 * CHANGE PASSWORD - Logged-in user changes their own password
 */
exports.changePassword = catchAsync(async (req, res, next) => {
  const { password, newPassword, confirmNewPassword } = req.body;

  if (!newPassword || !password || !confirmNewPassword) {
    return next(new AppError('Please provide all passwords', 400));
  }

  const user = await User.findById(req.user.id).select('+password');

  // Verify current password
  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect current password', 401));
  }

  // Update to new password
  user.password = newPassword;
  user.passwordConfirm = confirmNewPassword;
  await user.save();

  createSendToken(user, 200, res); // Issue new token
});
