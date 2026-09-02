# Payment Verification Route 404 Fix

## Problem
Getting error: `Cannot find /api/v1/payment-verification on this server`

## Root Cause
The route IS properly registered in `src/routes/index.js` (line 133), but the server hasn't loaded it yet.

## Solution

### 1. Restart Your Development Server

**If using nodemon:**
```bash
# Stop the server (Ctrl+C)
# Then restart:
npm run dev
```

**If using pm2:**
```bash
pm2 restart all
# or specific app:
pm2 restart restaurant-api
```

**If running node directly:**
```bash
# Stop with Ctrl+C, then:
npm start
```

### 2. Verify Server Startup

Check console output for errors during startup. Look for:

```
✓ Payment verification routes loaded
✓ Server listening on port 3000
```

### 3. Test the Endpoint

```bash
# Test with curl (should return 401 Unauthorized, not 404)
curl -X GET http://localhost:3000/api/v1/payment-verification

# With auth token (should return empty list)
curl -X GET http://localhost:3000/api/v1/payment-verification \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Verify Route Registration

The route is already registered in `src/routes/index.js`:

```javascript
// Line 47
const paymentVerificationRoutes = require('../modules/payment-verification/payment-verification.routes');

// Line 133
router.use('/api/v1/payment-verification', paymentVerificationRoutes);
```

## Common Issues

### Issue 1: Module Not Found Error
**Symptom:** Server crashes on startup with `Cannot find module`

**Check:**
```bash
# Verify all files exist
ls src/modules/payment-verification/payment-verification.routes.js
ls src/modules/payment-verification/controller/payment-verification.controller.js
ls src/modules/payment-verification/service/PaymentVerificationService.js
```

**Fix:** If any files are missing, the module was not created properly.

### Issue 2: Import/Export Error
**Symptom:** Server starts but routes don't work

**Check routes file exports:**
```javascript
// src/modules/payment-verification/payment-verification.routes.js
// Should end with:
module.exports = router;
```

**Check controller exports:**
```javascript
// src/modules/payment-verification/controller/payment-verification.controller.js
// Should have:
exports.initiateVerification = catchAsync(async (req, res) => { ... });
exports.confirmVerification = catchAsync(async (req, res) => { ... });
// etc.
```

### Issue 3: Path Typo
**Symptom:** 404 error

**Common mistakes:**
- `/api/v1/payment-verifications` (with 's') ❌
- `/api/v1/paymentVerification` (camelCase) ❌
- `/api/v1/payment_verification` (underscore) ❌

**Correct path:**
- `/api/v1/payment-verification` ✅

## Verify Installation

Run these commands to verify everything is in place:

```bash
# 1. Check file structure
ls -la src/modules/payment-verification/

# Expected output:
# controller/
# repository/
# service/
# payment-verification.routes.js

# 2. Check syntax
node -c src/modules/payment-verification/payment-verification.routes.js
node -c src/modules/payment-verification/controller/payment-verification.controller.js

# No output = no errors

# 3. Check route registration
grep -n "payment-verification" src/routes/index.js

# Expected output:
# 47:const paymentVerificationRoutes = require('../modules/payment-verification/payment-verification.routes');
# 133:router.use('/api/v1/payment-verification', paymentVerificationRoutes);
```

## Quick Test After Restart

```bash
# 1. Health check (no auth needed)
curl http://localhost:3000/api/v1/health

# 2. Payment verification (needs auth - should get 401, not 404)
curl http://localhost:3000/api/v1/payment-verification

# Expected: 401 Unauthorized
# Wrong: 404 Not Found
```

## If Still Not Working

### Check for Port Conflicts
```bash
# Windows
netstat -ano | findstr :3000

# If port is occupied, either:
# 1. Kill the process
taskkill /PID <process_id> /F

# 2. Change port in .env
PORT=3001
```

### Check Environment Variables
```bash
# Make sure .env file exists
ls .env

# Check NODE_ENV
echo $env:NODE_ENV  # Windows PowerShell
```

### Enable Debug Logging
```javascript
// Add to src/routes/index.js (temporarily)
console.log('✓ Payment verification routes registered at /api/v1/payment-verification');

// Restart and check console output
```

### Check Express Middleware Order
The route must be registered AFTER `protect` middleware but the individual route handlers call `protect` themselves.

Current order in `src/routes/index.js` is correct:
```javascript
// Auth middleware available
router.use('/api/v1/auth', authRoutes);

// Then protected routes
router.use('/api/v1/payment-verification', paymentVerificationRoutes);
```

## Production Deployment

When deploying to production:

```bash
# 1. Restart the server
pm2 restart restaurant-api

# 2. Check logs
pm2 logs restaurant-api

# 3. Monitor
pm2 monit
```

## Still Getting 404?

If you've restarted and still getting 404:

1. **Check if you're hitting the right server:**
   ```bash
   # Check what's running on port 3000
   curl http://localhost:3000/api/v1/health
   
   # Should return server info
   ```

2. **Check your request URL:**
   - Correct: `http://localhost:3000/api/v1/payment-verification`
   - Not: `http://localhost:3000/payment-verification` (missing /api/v1)

3. **Check environment:**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

4. **Clear node cache (rare case):**
   ```bash
   # Stop server
   # Delete node_modules and reinstall
   rm -rf node_modules
   npm install
   npm run dev
   ```

## Expected Behavior After Fix

**Without Auth Token:**
```bash
curl http://localhost:3000/api/v1/payment-verification
```

Response:
```json
{
  "status": "fail",
  "message": "You are not logged in. Please log in to get access."
}
```

**With Auth Token:**
```bash
curl http://localhost:3000/api/v1/payment-verification \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "status": "success",
  "data": {
    "verifications": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "pages": 0
    }
  }
}
```

## Summary

✅ **Routes are registered correctly**
✅ **Files exist and have no syntax errors**
❌ **Server needs restart to load the module**

**Action Required:** Restart your development server!
