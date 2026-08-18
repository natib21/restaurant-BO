// utils/request-context.js
// ✅ PHASE 0: Request context propagation using native AsyncLocalStorage
const { AsyncLocalStorage } = require('async_hooks');
const { v4: uuidv4 } = require('uuid');

const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Get the current request context (user, correlationId, etc.)
 * Available anywhere in the async call chain after middleware sets it
 */
function getContext() {
  return asyncLocalStorage.getStore();
}

/**
 * Get the current user from context
 * @returns {Object|null} User object or null if not authenticated
 */
function getCurrentUser() {
  const context = getContext();
  return context?.user || null;
}

/**
 * Get the current correlation ID for request tracing
 * @returns {string|null} UUID correlation ID
 */
function getCorrelationId() {
  const context = getContext();
  return context?.correlationId || null;
}

/**
 * Get the current request object (for IP, user-agent, etc.)
 * @returns {Object|null} Express request object
 */
function getRequest() {
  const context = getContext();
  return context?.req || null;
}

/**
 * Middleware to initialize request context at the start of each request
 * Must be registered early in the middleware chain
 */
function initializeContext(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  
  // Store correlation ID in response headers for client-side tracing
  res.setHeader('X-Correlation-ID', correlationId);
  
  const context = {
    correlationId,
    req,
    user: req.user || null, // Will be populated by auth middleware
    startTime: Date.now(),
  };
  
  asyncLocalStorage.run(context, () => {
    next();
  });
}

/**
 * Update context with authenticated user (called by auth middleware)
 * @param {Object} user - Authenticated user object
 */
function setUser(user) {
  const context = getContext();
  if (context) {
    context.user = user;
  }
}

module.exports = {
  initializeContext,
  getContext,
  getCurrentUser,
  getCorrelationId,
  getRequest,
  setUser,
};
