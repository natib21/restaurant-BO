# Debug Socket Authentication - Testing Guide

## What Was Added

Added detailed console logging to `socket-server.ts` to see EXACTLY what the backend receives during Socket.IO authentication.

## How to Test

### 1. Restart Backend Server

```bash
npm start
```

### 2. Open Merchant/Waiter App

Open your waiter app in the browser.

### 3. Check Backend Console

When the socket tries to connect, you'll see detailed output like this:

#### If Cookie IS Sent (Good):
```
=== 🔍 SOCKET AUTH DEBUG ===
Socket ID: abc123xyz
Handshake auth: {}
Authorization header: undefined
Cookie header: jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; other=value
All headers: {
  "cookie": "jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "host": "localhost:8000",
  ...
}
Token from auth/header: NONE
Checking cookies...
Parsed cookies: [ 'jwt', 'other' ]
Cookie values: [ 'jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', 'other=value...' ]
✅ Found token in cookie: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
✅ Token found, verifying...
✅ JWT decoded: { id: '6a994578cb0ea615465fb4a3' }
✅ User authenticated: {
  userId: 6a994578cb0ea615465fb4a3,
  userName: 'John Doe',
  role: 'Manager',
  merchant: 6a9942a952620eac91b6e67c
}
=== END AUTH DEBUG ===

Staff socket connected: abc123xyz user=6a994578cb0ea615465fb4a3
```

#### If Cookie NOT Sent (Problem):
```
=== 🔍 SOCKET AUTH DEBUG ===
Socket ID: abc123xyz
Handshake auth: {}
Authorization header: undefined
Cookie header: undefined
All headers: {
  "host": "localhost:8000",
  "connection": "keep-alive",
  ...
  // NO "cookie" field!
}
Token from auth/header: NONE
Checking cookies...
❌ No cookie header at all

❌ AUTHENTICATION FAILED - No token found
Checked:
  - socket.handshake.auth.token: false
  - Authorization header: false
  - Cookie header: false
=== END AUTH DEBUG ===
```

## What to Look For

### ✅ Success Indicators

1. **Cookie header present:**
   ```
   Cookie header: jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

2. **Token found in cookie:**
   ```
   ✅ Found token in cookie: eyJhbGciOiJIUzI1NiIs...
   ```

3. **User authenticated:**
   ```
   ✅ User authenticated: { userId: ..., userName: ..., role: ... }
   ```

4. **Final success message:**
   ```
   Staff socket connected: abc123xyz user=user-id
   User user-id joined branch branch-id
   ```

### ❌ Problem Indicators

1. **No cookie header:**
   ```
   Cookie header: undefined
   ❌ No cookie header at all
   ```
   **Cause:** Frontend not sending cookies
   **Fix:** Check `withCredentials: true` in frontend

2. **Cookie sent but no jwt:**
   ```
   Parsed cookies: [ 'other', 'sessionId' ]
   ❌ No jwt or token cookie found
   Available cookies: ['other', 'sessionId']
   ```
   **Cause:** JWT cookie doesn't exist or has different name
   **Fix:** Check cookie name in browser DevTools

3. **JWT verification failed:**
   ```
   ❌ JWT verification failed: JsonWebTokenError: invalid signature
   ```
   **Cause:** Invalid or corrupted JWT
   **Fix:** Re-login to get new token

4. **User not found:**
   ```
   ❌ User not found or inactive
   User found: false
   ```
   **Cause:** User deleted or doesn't exist
   **Fix:** Check user exists in database

## Frontend Debug

### Check if Cookie Exists

Open DevTools in your merchant/waiter app:

**Application → Cookies → http://localhost:8000**
- Look for `jwt` cookie
- It should show as `HttpOnly` ✓

### Check if Cookie is Sent

**Network → WS (WebSocket) → Click Socket.IO connection**
- Go to **Headers** tab
- Look in **Request Headers** for:
  ```
  Cookie: jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```

If Cookie is NOT in Request Headers:
1. Check `withCredentials: true` in Socket config
2. Check cookie domain matches (should be `localhost` for both)
3. Check cookie hasn't expired

### Verify Socket Config

In your `Socket.ts` file, make sure:

```typescript
const socket = io(SOCKET_URL, {
  withCredentials: true,  // ← MUST be true!
  transports: ['websocket'],
  reconnection: true,
});
```

## Common Issues & Solutions

### Issue 1: "Cookie header: undefined"

**Problem:** Frontend not sending cookies.

**Solution:**
```typescript
// In Socket.ts, ensure this is set:
withCredentials: true
```

**Also check:**
- Cookie exists in browser (DevTools → Application → Cookies)
- Cookie domain is correct (should match backend domain)
- CORS configured to allow credentials (backend already has this)

### Issue 2: "No jwt or token cookie found"

**Problem:** Cookie exists but has different name.

**Backend checks for:** `jwt` or `token`

**Solution:** Check cookie name in browser DevTools. If it's different (e.g., `auth_token`), either:
1. Change backend to look for that name:
   ```typescript
   token = cookies.jwt || cookies.token || cookies.auth_token;
   ```
2. Or change backend cookie name when setting it

### Issue 3: Cookie sent but "Invalid or expired token"

**Problem:** JWT is invalid or expired.

**Solutions:**
1. Re-login to get fresh token
2. Check JWT_SECRET matches between environments
3. Check token expiry time

### Issue 4: Different domain/port

**Problem:** Frontend on `localhost:5173`, backend on `localhost:8000` but cookie not sent.

**Solution:**
```typescript
// Cookie MUST be set with correct settings:
res.cookie('jwt', token, {
  httpOnly: true,
  secure: false,  // false for localhost
  sameSite: 'lax', // or 'none' if HTTPS
  path: '/',
  // NO domain for localhost!
});
```

## Next Steps

1. **Restart backend** with the new logging
2. **Open waiter app** and try to connect
3. **Check backend console** for the debug output
4. **Share the console output** if it's still failing

The debug logs will tell us EXACTLY what's being sent/received!
