# Socket.IO HttpOnly Cookie Fix - Quick Summary

## ✅ What Was Fixed

**Problem:** Your JWT is in an HttpOnly cookie, so the frontend can't access it to pass to Socket.IO.

**Solution:** Modified backend to automatically read JWT from cookies.

---

## Backend Changes Made

**File:** `src/infrastructure/websocket/socket-server.ts`

Added cookie parsing to `authenticateStaffSocket()`:

```typescript
// ✅ NEW: Parse cookies and check for JWT
if (!token) {
  const cookieHeader = socket.handshake.headers.cookie;
  const cookies = parseCookies(cookieHeader);
  token = cookies.jwt || cookies.token;
}
```

Now the backend checks for JWT in **3 places**:
1. `socket.handshake.auth.token` (manual)
2. `Authorization` header
3. **HttpOnly cookie** ← NEW!

---

## Frontend - What You Need

**Your Socket.ts file should have:**

```typescript
const newSocket = io(SOCKET_URL, {
  withCredentials: true,  // ← REQUIRED to send cookies!
  transports: ['websocket'],
  reconnection: true,
  // NO auth.token needed! Cookie is sent automatically
});
```

**Remove these if you added them:**
- ❌ `auth: { token: ... }` - Not needed anymore
- ❌ `Cookies.get('jwt')` - Can't access HttpOnly cookie anyway

**Keep:**
- ✅ `withCredentials: true` - Required!
- ✅ `setup:session` emit after connection

---

## Next Steps

### 1. Restart Your Backend Server

```bash
npm start
```

### 2. Update Your Frontend Socket.ts

Make sure it has:
```typescript
const newSocket = io(SOCKET_URL, {
  withCredentials: true,  // ← This sends cookies
  transports: ['websocket'],
  reconnection: true,
});
```

### 3. Test Connection

Open your merchant/waiter app and check console:

**Success:**
```
✅ Socket connected: abc123xyz
```

**Backend logs should show:**
```
socket.auth.cookie {"socketId":"abc123","cookieName":"jwt"}
Staff socket connected: abc123 user=user-id
User user-id joined branch branch-id
```

### 4. Test New Order

Place an order from customer app.

**Waiter app should receive:**
```
📥 NEW ORDER: {
  orderNumber: "001",
  tableNumber: "5",
  totalAmount: 250
}
```

---

## Troubleshooting

### Still getting "Authentication required"?

**Check 1:** Is `withCredentials: true` set?
```typescript
// In your Socket.ts
withCredentials: true  // ← Must be here!
```

**Check 2:** Does JWT cookie exist?
- Open DevTools → Application → Cookies
- Look for `jwt` or `token` cookie
- Should show as HttpOnly

**Check 3:** Is cookie sent?
- DevTools → Network → WS (WebSocket)
- Click on Socket.IO connection
- Check Headers → Request Headers → Cookie
- Should see: `Cookie: jwt=eyJ...`

**Check 4:** Cookie domain/path
```javascript
// Backend cookie settings should have:
res.cookie('jwt', token, {
  httpOnly: true,
  path: '/',  // Must be root
  // domain: undefined (let browser handle)
});
```

---

## Why This Works

1. **Browser automatically sends cookies** when `withCredentials: true`
2. **Backend reads from cookie header** - no client-side access needed
3. **HttpOnly security maintained** - JWT never exposed to JavaScript
4. **Seamless authentication** - works like regular HTTP requests

---

## Summary

✅ **Backend:** Now reads JWT from HttpOnly cookies  
✅ **Frontend:** Just needs `withCredentials: true`  
✅ **Security:** HttpOnly protection maintained  
✅ **No changes needed:** to cookie setup or JWT verification  

**Test it now!** Restart backend, reload frontend, and check if socket connects. 🚀
