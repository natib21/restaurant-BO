const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const catchAsync = require('./../utils/catchAsync'); // Wraps async functions to catch errors automatically
const AppError = require('../utils/appError'); // Custom error class for operational errors
const { promisify } = require('util');
const Merchant = require('../models/merchantModel');
const Branch = require('../models/branchModel');
const Task = require('../models/taskModel');
const Role = require('../models/roleModel');
const sendEmail = require('./../utils/email');
const crypto = require('crypto');
// const MenuGroup = require('../models/menuGroupModel');
const MenuGroup = require('../models/menuGroupModel');

/**
 * Generates a JWT token for a user
 * Payload includes: user ID and optionally merchant ID
 */

const signToken = user => {
  if (!user || !user._id) {
    throw new AppError('Invalid user for token generation', 500);
  }

  const payload = {
    id: user._id.toString(),
  };
  // Add merchant if exists
  if (user.merchant?._id) {
    payload.merchant = user.merchant._id.toString();
  }
  // CRITICAL: Add current branch to token
  if (user.branch?._id) {
    payload.branch = user.branch._id.toString();
  }
  // Optional: Add role name for quick checks
  if (user.role?.name) {
    payload.role = user.role.name;
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE_IN || '90d',
  });
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
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  };

  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true; // Only send over HTTPS in prod

  res.cookie('jwt', token, cookieOptions);

  // Clean user object before sending
  user.password = undefined;
  user.passwordConfirm = undefined;

  res.status(statusCode).json({
    status: 'success',
    data: { user },
  });
};

/**
 * SIGNUP - Merchant Admin Registration
 * Creates a new merchant + first super admin user for that business
 */
exports.signup = catchAsync(async (req, res, next) => {
  // Validate BEFORE starting session
  const {
    firstName,
    lastName,
    phone,
    email,
    business: businessName,
    password,
    passwordConfirm,
  } = req.body;

  if (
    !firstName ||
    !lastName ||
    !phone ||
    !email ||
    !businessName ||
    !password ||
    !passwordConfirm
  ) {
    return next(new AppError('All fields are required', 400));
  }
  if (password !== passwordConfirm) {
    return next(new AppError('Passwords do not match', 400));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Duplicate checks...
    const [existingUser, existingMerchant] = await Promise.all([
      User.findOne({ $or: [{ phone }, { email }] }).session(session),
      Merchant.findOne({ $or: [{ businessName }, { phone }] }).session(session),
    ]);

    if (existingUser) throw new AppError('Phone or email already in use', 400);
    if (existingMerchant) throw new AppError('Business name or phone already exists', 400);

    // Merchant create
    const merchant = await Merchant.create(
      [
        {
          businessName,
          slug: businessName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, ''),
          phone,
          status: 'pending',
          mode: 'Test',
          branchCounter: 1,
        },
      ],
      { session }
    );

    const newMerchant = merchant[0];

    // Branch create
    const branch = await Branch.create(
      [
        {
          merchant: newMerchant._id,
          name: `${businessName} - Main Branch`,
          phone,
          isMain: true,
          isActive: true,
          branchCode: 'BR-001',
          location: {
            type: 'Point',
            coordinates: [38.7578, 9.025],
            city: 'Addis Ababa',
            formattedAddress: `${businessName} - Main Branch, Addis Ababa, Ethiopia`,
          },
        },
      ],
      { session }
    );
    const mainBranch = branch[0];

    // Role
    const superRole = await Role.findOne({ name: 'SUPER-MERCHANT-ADMIN' }).session(session);
    if (!superRole) throw new AppError('System role not found.', 500);

    // User create
    const user = await User.create(
      [
        {
          firstName,
          lastName,
          phone,
          email: email.toLowerCase(),
          password,
          passwordConfirm,
          merchant: newMerchant._id,
          branch: [mainBranch._id],
          role: superRole._id,
          emailConfirmed: false,
        },
      ],
      { session }
    );

    const newUser = user[0];

    // MenuGroup create
    await MenuGroup.create(
      [
        {
          merchant: newMerchant._id,
          branches: [mainBranch._id], // Important: assign to the main branch
          name: 'All Items (System Default)',
          description: 'Hidden system group for all menu items. Used for public fallback.',
          visibility: 'always',
          priority: -100,
          isSystemDefault: true,
          isAlcoholMenu: false,
          items: [], // Start empty — items will be added when creating menu items
        },
      ],
      { session }
    );

    await session.commitTransaction();
    // session.endSession();

    // Populate
    const populatedUser = await User.findById(newUser._id)
      .select('-password -__v')
      .populate({
        path: 'role',
        select: 'name description',
        populate: { path: 'tasks', select: 'name endpoint method description' },
      })
      .populate('merchant', 'businessName slug status mode branchCounter')
      .populate('branch', 'name branchCode shortCode isMain publicUrl');

    createSendToken(populatedUser, 201, res);
  } catch (err) {
    await session.abortTransaction();
    if (err instanceof AppError) return next(err);
    return next(new AppError('Signup failed. Please try again later.', 500));
  } finally {
    session.endSession();
  }
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

  // Check user exists + password correct
  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  const populatedUser = await User.findById(user._id)
    .populate({
      path: 'role',
      select: 'name endpoint description tasks',
      populate: {
        path: 'tasks',
        select: 'name endpoint method description',
      },
    })
    .populate({
      path: 'merchant',
      select: 'businessName slug status mode branchCounter brandColor logo',
    })
    .populate({
      path: 'branch',
      select: 'name location isMain merchant isActive',
    });

  createSendToken(populatedUser, 200, res);
});

exports.logout = (req, res) => {
  res.cookie('jwt', '', {
    expires: new Date(0),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully',
  });
};

/**
 * PROTECT - Middleware to verify JWT and load current user
 * Runs on all protected routes
 */
exports.protect = catchAsync(async (req, res, next) => {
  let token;

  // 1. Get token
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }
  if (!token) {
    return next(new AppError('You are not logged in!', 401));
  }

  // 2. Verify token
  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401));
    }
    return next(new AppError('Invalid token. Please log in again.', 401));
  }

  // 3. Check user exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(new AppError('This user no longer exists.', 401));
  }

  // 4. Check if account is active
  if (!currentUser.isActive) {
    return next(new AppError('Your account has been deactivated.', 403));
  }

  // 5. Password changed after token issued?
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('Password changed. Please log in again.', 401));
  }

  // 6. CRITICAL: Merchant context validation
  if (decoded.merchant) {
    if (!currentUser.merchant) {
      return next(new AppError('You no longer belong to any business.', 403));
    }
    if (currentUser.merchant.toString() !== decoded.merchant) {
      return next(
        new AppError('You have been moved to a different business. Please log in again.', 401)
      );
    }
  }

  // 7. CRITICAL: Branch context validation (for BRANCH-MANAGER)
  if (decoded.branch) {
    if (!currentUser.branch) {
      return next(new AppError('You are not assigned to any branch.', 403));
    }
    if (currentUser.branch.toString() !== decoded.branch) {
      return next(
        new AppError('You have been reassigned to a different branch. Please log in again.', 401)
      );
    }
  }

  // 8. Populate only what you need (performance + security)
  await currentUser.populate([
    {
      path: 'role',
      select: 'name tasks',
      populate: { path: 'tasks', select: 'name endpoint method description isMerchant' },
    },
    { path: 'merchant', select: 'businessName status mode' },
    { path: 'branch', select: 'name branchCode shortCode isMain isActive' },
  ]);

  // 9. Attach to request
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

    const hasAccess = role.tasks.some(task => {
      const taskEndpoint = (task.endpoint || '').trim();
      if (!taskEndpoint) return false;

      // Match HTTP method
      const methodMatch =
        !task.method || task.method === '*' || task.method.toUpperCase() === httpMethod;
      if (!methodMatch) return false;

      const cleanTaskEndpoint = taskEndpoint.replace(/\/$/, '');

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

exports.acceptInvitation = catchAsync(async (req, res, next) => {
  const { token, name, password, passwordConfirm } = req.body;

  const invitation = await Invitation.findOne({
    token,
    used: false,
    expiresAt: { $gt: Date.now() },
  }).populate('branch role');

  if (!invitation) {
    return next(new AppError('Invalid or expired invitation', 400));
  }

  // Check if user already exists with this email
  let user = await User.findOne({ email: invitation.email });

  if (user) {
    // Existing user → just assign branch + role
    if (user.merchant.toString() !== invitation.branch.merchant.toString()) {
      return next(new AppError('You already belong to another business', 400));
    }
  } else {
    // New user → create
    user = await User.create({
      name,
      email: invitation.email,
      password,
      passwordConfirm,
      merchant: invitation.branch.merchant,
      role: invitation.role._id,
      branch: invitation.branch._id,
      emailConfirmed: true,
    });
  }

  // Assign role + branch
  user.role = invitation.role._id;
  user.branch = invitation.branch._id;
  await user.save({ validateBeforeSave: false });

  // Mark invitation as used
  await invitation.markAsUsed(user._id);

  // Login user
  createSendToken(user, 200, res);
});
