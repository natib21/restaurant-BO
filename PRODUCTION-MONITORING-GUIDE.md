# Production Monitoring Implementation Guide

## Overview

I've integrated **Sentry** for error tracking and **Pino** for structured JSON logging into your Express.js restaurant management system. Your existing error handling, graceful shutdown, and health endpoints were already production-ready, so these integrations enhance (not replace) them.

---

## What Was Implemented

### 1. **Sentry Error Tracking** ✓

**Files created:**
- `src/infrastructure/monitoring/sentry.js`

**What it does:**
- Captures **unhandled exceptions** globally
- Captures **unhandled promise rejections** globally
- Captures all **errors thrown in Express routes and middleware**
- Automatically tags errors with environment (dev/staging/production)
- Includes request context (URL, user ID, headers) with each error
- Provides release tracking for version correlation
- Integrates with your existing error handlers (doesn't replace them)

**Middleware added to `src/app/create-app.js`:**
- `sentryRequestHandler`: Added after Helmet (#3.5) to capture request context early
- `sentryErrorHandler`: Added before GlobalErrorHandler (#17) to capture all errors

**Bootstrap updated in `src/server.js`:**
- Sentry is initialized at the very start (line 1) to catch startup errors

---

### 2. **Pino Structured Logging** ✓

**Files created:**
- `src/infrastructure/monitoring/pino-logger.js` — Core logger with redaction rules
- `src/infrastructure/monitoring/pino-http-middleware.js` — HTTP request/response logging

**What it does:**
- **Production:** Outputs machine-readable JSON logs to stdout (for log aggregators like ELK, Splunk, etc)
- **Development:** Pretty-printed colored logs for readability
- **Automatic HTTP logging:** Every request/response is logged with method, path, status, duration, response size
- **Sensitive field redaction:** Passwords, tokens, credit cards, PII automatically redacted
- **Request correlation:** Logs tagged with requestId, userId, merchantId for tracing requests across services

**Middleware added to `src/app/create-app.js`:**
- `createPinoHttpMiddleware()`: Added after response helpers (#13) before Morgan

**Existing logging preserved:**
- Your Winston logger and Morgan middleware continue to work
- Pino runs alongside them for production JSON output

---

### 3. **Enhanced Health Check Endpoints** ✓

**Files updated:**
- `src/modules/health/health.routes.js`

**Three endpoints for Kubernetes/Docker orchestration:**

1. **GET /health** (Liveness probe)
   - Returns: `{ status: 'ok', uptime, timestamp }`
   - Purpose: Is the process running?
   - Status Code: Always 200

2. **GET /health/ready** (Readiness probe)
   - Returns: `{ status: 'ready|not_ready', checks: { database }, env, timestamp }`
   - Purpose: Is the app ready to accept requests?
   - Status Code: 200 if ready, 503 if not ready
   - Checks: Database connection state

3. **GET /health/live** (Extended metrics)
   - Returns: `{ status: 'live', uptime, memory, process, database, timestamp }`
   - Purpose: Dashboard/monitoring data collection
   - Includes: Memory usage, heap stats, Node version, PID, database state

---

### 4. **Graceful Shutdown** ✓

Already implemented in `src/server.js`:
- Handles `SIGTERM` and `SIGINT` signals
- Closes outbox worker, schedulers, and database connections before exiting
- Stops accepting new requests during shutdown
- Enables zero-downtime deploys (e.g., Kubernetes rolling updates)

---

## Manual Setup Steps

### Step 1: Create a Sentry Account & Project

1. Go to **https://sentry.io/** and sign up (free tier available)
2. Create a new organization (or use an existing one)
3. Create a new **Node.js** project
4. You'll get a **DSN** that looks like:
   ```
   https://<public_key>@<project_id>.ingest.sentry.io/<project_number>
   ```

### Step 2: Add Environment Variables to `config.env`

```bash
# Error tracking (Sentry) — get DSN from https://sentry.io/
SENTRY_DSN=https://<your-sentry-dsn-here>

# Optional: Your app version for error correlation (set via CI/CD or manually)
# APP_VERSION=1.0.0

# Existing vars (already in your config.env):
NODE_ENV=production
LOG_LEVEL=info
```

### Step 3: Verify Installation

Run the app and check:

```bash
npm start
# or for development:
npm run dev
```

**Expected output:**
```
[Sentry] Initialized for environment: production. DSN: xxx/<project_id>@...
MongoDB connected successfully!
Server running on port 3000 [production]
```

If you don't see the Sentry initialization message, SENTRY_DSN is not set (it's optional).

### Step 4: Test Error Capture

Create a test route to verify Sentry works:

```javascript
// In a controller or temporary test file:
const { captureException } = require('./infrastructure/monitoring/sentry');

router.get('/test-error', (req, res, next) => {
  try {
    throw new Error('Test error from /test-error endpoint');
  } catch (err) {
    captureException(err, { 
      tags: { test: true, endpoint: '/test-error' },
      level: 'error'
    });
    next(err); // Pass to error handler
  }
});
```

Visit `http://localhost:3000/test-error`, then check your **Sentry dashboard** — the error should appear within seconds.

### Step 5: Monitor Health Endpoints

**In production, configure your load balancer/orchestrator to call these:**

```bash
# Liveness (K8s: livenessProbe)
curl http://localhost:3000/health
# { "status": "ok", "uptime": 123.45, "timestamp": "2024-01-01T12:00:00Z" }

# Readiness (K8s: readinessProbe)
curl http://localhost:3000/health/ready
# { "status": "ready", "checks": { "database": "connected" }, ... }

# Extended metrics (Prometheus/Grafana)
curl http://localhost:3000/health/live
# { "status": "live", "memory": { "rss_mb": 150, ... }, ... }
```

---

## How to Use in Your Code

### Using Pino Logger

Replace/supplement `console.log` with Pino in route handlers, services, etc:

```javascript
const logger = require('../infrastructure/monitoring/pino-logger');
const { createChildLogger } = require('../infrastructure/monitoring/pino-logger');

// In a controller:
async function processOrder(req, res, next) {
  // Create request-scoped logger
  const reqLogger = createChildLogger({
    requestId: req.ctx?.requestId,
    orderId: req.body.order_id,
    merchantId: req.ctx?.merchantId,
  });

  try {
    reqLogger.info('Order processing started');
    
    // ... business logic ...
    
    reqLogger.info({ order_status: 'completed' }, 'Order processed successfully');
    res.json({ success: true });
  } catch (err) {
    // Sensitive info is automatically redacted
    reqLogger.error({ error: err.message, code: err.code }, 'Order processing failed');
    next(err);
  }
}
```

**In production, JSON logs go to stdout:**
```json
{"level":30,"time":"2024-01-01T12:00:00.000Z","requestId":"req-123","orderId":"ord-456","merchantId":"merchant-789","msg":"Order processing started"}
{"level":30,"time":"2024-01-01T12:00:01.000Z","requestId":"req-123","order_status":"completed","msg":"Order processed successfully"}
```

**In development, logs are pretty-printed:**
```
12:00:00 INFO [reqId:req-123 user:merchant-789] Order processing started
12:00:01 INFO [reqId:req-123] Order processed successfully
```

### Using Sentry for Manual Error Capture

```javascript
const { captureException, captureMessage } = require('../infrastructure/monitoring/sentry');

// Capture exceptions with context:
try {
  await processPayment(order);
} catch (err) {
  captureException(err, {
    tags: {
      order_id: order._id,
      payment_provider: 'chapa',
      step: 'verification',
    },
    level: 'error',
  });
  throw err; // Re-throw to trigger error handler
}

// Capture informational messages (breadcrumbs):
captureMessage('Payment verification completed', 'info', {
  tags: { order_id: order._id },
  extra: { verification_time_ms: 1234 },
});
```

---

## Production Deployment Checklist

- [ ] **Sentry Account:** Create account at https://sentry.io/
- [ ] **Sentry Project:** Create Node.js project, obtain DSN
- [ ] **Environment Variable:** Add `SENTRY_DSN` to production `config.env`
- [ ] **Log Aggregation:** Configure your log collector (ELK, Splunk, Datadog, etc) to scrape stdout
- [ ] **Health Probes:** Configure load balancer/K8s probes:
  - Liveness: `http://localhost:3000/health` (every 30s)
  - Readiness: `http://localhost:3000/health/ready` (every 10s)
- [ ] **Monitoring Dashboard:** Set up Sentry alerts for:
  - Error rate spikes
  - New error types
  - Specific tags (e.g., payment failures)
- [ ] **Test Error Flow:** Trigger a test error and verify it appears in Sentry
- [ ] **Process Manager:** If using PM2/Docker/K8s, verify graceful shutdown on `SIGTERM`:
  ```bash
  curl http://localhost:3000/health/ready  # Should return 200
  kill -SIGTERM <pid>                       # Gracefully shuts down
  curl http://localhost:3000/health/ready  # Should return 503 after shutdown
  ```
- [ ] **Log Retention:** Verify your log aggregator is collecting JSON logs from stdout

---

## Environment Variables Summary

Add to your `config.env`:

```bash
# ─────── Error Tracking (Sentry) ──────────────────────────────────────────
# Get DSN from: https://sentry.io/ → Create Project (Node.js)
SENTRY_DSN=https://<public_key>@<project_id>.ingest.sentry.io/<project_number>

# Optional: Your app version (useful for tracking deployments)
APP_VERSION=1.0.0

# ─────── Logging (already configured, but can be adjusted) ────────────────
LOG_LEVEL=info  # debug, info, warn, error
NODE_ENV=production  # development, staging, production
```

---

## File Changes Summary

### New Files Created:
1. `src/infrastructure/monitoring/sentry.js` — Sentry configuration & utilities
2. `src/infrastructure/monitoring/pino-logger.js` — Pino logger factory
3. `src/infrastructure/monitoring/pino-http-middleware.js` — HTTP logging middleware

### Files Modified:
1. `src/server.js` — Added Sentry initialization at top
2. `src/app/create-app.js` — Added Sentry request/error handlers & Pino middleware
3. `src/modules/health/health.routes.js` — Enhanced with `/health/live` and more details

### Files Unchanged (but already production-ready):
- `utils/logger.js` — Winston logger (still works, runs alongside Pino)
- Error handling middleware (continues to work as before)
- Graceful shutdown logic (already in place)

---

## Monitoring Architecture

```
Request → Helmet
        ↓
        → Sentry Request Handler (captures request context)
        ↓
        → Rate Limiters, CORS, etc.
        ↓
        → Pino HTTP Middleware (logs request as JSON)
        ↓
        → Morgan (traditional log format)
        ↓
        → Routes / Controllers
        ↓
        → Error thrown?
           ├─ Yes → Error Handler
           │        ↓
           │        → Sentry Error Handler (sends to Sentry)
           │        ↓
           │        → Global Error Handler (res.json with error)
           │
           └─ No → Response sent
```

---

## Troubleshooting

### Q: Sentry not capturing errors?
- Check: Is `SENTRY_DSN` set in `config.env`?
- Check: Restart the app after adding SENTRY_DSN
- Check: Are errors being thrown (vs. caught without re-throwing)?
- Test: Call `/test-error` endpoint and look at Sentry dashboard

### Q: Logs not showing in Sentry?
- Sentry captures **errors**, not regular logs
- For regular logs, Sentry shows them as **breadcrumbs**
- JSON logs go to **stdout** (configured in your log aggregator)

### Q: Too much noise in Sentry?
- Filter by `environment` tag in Sentry dashboard
- Set `tracesSampleRate` lower in `src/infrastructure/monitoring/sentry.js` (default: 0.1 in production)
- Configure Sentry **inbound data filters** to ignore specific URLs (e.g., `/health`)

### Q: Can I use Sentry without environment variables?
- Yes, Sentry gracefully skips initialization if `SENTRY_DSN` is not set
- Look for: `[Sentry] SENTRY_DSN not set in config.env`

### Q: How do I disable Sentry for local development?
- Don't set `SENTRY_DSN` in your local `config.env`
- Or set it to an empty string: `SENTRY_DSN=`

---

## Next Steps (Optional Enhancements)

1. **Custom integrations:**
   ```javascript
   // In sentry.js:
   Sentry.init({
     integrations: [
       new Sentry.Integrations.OnUncaughtException(),
       new Sentry.Integrations.OnUnhandledRejection(),
     ],
   });
   ```

2. **Performance monitoring** (Sentry Profiling):
   ```javascript
   // In sentry.js:
   Sentry.init({
     profilesSampleRate: 0.1, // 10% of transactions
   });
   ```

3. **Custom metrics** (Pino + Prometheus):
   ```javascript
   // Create /metrics endpoint that exports Prometheus-format metrics
   // based on Pino logs or Node.js process metrics
   ```

4. **Distributed tracing** (add correlation IDs):
   ```javascript
   // In cross-service calls, pass X-Trace-ID header
   // to correlate requests across microservices
   ```

---

## Support

- **Sentry Docs:** https://docs.sentry.io/platforms/javascript/guides/node/
- **Pino Docs:** https://getpino.io/
- **Express.js Error Handling:** https://expressjs.com/en/guide/error-handling.html
- **Kubernetes Health Checks:** https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
