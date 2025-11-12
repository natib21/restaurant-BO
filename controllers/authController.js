const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('../utils/appError');
const { promisify } = require('util');
const mongoose = require('mongoose');
const Merchant = require('../models/merchantModel');
const Task = require('../models/taskModel');
const Role = require('../models/roleModel');

const signToken = user => {
  console.log('user : -', user);
  if (!user || !user._id  ) {
    throw new AppError('Invalid user for token generation', 500);
  }
  const payload = { id: user._id };
  if (user.merchant && user.merchant._id) {
    payload.merchant = user.merchant._id.toString();
  }
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE_IN }
  );
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user);

  const cookieOptions = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
    // secure: true,
    httpOnly: true,
    sameSite: 'strict',
  };
  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;
  res.cookie('jwt', token, cookieOptions);
  // Remove the password from the output
  user.password = undefined;
  user.passwordConfirm = undefined;
  user.merchant = undefined;
  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};
exports.signup = catchAsync(async (req, res, next) => {
  const { firstName, lastName, phone, email, business, password, passwordConfirm } = req.body;

  if (!firstName || !lastName || !phone || !email || !business || !password || !passwordConfirm) {
    return next(new AppError('Please provide all required fields', 400));
  }
  if (password !== passwordConfirm) {
    return next(new AppError('Passwords do not match', 400));
  }

  const [existingUser, existingMerchant] = await Promise.all([
    User.findOne({ phone }),
    Merchant.findOne({ businessName: business }),
  ]);

  if (existingUser) {
    return next(new AppError('Phone number already registered', 400));
  }
  if (existingMerchant) {
    return next(new AppError('A business with that name already exists.', 400));
  }

  const newMerchant = await Merchant.create({
    businessName: business,
    status: 'pending',
    phone,
    mode: 'Test',
  });

  const existingSuperAdminRole = await Role.findOne({ name: 'SUPER-MERCHANT-ADMIN' });

  if (!existingSuperAdminRole) {
    return next(
      new AppError('Master "Super Merchant Admin" role template not found. Setup error.', 500)
    );
  }
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

  const finalUser = await User.findById(newUser._id).populate({
    path: 'role',
    select: 'name context description tasks',
    populate: {
      path: 'tasks',
      select: 'name description target method',
    },
  });
  if (newUser.role?.name !== 'SUPER-ADMIN') {
  populatedUser = await populatedUser.populate({
    path: 'merchant',
    select: 'businessName status mode'
  });
}
  createSendToken(finalUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  console.log(email, password);
  if (!email || !password) {
    return next(new AppError('Please provide Name or Password', 404));
  }
  const user = await User.findOne({ email }).select('+password');
  console.log(user);

  if (!user || !(await user.correctPassword(password, user.password)))
    return next(new AppError('Incorrect name or password', 401));

  const populatedUser = await User.findById(user._id).populate({
    path: 'role',
    select: 'name context description tasks',
    populate: {
      path: 'tasks',
      select: 'name endpoint method description',
    },
  });

  createSendToken(populatedUser, 200, res);
});

exports.protect = catchAsync(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('You are not logged in! Please log in.', 401));
  }

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  const currentUser = await User.findById(decoded.id)
    .populate({
      path: 'role',
      select: 'name context description tasks',
      populate: {
        path: 'tasks',
        select: 'name target method description',
      },
    })
    .populate({
      path: 'merchant',
      select: 'businessName status mode',
    });

  if (!currentUser) {
    return next(new AppError('User belonging to this token no longer exists.', 401));
  }

  if (
  currentUser.merchant &&
  decoded.merchant &&
  currentUser.merchant._id.toString() !== decoded.merchant
) {
  return next(new AppError('Token merchant mismatch. Please re-login.', 401));
}

  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('User recently changed password! Please log in again.', 401));
  }
  console.log(currentUser);

  if (currentUser.isActive === false) {
    return next(new AppError('Your account is inactive. Contact support.', 403));
  }

  req.user = currentUser;

  next();
});

// exports.restrictTo = (...roles) => {
//   return (req, res, next) => {
//     if (!roles.includes(req.user.role)) {
//       return next(
//         new AppError(
//           'You do Not have a permission to perform this action ',
//           403
//         )
//       );
//     }
//     next();
//   };
// };

function pathToRegex(path) {
  const cleanPath = path.replace(/\/$/, '');
  const regexStr = cleanPath
    .replace(/:[^\/]+/g, '([^/]+)') // :id → capture group
    .replace(/\//g, '\\/');
  return new RegExp(`^${regexStr}$`);
}

/**
 * restrictTo() - Dynamic RBAC Middleware
 * Supports:
 *   - Public routes
 *   - Basic role (limited access)
 *   - Dynamic task permissions with :id
 *   - Method matching (*, GET, POST, etc.)
 */
exports.restrictTo = () => {
  return (req, res, next) => {
    const fullUrl = req.originalUrl.replace(/\/$/, '');
    const httpMethod = req.method;
    const user = req.user;

    // 1. Authentication required
    if (!user) {
      return next(new AppError('Authentication required', 401));
    }

    const { role } = user;
     
    // 2. Public routes (no auth needed)
    const publicRoutes = [
      { method: 'POST', path: /^\/api\/user\/signup$/ },
      { method: 'POST', path: /^\/api\/user\/login$/ },
    ];

    const isPublic = publicRoutes.some(
      r => (!r.method || r.method === httpMethod) && r.path.test(fullUrl)
    );
    if (isPublic) return next();

    if (role && (role.name === 'SUPER-ADMIN' || role.isSystemRole === true)) {
      console.log('SUPER-ADMIN bypass: full access');
      return next();
    }

    // 3. Basic role: limited access
    if (!role || role.name === 'basics-role') {
      const basicAllowed = [
        { method: 'GET', path: /^\/api\/v1\/profile$/ },
        { method: 'GET', path: /^\/api\/v1\/orders$/ },
        { method: 'POST', path: /^\/api\/v1\/request-merchant-role$/ },
        { method: 'GET', path: /^\/api\/v1\/public\// },
      ];

      const hasAccess = basicAllowed.some(
        r => (!r.method || r.method === httpMethod) && r.path.test(fullUrl)
      );

      if (!hasAccess) {
        return next(
          new AppError('Basic users have limited access. Contact backoffice to upgrade.', 403)
        );
      }
      return next();
    }
 console.log("Full URL :- " +fullUrl)
 console.log("Method :- " +httpMethod)
    // 4. Dynamic task-based access (with :id support)
    if (!Array.isArray(role.tasks) || role.tasks.length === 0) {
      return next(new AppError('No task assigned to this role', 403));
    }

    const hasAccess = role.tasks.some(task => {
      const taskUrl = (task.target || '').replace(/\/$/, '').trim();
      if (!taskUrl) return false;

      // Method match: allow *, or exact
      const methodMatch = !task.method || task.method === '*' || task.method === httpMethod;

      if (!methodMatch) return false;

      // Convert task.target → regex and test
      let pathRegex;
      try {
        pathRegex = pathToRegex(taskUrl);
      } catch (e) {
        return false; // skip malformed
      }
      console.log("Full URL :- " +fullUrl)
      console.log("Taks URL :- " +taskUrl)
      console.log("Path to Regex URL :- " +pathRegex)
      return pathRegex.test(fullUrl);
    });

    if (!hasAccess) {
      return next(new AppError(`Access denied: ${role.name} → ${httpMethod} ${fullUrl}`, 403));
    }

    next();
  };
};

exports.adminResetPassword = catchAsync(async (req, res, next) => {
  const { phone, password, passwordConfirm } = req.body;

  if (!phone || !password || !passwordConfirm) {
    return next(new AppError('Please provide phone, password, and password confirmation', 400));
  }

  if (password !== passwordConfirm) {
    return next(new AppError('Passwords do not match', 400));
  }

  // Find the user to reset password for
  const user = await User.findOne({ phone });

  if (!user) {
    return next(new AppError('No user found with that phone number', 404));
  }

  // Update the user's password
  user.password = password;
  user.passwordConfirm = undefined;

  // Save the updated user document, which should trigger password hashing
  await user.save();

  /*   res.status(200).json({
    status: 'success',
    message: 'Password has been reset successfully!',
  }); */
  createSendToken(user, 200, res);
});

exports.changePassword = catchAsync(async (req, res, next) => {
  const { password, newPassword, confirmNewPassword } = req.body;
  if (!newPassword || !password || !confirmNewPassword) {
    return next(new AppError('Please provide passwords', 404));
  }
  console.log(req.user.id);
  const user = await User.findOne({ _id: req.user.id }).select('+password');
  console.log(user);
  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect name or password', 401));
  }

  user.password = newPassword;
  user.passwordConfirm = confirmNewPassword;

  await user.save();

  /*   res.status(200).json({
    status: 'success',
    message: 'Password Successfully Changed',
  }); */
  createSendToken(user, 200, res);
});
