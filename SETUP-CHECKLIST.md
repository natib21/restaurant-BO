# Production Monitoring — Quick Setup Checklist

## 1. Install Dependencies ✓ DONE

Packages installed:
- `@sentry/node` — Error tracking
- `pino` — Structured logging
- `pino-http` — HTTP middleware logging

## 2. Manual Setup Steps (DO THESE NOW)

### A. Create Sentry Account
- [ ] Go to https://sentry.io/
- [ ] Sign up (free tier has generous limits)
- [ ] Create organization (or use existing)
- [ ] Create new **Node.js** project
- [ ] Copy your **DSN** (looks like: `https://xxx@xxx.ingest.sentry.io/xxx`)

### B. Update config.env
- [ ] Open `config.env`
- [ ] Add this line:
  ```bash
  SENTRY_DSN=https://<your-actual-dsn-here>
  ```
- [ ] Save file

### C. Test the Setup

**Start the app:**
```bash
npm start
```

**Expected console output:**
```
[Sentry] Initialized for environment: production. DSN: xxx/12345@...
MongoDB connected successfully!
Server running on port 3000 [production]
```

**If you see the Sentry line → ✓ Sentry is working!**

**Check health endpoints:**
```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
curl http://localhost:3000/health/live
```

**All should return 200 with JSON.**

### D. Test Error Capture (Optional but Recommended)

**In a test file or temporary route, trigger an error:**

```javascript
// Temporarily add to a controller for testing:
router.get('/test-sentry', (req, res, next) => {
  const err = new Error('This is a test error from Sentry');
  err.tags = { test: true, endpoint: '/test-sentry' };
  next(err);
});
```

**Call it:**
```bash
curl http://localhost:3000/test-sentry
```

**Check Sentry dashboard** — you should see the error within seconds.

---

## 3. What's Been Implemented (Auto-deployed)

| Feature | Status | File(s) |
|---------|--------|---------|
| Sentry error tracking | ✓ Ready | `src/infrastructure/monitoring/sentry.js` |
| Pino structured logging | ✓ Ready | `src/infrastructure/monitoring/pino-logger.js` |
| HTTP request logging | ✓ Ready | `src/infrastructure/monitoring/pino-http-middleware.js` |
| Enhanced health checks | ✓ Ready | `src/modules/health/health.routes.js` |
| Graceful shutdown | ✓ Already had it | `src/server.js` |
| Error handling middleware | ✓ Already had it | `src/app/create-app.js` |

---

## 4. Code Matching Your Style

- **CommonJS modules** (require/exports) — ✓ Matches your codebase
- **No TypeScript** — ✓ Kept as JavaScript
- **Existing middleware preserved** — ✓ Winston + Morgan still work
- **Production env-var based** — ✓ Uses `process.env` + `config.env`
- **Folder structure** — ✓ Added to `src/infrastructure/monitoring/`

---

## 5. Production Deployment

When deploying to production:

1. **Ensure `SENTRY_DSN` is in your production config**
   ```bash
   SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
   NODE_ENV=production
   ```

2. **Configure your log aggregator** to collect stdout (where Pino outputs JSON)
   - ELK Stack, Splunk, Datadog, CloudWatch, etc.

3. **Set up health check probes** (if using Kubernetes, Docker Swarm, or similar):
   ```yaml
   livenessProbe:
     httpGet:
       path: /health
       port: 3000
     initialDelaySeconds: 10
     periodSeconds: 30
   
   readinessProbe:
     httpGet:
       path: /health/ready
       port: 3000
     initialDelaySeconds: 5
     periodSeconds: 10
   ```

4. **Test graceful shutdown:**
   ```bash
   # In production (or staging):
   kill -SIGTERM <app-pid>
   # Should close DB connections and exit cleanly
   ```

---

## 6. How to Use Monitoring in Your Code

### In Controllers/Services:

```javascript
const logger = require('../infrastructure/monitoring/pino-logger');
const { captureException } = require('../infrastructure/monitoring/sentry');

async function processOrder(orderId) {
  try {
    logger.info({ orderId }, 'Processing order');
    
    // ... do work ...
    
    logger.info({ orderId, status: 'completed' }, 'Order processed');
  } catch (err) {
    // Automatically sent to Sentry + logged
    captureException(err, { tags: { orderId } });
    logger.error({ orderId, error: err.message }, 'Order processing failed');
    throw err;
  }
}
```

**Sensitive fields are automatically redacted:**
- `password`, `token`, `secret`, `credit_card`, `cvv`, `email`, `phone`, `ssn`
- Add more to `src/infrastructure/monitoring/pino-logger.js` if needed

---

## 7. Troubleshooting

| Problem | Solution |
|---------|----------|
| `[Sentry] SENTRY_DSN not set...` | Add `SENTRY_DSN` to `config.env` and restart |
| Errors not appearing in Sentry | Ensure DSN is correct, restart app, test with `/test-sentry` |
| Too many logs in stdout | Filter in your log aggregator, or adjust `LOG_LEVEL` |
| Pino "module not found" error | Run `npm install pino pino-http` |
| Logs too verbose in development | Set `LOG_LEVEL=warn` in `config.env` |

---

## 8. Next Steps (After Verifying Setup)

1. ✓ Verify health endpoints work (`/health`, `/health/ready`, `/health/live`)
2. ✓ Test error capture with Sentry
3. ✓ Configure log aggregation in production
4. ✓ Set up Sentry alerts (error rate, new errors, etc.)
5. ✓ Document runbooks for common issues
6. ✓ Train team on using Sentry/Pino for debugging

---

## Questions?

Refer to **PRODUCTION-MONITORING-GUIDE.md** for detailed documentation.
