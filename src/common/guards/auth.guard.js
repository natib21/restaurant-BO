const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const catchAsync = require('../../../utils/catchAsync');
const AppError = require('../errors');
const User = require('../../../models/userModel');
const { loadEnv } = require('../../config/env');

const verifyJwt = promisify(jwt.verify);

function resolveBranchId(branch) {
  if (!branch) return null;
  if (Array.isArray(branch)) {
    const first = branch[0];
    return first?._id?.toString() ?? first?.toString() ?? null;
  }
  return branch._id?.toString() ?? branch.toString();
}

function branchIdsInclude(userBranch, decodedBranch) {
  if (!decodedBranch) return true;
  if (!userBranch) return false;
  if (Array.isArray(userBranch)) {
    return userBranch.some(b => (b._id ?? b).toString() === decodedBranch);
  }
  return userBranch.toString() === decodedBranch;
}

function syncStaffContext(req) {
  if (!req.ctx) return;
  req.ctx.actorType = 'staff';
  req.ctx.actorId = req.user._id;
  req.ctx.merchantId = req.user.merchant?._id ?? req.user.merchant;
  const branchId = resolveBranchId(req.user.branch);
  if (branchId) req.ctx.branchId = branchId;
}

/**
 * Verify JWT and attach req.user
 */
const protect = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) return next(new AppError('You are not logged in!', 401));

  let decoded;
  try {
    const env = loadEnv();
    decoded = await verifyJwt(token, env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401));
    }
    return next(new AppError('Invalid token. Please log in again.', 401));
  }

  const currentUser = await User.findById(decoded.id);
  if (!currentUser) return next(new AppError('This user no longer exists.', 401));
  if (!currentUser.isActive) return next(new AppError('Your account has been deactivated.', 403));

  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('Password changed. Please log in again.', 401));
  }

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

  if (decoded.branch && !branchIdsInclude(currentUser.branch, decoded.branch)) {
    return next(
      new AppError('You have been reassigned to a different branch. Please log in again.', 401)
    );
  }

  await currentUser.populate([
    {
      path: 'role',
      select: 'name tasks isSystemRole',
      populate: { path: 'tasks', select: 'name endpoint method description isMerchant' },
    },
    { path: 'merchant', select: 'businessName status mode' },
    { path: 'branch', select: 'name branchCode shortCode isMain isActive' },
  ]);

  req.user = currentUser;
  syncStaffContext(req);
  next();
});

function convertUrlToPattern(url) {
  if (!url) return '';
  return url.replace(/\/$/, '').replace(/[a-fA-F0-9]{24}/g, ':id');
}

const PUBLIC_ROUTES = [
  { path: /^\/api\/v1\/user\/signup$/, method: 'POST' },
  { path: /^\/api\/v1\/user\/login$/, method: 'POST' },
  { path: /^\/api\/v1\/user\/social-login$/, method: 'POST' },
  { path: /^\/api\/v1\/user\/forgotPassword$/, method: 'POST' },
  { path: /^\/api\/v1\/user\/resetPassword\/[^/]+$/, method: 'PATCH' },
  { path: /^\/health$/, method: 'GET' },
  { path: /^\/health\/ready$/, method: 'GET' },
];

const restrictTo = () =>
  catchAsync(async (req, res, next) => {
    const fullUrl = req.originalUrl.replace(/\/$/, '');
    const httpMethod = req.method.toUpperCase();
    const user = req.user;

    if (!user) return next(new AppError('Authentication required', 401));

    const isPublic = PUBLIC_ROUTES.some(
      r => (!r.method || r.method === httpMethod) && r.path.test(fullUrl)
    );
    if (isPublic) return next();

    const { role } = user;

    if (role && (role.name === 'SUPER-ADMIN' || role.isSystemRole === true)) {
      return next();
    }

    if (!Array.isArray(role?.tasks) || role.tasks.length === 0) {
      return next(new AppError('No permissions assigned to your role', 403));
    }

    const requestPattern = convertUrlToPattern(fullUrl);

    const hasAccess = role.tasks.some(task => {
      const taskEndpoint = (task.endpoint || '').trim();
      if (!taskEndpoint) return false;

      const methodMatch =
        !task.method || task.method === '*' || task.method.toUpperCase() === httpMethod;
      if (!methodMatch) return false;

      const cleanTaskEndpoint = taskEndpoint.replace(/\/$/, '');
      if (requestPattern === cleanTaskEndpoint) return true;

      if (cleanTaskEndpoint.includes(':') || cleanTaskEndpoint.includes('*')) {
        const taskRegex = new RegExp(
          '^' +
            cleanTaskEndpoint
              .replace(/:[^\/]+/g, '[^/]+')
              .replace(/\*/g, '.*')
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
  });

module.exports = { protect, restrictTo, resolveBranchId };
