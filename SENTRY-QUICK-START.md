# Sentry Setup — Quick Start Checklist

Complete these steps to enable Sentry error tracking in production:

## 1️⃣ Get Sentry DSN (5 minutes)

- [ ] Go to https://sentry.io/signup/ and create free account (if needed)
- [ ] Create new project → Select "Node.js" → Name it "Restaurant BO Backend"
- [ ] Copy the DSN URL from **Settings → Client Keys (DSN)**
  - Format: `https://xxxxx@xxxxx.ingest.sentry.io/123456`

## 2️⃣ Configure Environment Variables (2 minutes)

Add to your `config.env`:

```env
SENTRY_DSN=<paste-your-dsn-here>
NODE_ENV=production
```

## 3️⃣ Verify Installation (1 minute)

Restart server and check logs:

```bash
npm run dev
```

**Look for this log message**:
```
[Sentry] Initialized for environment: production. DSN: xxx/123456@xxx
```

If you see a warning instead:
```
[Sentry] SENTRY_DSN not set in config.env — error tracking disabled
```

Then check:
1. DSN is correctly set in `config.env`
2. Server was restarted after adding DSN
3. DSN format is valid (starts with `https://`)

## 4️⃣ Test in Development (2 minutes)

Trigger a test error to verify Sentry is working:

```bash
# Start server in one terminal
npm run dev

# In another terminal, trigger an error (if you have a test endpoint)
curl http://localhost:3000/api/test/error

# Check Sentry dashboard → Issues
# Error should appear within 10-15 seconds
```

## 5️⃣ Check Health Endpoints (1 minute)

```bash
# Should return 200 (always healthy)
curl http://localhost:3000/health

# Should return 200 (ready) or 503 (not ready)
curl http://localhost:3000/health/ready

# Shows detailed metrics including database replica set and worker status
curl http://localhost:3000/health/live
```

Expected `/health/ready` response:
```json
{
  "status": "ready",
  "checks": {
    "database": { "state": "connected" },
    "outbox_worker": { "running": true },
    "integrity_scheduler": { "running": true },
    "subscription_scheduler": { "running": true }
  }
}
```

## 6️⃣ Setup Alerts (Optional, 5 minutes)

1. Log into Sentry dashboard
2. Go to **Alerts** → **Create Alert**
3. Set trigger: "A new issue is created"
4. Set action: Send to Slack/Email/webhook
5. Save alert

## 7️⃣ Deploy to Production

Same `SENTRY_DSN` value goes into production environment variables (secrets manager):

```bash
# Example (use your actual secrets manager):
export SENTRY_DSN=https://your-dsn@your-org.ingest.sentry.io/project-id
npm run start:prod
```

## ✅ You're Done!

Sentry is now tracking errors in production.

### What's Happening Behind the Scenes

1. **Uncaught Exceptions**: Automatically captured before process crash
2. **Unhandled Rejections**: Automatically captured before process exit
3. **HTTP Errors**: Automatically captured with request context (URL, user, merchant)
4. **Background Worker Errors**: Captured in outbox worker and schedulers
5. **Winston Logs**: Continue working as before (Sentry doesn't replace logging)
6. **Health Checks**: Monitor database, outbox worker, and schedulers via `/health/ready`

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Errors not in Sentry | Wait 10-15 sec, check DSN is valid, verify error actually occurred |
| Too many errors | Lower sample rate in sentry.js from 1.0 to 0.1 |
| DSN warning in logs | Verify SENTRY_DSN is in config.env with valid format |
| Duplicate logs | Expected — Winston + Sentry both track separately |

## Next Steps

1. Review full setup guide: [SENTRY-PRODUCTION-SETUP.md](./SENTRY-PRODUCTION-SETUP.md)
2. Configure Sentry alerts in dashboard
3. Add team members and assign issue ownership
4. Monitor first few days in production
5. Optionally enable Performance Monitoring for detailed tracing

## Files Modified

- ✅ `src/infrastructure/monitoring/sentry.js` — Enhanced with global error capture
- ✅ `src/server.js` — Integrated Sentry into process error handlers
- ✅ `src/modules/health/health.routes.js` — Enhanced readiness probe
- ✅ `src/common/database/connection.js` — Added replica set status check
- ✅ `src/app/create-app.js` — Middleware order already correct
- ✅ `.env.example` — Added SENTRY_DSN placeholder
- ✅ TypeScript linting — All changes compile successfully

## Questions?

See [SENTRY-PRODUCTION-SETUP.md](./SENTRY-PRODUCTION-SETUP.md) for full documentation including:
- Detailed integration points
- Advanced configuration
- Performance optimization
- Source maps setup
- Custom alerting
