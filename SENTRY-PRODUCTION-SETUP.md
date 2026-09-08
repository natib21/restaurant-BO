# Sentry Production Monitoring Setup Guide

## Overview

This document covers the setup and integration of Sentry (@sentry/node) for production error tracking in the Restaurant BO application. Sentry works **alongside** your existing Winston/Morgan logging and GlobalErrorHandler — it does not replace them.

### What Sentry Does

- **Error Tracking**: Captures uncaught exceptions and unhandled promise rejections before the process exits
- **Request Context**: Automatically associates errors with HTTP requests, users, and merchants
- **Breadcrumbs**: Records a timeline of events leading up to an error (logs, database operations, background job events)
- **Source Maps**: Maps minified stack traces back to original source code
- **Release Tracking**: Groups errors by application version for easier tracking across deployments
- **Alerting**: Send notifications to Slack, email, or custom webhooks when errors occur

### What Sentry Does NOT Replace

- **Winston Logging**: Continue using Winston for application event logging (info, debug, warn)
- **GlobalErrorHandler**: Express middleware still runs and formats error responses
- **Morgan HTTP Logs**: HTTP request logging continues through Winston

## Prerequisites

✅ Already Installed:
- `@sentry/node` (npm package)
- Winston logger (utils/logger.js) with comprehensive redaction
- GlobalErrorHandler (utils/globalErrorHandler.js)
- Health check endpoints (/health, /health/ready, /health/live)

## Step 1: Create Sentry Project & Get DSN

1. **Sign up for Sentry** (if not already):
   - Go to https://sentry.io/signup/
   - Create a free account or use your organization account

2. **Create a new project**:
   - Select "Node.js" as the platform
   - Name it something like "Restaurant BO Backend"
   - Choose your organization/team

3. **Get your DSN (Data Source Name)**:
   - On the project settings page, look for "Client Keys (DSN)"
   - Copy the DSN URL (looks like: `https://xxxxx@xxxxx.ingest.sentry.io/123456`)

## Step 2: Configure Environment Variable

Add the Sentry DSN to your `config.env` file:

```env
# Sentry Error Tracking
SENTRY_DSN=https://your-dsn-key@your-org.ingest.sentry.io/project-id

# Optional: Override environment tag (defaults to NODE_ENV)
# SENTRY_ENVIRONMENT=production
```

### Getting Your DSN from Sentry Project Settings

1. Log into your Sentry project
2. Go to **Settings** → **Projects** → **Your Project**
3. Click **Client Keys (DSN)** in the left sidebar
4. Copy the full DSN URL
5. Paste into `config.env` as shown above

## Step 3: Verify Sentry Initialization

Sentry initializes automatically when the server starts. Check your logs for:

```
[Sentry] Initialized for environment: production. DSN: xxx/123456@xxx
```

If you see this warning instead:
```
[Sentry] SENTRY_DSN not set in config.env — error tracking disabled
```

Then double-check that `SENTRY_DSN` is set in `config.env` and the server was restarted.

## Step 4: Testing Sentry Integration (Non-Production)

### Test 1: Verify Sentry is Capturing Errors

You can manually test Sentry in development by hitting the test endpoint:

```bash
# If you have a test/debug endpoint that throws an error:
curl http://localhost:3000/api/test/error

# Check Sentry dashboard — error should appear within a few seconds
```

### Test 2: Verify Winston + Sentry Coexistence

Open a terminal and check the logs:

```bash
# Start in development
npm run dev

# In another terminal, trigger a test error:
curl http://localhost:3000/api/test/error

# You should see BOTH:
# 1. Winston log output in the terminal
# 2. Sentry issue created in dashboard (check in ~5-10 seconds)
```

### Test 3: Verify Health Endpoints

```bash
# Liveness probe (always 200)
curl http://localhost:3000/health

# Readiness probe (200 if all systems healthy, 503 if not)
curl http://localhost:3000/health/ready
# Response includes:
# - database state and replica set info
# - outbox worker running status
# - integrity scheduler running status
# - subscription scheduler running status

# Extended metrics
curl http://localhost:3000/health/live
```

## Sentry Integration Points

### 1. Global Exception/Rejection Handler (src/server.js)

**How it works**: 
- `process.on('uncaughtException', ...)` captures unhandled exceptions before crash
- `process.on('unhandledRejection', ...)` captures unhandled promise rejections before crash
- Both handlers call `Sentry.captureException()` FIRST, then log locally, then exit

**Flow**:
```
Unhandled Exception/Rejection
  ↓
Sentry.captureException() [async, doesn't block]
  ↓
logger.error() [logs to Winston]
  ↓
process.exit(1)
```

### 2. Request Context Handler (src/app/create-app.js)

**How it works**:
- `sentryRequestHandler` middleware captures request context (URL, method, headers, user)
- Automatically associated with all errors that occur within that request

**Middleware order** (in create-app.js):
1. CORS
2. Helmet (security headers)
3. **Sentry Request Handler** ← Captures request context
4. Rate limiters
5. Body parser
6. Security middleware
7. Request context middleware (sets requestId, userId, merchantId)
8. Morgan (HTTP logging)
9. Routes
10. 404 handler
11. **Sentry Error Handler** ← Captures errors after routes
12. GlobalErrorHandler ← Formats error responses

### 3. Error Handler Middleware (src/app/create-app.js)

**How it works**:
- `sentryErrorHandler` middleware captures any errors that occur in route handlers
- Sends to Sentry, then passes error to `GlobalErrorHandler`

**Important**: Sentry does NOT prevent GlobalErrorHandler from running. Both execute in order.

### 4. Background Worker Context (Optional Enhancement)

When implementing background jobs that fail, you can add Sentry context:

```javascript
// In outbox-worker.js or scheduler files:
const { setBackgroundWorkerContext, captureException } = require('../monitoring/sentry');

// Add context for this worker
setBackgroundWorkerContext({ 
  worker: 'outbox',
  action: 'publish_events',
  batch_size: 20 
});

// Capture any errors
try {
  await publishEvents();
} catch (error) {
  captureException(error, {
    tags: { worker: 'outbox', action: 'publish_events' },
    extra: { batch_size: 20 }
  });
  throw error; // re-throw for existing error handling
}
```

### 5. MongoDB Context (Optional Enhancement)

When executing critical database operations:

```javascript
// In connection.js or data access layer:
const { setMongoContext, captureException } = require('../monitoring/sentry');

try {
  const result = await Order.findById(orderId);
} catch (error) {
  setMongoContext({
    collection: 'orders',
    operation: 'findById',
    replica_set_status: 'checking...' // call getReplicaSetStatus() if needed
  });
  captureException(error, { tags: { operation: 'findById' } });
  throw error;
}
```

## Health Endpoints Enhanced

### GET /health/ready — Readiness Probe

Now includes deep system health checks:

```json
{
  "status": "ready",
  "checks": {
    "database": {
      "state": "connected",
      "status": "replicated",
      "replica_set": "rs0",
      "current_role": "PRIMARY",
      "members_count": 3,
      "healthy_members": 3
    },
    "outbox_worker": {
      "running": true,
      "processing": false
    },
    "integrity_scheduler": {
      "running": true
    },
    "subscription_scheduler": {
      "running": true
    }
  },
  "env": "production",
  "timestamp": "2025-01-15T10:30:45.123Z"
}
```

**Readiness determination**:
- ✅ Ready (200) if:
  - Database is connected
  - Outbox worker is running
  - At least one scheduler is running
- ❌ Not Ready (503) if:
  - Database is disconnected
  - Outbox worker is not running
  - All schedulers are stopped

## Sentry Configuration Reference

**File**: `src/infrastructure/monitoring/sentry.js`

**Key Settings**:
- `tracesSampleRate`: 10% in production (0.1), 100% in dev (1.0)
  - Reduces Sentry cost in production
  - Use 1.0 to trace all requests
  - Change via `SENTRY_TRACE_SAMPLE_RATE` env var if needed
- `environment`: Tagged with NODE_ENV (production/development/staging)
- `attachStacktrace`: Always enabled for full stack traces
- `maxBreadcrumbs`: Tracks up to 50 events before the error

## Troubleshooting

### Issue: "SENTRY_DSN not set" warning

**Solution**:
1. Check `config.env` has the DSN line
2. Restart the server: `npm run dev` or `npm start`
3. Verify the DSN is valid (starts with `https://`)

### Issue: Errors not appearing in Sentry

**Checklist**:
1. Is the DSN valid? (Check in Sentry project settings)
2. Is the server actually hitting an error? (Check console/Winston logs)
3. Is error handling preventing the error from reaching Sentry? (Check middleware order)
4. Wait 10-15 seconds after error occurs (Sentry batches events)
5. Check Sentry project filters: Settings → Inbound Filters (may be filtering your errors)

### Issue: Too many errors in Sentry

**Solutions**:
1. Lower `tracesSampleRate` from 1.0 to 0.5 or 0.1
2. Add inbound filters in Sentry dashboard (Settings → Inbound Filters)
3. Ignore specific error patterns
4. Upgrade Sentry plan if quota exceeded

### Issue: Winston and Sentry logs are different

**This is expected**:
- **Winston logs**: Everything (info, debug, warn, error) — full app logging
- **Sentry**: Only errors (exceptions, rejections) — error tracking
- They serve different purposes and should both exist

## Production Deployment Checklist

Before deploying to production:

- [ ] `SENTRY_DSN` is set in production environment variables
- [ ] `NODE_ENV=production` is set
- [ ] Verified Sentry project exists and is active
- [ ] Test that errors are being captured (run one test error)
- [ ] Configured Sentry alerting (Slack, email, etc)
- [ ] Set up Sentry issue ownership/routing (assign to team members)
- [ ] Reviewed Sentry performance/release tracking setup
- [ ] Confirmed Winston logging is still working
- [ ] Tested `/health/ready` endpoint returns healthy status
- [ ] Verified MongoDB replica set status is accurate
- [ ] Confirmed outbox worker is running in health checks
- [ ] Confirmed schedulers are running in health checks

## Optional Enhancements

### 1. Release Tracking (Recommended for CI/CD)

Add to `config.env` or CI/CD pipeline:

```env
APP_VERSION=1.2.3
```

This automatically tags errors with your app version, making it easy to track when issues were introduced.

### 2. Source Maps

For production builds, upload source maps to Sentry:

```bash
# Install CLI
npm install --save-dev @sentry/cli

# After building, upload maps
sentry-cli releases files upload-sourcemaps dist/
```

### 3. Custom Alerts

In Sentry dashboard → Alerts:
- Alert on new issues
- Alert when error rate spikes
- Route to Slack channel: `#incidents` or `#ops`
- Route to on-call team

### 4. Performance Monitoring

Enable transaction tracing for performance insights:

```javascript
// In sentry.js, update tracesSampleRate:
tracesSampleRate: env.NODE_ENV === 'production' ? 0.5 : 1.0, // 50% in prod
enableTracing: true, // Enable transaction tracking
```

## API Reference

### captureException(error, context)

Manually capture an exception:

```javascript
const { captureException } = require('./infrastructure/monitoring/sentry');

try {
  await riskyOperation();
} catch (error) {
  captureException(error, {
    tags: { operation: 'order_payment', order_id: '123' },
    extra: { payment_method: 'credit_card' }
  });
  throw error;
}
```

### captureMessage(message, level, context)

Capture a message/breadcrumb:

```javascript
const { captureMessage } = require('./infrastructure/monitoring/sentry');

captureMessage('Payment processing started', 'info', {
  tags: { order_id: '123' }
});
```

### setBackgroundWorkerContext(context)

Set context for background workers:

```javascript
const { setBackgroundWorkerContext } = require('./infrastructure/monitoring/sentry');

setBackgroundWorkerContext({
  worker: 'outbox',
  batch_size: 20,
  retry_count: 3
});
```

### setMongoContext(context)

Set context for database operations:

```javascript
const { setMongoContext } = require('./infrastructure/monitoring/sentry');

setMongoContext({
  collection: 'orders',
  operation: 'insert',
  replica_set_status: 'PRIMARY'
});
```

## Support & Documentation

- **Sentry Docs**: https://docs.sentry.io/platforms/node/
- **Sentry Dashboard**: https://sentry.io/auth/login/
- **Issue Tracking**: Check Sentry Issues tab for all captured errors
- **Release Notes**: https://docs.sentry.io/product/releases/

## Summary

Sentry is now integrated into your production monitoring stack:

1. ✅ Captures uncaught exceptions and rejections
2. ✅ Works alongside Winston logging (no conflict)
3. ✅ Provides request context via middleware
4. ✅ Includes MongoDB and background worker context
5. ✅ Health endpoints track outbox, schedulers, replica set status
6. ✅ Production-ready with configurable sampling and alerting

All existing functionality (Winston, Morgan, GlobalErrorHandler) continues unchanged. Sentry augments error tracking without replacing existing systems.
