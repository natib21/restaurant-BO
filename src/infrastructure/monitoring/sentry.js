/**
 * @file src/infrastructure/monitoring/sentry.js
 * @description Sentry error tracking initialization and configuration.
 * 
 * Usage:
 *   In src/server.js (very first line, before other code):
 *     const { initSentry } = require('./infrastructure/monitoring/sentry');
 *     initSentry();
 * 
 *   In src/app/create-app.js (after helmet, before routes):
 *     const { sentryRequestHandler, sentryErrorHandler } = require('../../infrastructure/monitoring/sentry');
 *     app.use(sentryRequestHandler);
 *     // ... all routes ...
 *     app.use(sentryErrorHandler);
 */

const Sentry = require('@sentry/node');
const { loadEnv } = require('../../config/env');

/**
 * Initialize Sentry — call this at the very start of src/server.js
 * This must happen before other code loads to capture unhandled errors early.
 */
function initSentry() {
  const env = loadEnv();
  const dsn = env.SENTRY_DSN;

  // Skip Sentry if DSN not configured
  if (!dsn) {
    console.warn(
      '[Sentry] SENTRY_DSN not set in config.env — error tracking disabled. ' +
      'Set SENTRY_DSN to a valid Sentry project URL to enable.'
    );
    return;
  }

  Sentry.init({
    dsn,
    environment: env.NODE_ENV || 'development',
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    attachStacktrace: true,
    maxBreadcrumbs: 50,
    // Release version (optional — set via CI/CD or package.json)
    release: process.env.APP_VERSION || undefined,
    // Tag errors with environment
    initialScope: {
      tags: {
        environment: env.NODE_ENV || 'development',
        service: 'restaurant-bo-backend',
      },
    },
  });

  // Capture unhandled rejections and exceptions at the global level
  Sentry.captureConsoleIntegration({
    levels: ['error', 'warn'],
  });

  console.log(
    `[Sentry] Initialized for environment: ${env.NODE_ENV || 'development'}. ` +
    `DSN: ${dsn.replace(/.*\/(\d+)@/, 'xxx/$1@')}`
  );
}

/**
 * Express middleware: Request handler
 * Should be added EARLY in the middleware stack (after helmet, before routes)
 * to capture request context for all errors that occur within route handlers.
 * 
 * If Sentry is not initialized (no SENTRY_DSN), returns a no-op middleware.
 */
const sentryRequestHandler = (() => {
  try {
    return Sentry.Handlers?.requestHandler?.() || ((req, res, next) => next());
  } catch (err) {
    // If Sentry not initialized, return no-op middleware
    return (req, res, next) => next();
  }
})();

/**
 * Express middleware: Error handler
 * Should be added LAST (after all routes and error-catching middleware)
 * to capture any errors that bubble up through the error handler chain.
 * 
 * If Sentry is not initialized (no SENTRY_DSN), returns a no-op middleware.
 */
const sentryErrorHandler = (() => {
  try {
    return Sentry.Handlers?.errorHandler?.() || ((err, req, res, next) => next(err));
  } catch (err) {
    // If Sentry not initialized, return no-op middleware
    return (err, req, res, next) => next(err);
  }
})();

/**
 * Utility: Manually capture an exception with extra context
 * Usage:
 *   const { captureException } = require('./infrastructure/monitoring/sentry');
 *   captureException(error, { tags: { order_id: orderId }, level: 'error' });
 */
function captureException(error, context = {}) {
  Sentry.captureException(error, {
    tags: context.tags || {},
    level: context.level || 'error',
    extra: context.extra || {},
  });
}

/**
 * Utility: Manually capture a message (breadcrumb)
 * Usage:
 *   const { captureMessage } = require('./infrastructure/monitoring/sentry');
 *   captureMessage('Payment verification step X', 'info', { order_id: '123' });
 */
function captureMessage(message, level = 'info', context = {}) {
  Sentry.captureMessage(message, {
    level,
    tags: context.tags || {},
    extra: context.extra || {},
  });
}

/**
 * Utility: Capture global uncaughtException
 * Call this in process.on('uncaughtException') handler
 * Does NOT replace existing logging — enhances it by sending to Sentry
 * Usage:
 *   process.on('uncaughtException', err => {
 *     captureGlobalException(err, { context: 'uncaughtException' });
 *     // existing logging/exit continues
 *   });
 */
function captureGlobalException(error, context = {}) {
  Sentry.captureException(error, {
    tags: {
      ...(context.tags || {}),
      origin: context.context || 'global',
      type: 'unhandled_exception',
    },
    level: 'fatal',
    extra: context.extra || {},
  });
}

/**
 * Utility: Capture global unhandledRejection
 * Call this in process.on('unhandledRejection') handler
 * Does NOT replace existing logging — enhances it by sending to Sentry
 * Usage:
 *   process.on('unhandledRejection', err => {
 *     captureGlobalRejection(err, { context: 'unhandledRejection' });
 *     // existing logging/exit continues
 *   });
 */
function captureGlobalRejection(error, context = {}) {
  Sentry.captureException(error, {
    tags: {
      ...(context.tags || {}),
      origin: context.context || 'global',
      type: 'unhandled_rejection',
    },
    level: 'fatal',
    extra: context.extra || {},
  });
}

/**
 * Utility: Add Sentry context for background workers (outbox, schedulers, etc)
 * Helps track errors in processes that don't have HTTP request context
 * Usage:
 *   setBackgroundWorkerContext({ worker: 'outbox', action: 'publish_events' });
 */
function setBackgroundWorkerContext(context) {
  Sentry.setContext('background_worker', context);
}

/**
 * Utility: Add Sentry context for MongoDB operations
 * Helps debug database-specific errors
 * Usage:
 *   setMongoContext({ collection: 'orders', operation: 'insert', replica_set_status: 'primary' });
 */
function setMongoContext(context) {
  Sentry.setContext('mongodb', context);
}

module.exports = {
  initSentry,
  sentryRequestHandler,
  sentryErrorHandler,
  captureException,
  captureMessage,
  captureGlobalException,
  captureGlobalRejection,
  setBackgroundWorkerContext,
  setMongoContext,
};
