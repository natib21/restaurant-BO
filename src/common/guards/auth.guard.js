const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const catchAsync = require('../../../utils/catchAsync');
const AppError = require('../errors');
const User = require('../../../models/userModel');
const { loadEnv } = require('../../config/env');
const { setUser } = require('../../../utils/request-context');

const verifyJwt = promisify(jwt.verify);

// ✅ MULTI-BRANCH FIX: Resolve "active" branch from token or user object
// For multi-branch users, defaults to first branch (or can be overridden via header)
// For single-branch users, returns that single branch
function resolveBranchId(branch, decodedBranches) {
  if (!branch && !decodedBranches) return null;
  
  // New format: multi-branch token with array of branch IDs
  if (Array.isArray(decodedBranches) && decodedBranches.length > 0) {
    return decodedBranches[0]; // Default to first branch for request scoping
  }
  
  // User object with branch array
  if (Array.isArray(branch)) {
    const first = branch[0];
    return first?._id?.toString() ?? first?.toString() ?? null;
  }
  
  // Fallback to single branch ID
  return branch._id?.toString() ?? branch.toString();
}

// ✅ MULTI-BRANCH FIX: Check if user's current branch array matches token's branch list
// Supports both old single-branch tokens (payload.branch) and new multi-branch tokens (payload.branches array)
function branchIdsInclude(userBranch, decodedBranch, decodedBranches) {
  if (!decodedBranch && !decodedBranches) return true;
  if (!userBranch) return false;
  
  const userBranchIds = Array.isArray(userBranch)
    ? userBranch.map(b => (b._id ?? b).toString())
    : [(userBranch._id ?? userBranch).toString()];
  
  // Check against new multi-branch token format (array)
  if (Array.isArray(decodedBranches) && decodedBranches.length > 0) {
    // User's branch assignment changed if arrays don't match
    // (exact same set of branches)
    if (decodedBranches.length !== userBranchIds.length) return false;
    return decodedBranches.every(b => userBranchIds.includes(b));
  }
  
  // Fallback to old single-branch token format for backward compatibility
  if (decodedBranch) {
    return userBranchIds.includes(decodedBranch);
  }
  
  return true;
}

function syncStaffContext(req) {
  if (!req.ctx) return;
  req.ctx.actorType = 'staff';
  req.ctx.actorId = req.user._id;
  req.ctx.merchantId = req.user.merchant?._id ?? req.user.merchant;
  const branchId = resolveBranchId(req.user.branch, req.user.decoded?.branches);
  if (branchId) req.ctx.branchId = branchId;
  
  // ✅ PHASE 1: Sync user to AsyncLocalStorage context
  setUser(req.user);
}

function setSyncedAuthContext(req) {
  // ✅ Set request-level properties for guards and handlers
  req.merchantId = req.user.merchant?._id ?? req.user.merchant;
  req.branchId = resolveBranchId(req.user.branch, req.user.decoded?.branches);
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

  if (decoded.branch && !branchIdsInclude(currentUser.branch, decoded.branch, decoded.branches)) {
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
    {
      path: 'merchant',
      select: 'businessName status mode isActive trialExpiresAt isSubscriptionActive features',
    },
    { path: 'branch', select: 'name branchCode shortCode isMain isActive' },
  ]);

  // ✅ Store decoded token on user for access to multi-branch info
  currentUser.decoded = decoded;

  req.user = currentUser;
  syncStaffContext(req);
  setSyncedAuthContext(req);
  next();
});

/**
 * Converts a URL path into a comparable pattern by normalizing dynamic
 * segments. Currently only MongoDB ObjectIds (24-char hex) are auto-detected
 * and replaced with `:id`.
 *
 * IMPORTANT: this does NOT normalize other dynamic segment types (numeric
 * IDs, slugs, UUIDs, etc). If a route has a non-ObjectId dynamic segment,
 * the corresponding `task.endpoint` stored in the DB must use an explicit
 * `:param` wildcard (see compileEndpointPattern below) rather than relying
 * on auto-detection here.
 */
function convertUrlToPattern(url) {
  if (!url) return '';
  return url.replace(/\/$/, '').replace(/[a-fA-F0-9]{24}/g, ':id');
}

/**
 * Safely compiles a stored task.endpoint pattern (e.g. "/api/v1/session/:id"
 * or "/api/v1/reports/*") into a RegExp.
 *
 * task.endpoint is admin-controlled data from the DB, not hardcoded in
 * source — so we must NOT pass it into `new RegExp()` after only a partial
 * replace. Doing that would let any regex metacharacter the admin UI allows
 * through (parens, +, |, nested quantifiers, etc.) be interpreted as regex
 * syntax, which is both a correctness risk (patterns matching unintended
 * routes) and a ReDoS risk (a malformed/malicious pattern hanging the event
 * loop).
 *
 * Fix: replace our two supported wildcard tokens (`:param`, `*`) with
 * placeholder markers FIRST, escape every remaining regex metacharacter,
 * then substitute the placeholders for their regex equivalents. This
 * guarantees only `:param` and `*` ever become regex syntax — everything
 * else in the stored string is treated as a literal character.
 */
function compileEndpointPattern(cleanTaskEndpoint) {
  const PARAM_TOKEN = '\u0000PARAM\u0000';
  const WILD_TOKEN = '\u0000WILD\u0000';

  const withTokens = cleanTaskEndpoint
    .replace(/:[^/]+/g, PARAM_TOKEN)
    .replace(/\*/g, WILD_TOKEN);

  const escaped = withTokens.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const finalPattern = escaped.split(PARAM_TOKEN).join('[^/]+').split(WILD_TOKEN).join('.*');

  return new RegExp('^' + finalPattern + '$');
}

/**
 * Per-role cache of compiled task matchers, so regex compilation happens
 * once per role update rather than once per request. Invalidated whenever
 * role.updatedAt changes (requires { timestamps: true } on the Role model).
 *
 * Note: this is an in-memory, per-instance cache. In a multi-instance
 * deployment there can be a brief staleness window right after a role is
 * updated on a different instance — acceptable here since permissions
 * changes aren't security-time-critical to the millisecond, but swap this
 * for a shared cache (Redis) if you need instant cross-instance invalidation.
 */
const roleTaskMatcherCache = new Map();

function getCompiledMatchers(role) {
  const roleId = role._id?.toString();
  const updatedAt = role.updatedAt?.getTime?.() ?? null;

  const cached = roleId ? roleTaskMatcherCache.get(roleId) : null;
  if (cached && cached.updatedAt === updatedAt) {
    return cached.matchers;
  }

  const matchers = (role.tasks || [])
    .filter(task => (task.endpoint || '').trim())
    .map(task => {
      const cleanEndpoint = task.endpoint.trim().replace(/\/$/, '');
      const isDynamic = cleanEndpoint.includes(':') || cleanEndpoint.includes('*');
      return {
        method: task.method,
        endpoint: cleanEndpoint,
        test: isDynamic ? compileEndpointPattern(cleanEndpoint) : null,
      };
    });

  if (roleId) {
    roleTaskMatcherCache.set(roleId, { updatedAt, matchers });
  }

  return matchers;
}

const PUBLIC_ROUTES = [
  { path: /^\/api\/v1\/auth\/signup$/, method: 'POST' },
  { path: /^\/api\/v1\/auth\/login$/, method: 'POST' },
  { path: /^\/api\/v1\/auth\/forgot-password$/, method: 'POST' },
  { path: /^\/api\/v1\/auth\/reset-password\/[^/]+$/, method: 'PATCH' },
  { path: /^\/api\/v1\/user\/signup$/, method: 'POST' },
  { path: /^\/api\/v1\/user\/login$/, method: 'POST' },
  { path: /^\/api\/v1\/user\/social-login$/, method: 'POST' },
  { path: /^\/api\/v1\/user\/forgotPassword$/, method: 'POST' },
  { path: /^\/api\/v1\/user\/resetPassword\/[^/]+$/, method: 'PATCH' },
  { path: /^\/api\/auth\/forgot-password$/, method: 'POST' },
  { path: /^\/api\/auth\/reset-password$/, method: 'POST' },
  { path: /^\/health$/, method: 'GET' },
  { path: /^\/health\/ready$/, method: 'GET' },
];

const restrictTo = () =>
  catchAsync(async (req, res, next) => {
    // Strip query string before pattern matching — req.originalUrl includes
    // ?query=params, which would otherwise never match a stored endpoint
    // pattern or the PUBLIC_ROUTES regexes. req.query is untouched by this;
    // your route handlers still receive query params normally.
    const fullUrl = req.originalUrl.split('?')[0].replace(/\/$/, '');
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
      return next(
        new AppError(
          'This role has no permissions configured yet. Contact your administrator.',
          403
        )
      );
    }

    const requestPattern = convertUrlToPattern(fullUrl);
    const matchers = getCompiledMatchers(role);

    const hasAccess = matchers.some(m => {
      const methodMatch = !m.method || m.method === '*' || m.method.toUpperCase() === httpMethod;
      if (!methodMatch) return false;

      if (!m.test) return requestPattern === m.endpoint;
      return m.test.test(requestPattern);
    });

    if (!hasAccess) {
      return next(new AppError(`Access denied: ${httpMethod} ${fullUrl}`, 403));
    }

    next();
  });

module.exports = { protect, restrictTo, resolveBranchId };