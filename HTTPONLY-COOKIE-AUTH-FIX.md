# HttpOnly Cookie Authentication Fix for Socket.IO

## Problem

The merchant/waiter frontend stores the JWT token in an **HttpOnly cookie** (for security), but Socket.IO was only checking for the token in:
1. `socket.handshake.auth.token` (requires client-side access)
2. `Authorization` header (requires client-side access)

Since HttpOnly cookies **cannot be accessed by client-side JavaScript**, the frontend couldn't pass the token, causing the error:
```
CONNECT ERROR: Authentication required
```

## Solution

Modified the backend Socket.IO authentication to **read the JWT from cookies** automatically.

### Backend Changes

**File:** `src/infrastructure/websocket/socket-server.ts`

Added cookie parsing and multi-source token lookup:

```typescript
/**
 * Parse cookies from cookie header string
 */
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.split('=');
    if (name && rest.length) {
      cookies[name.trim()] = rest.join('=').trim();
    }
  });
  
  return cookies;
}

async function authenticateStaffSocket(socket, next) {
  try {
    // Try multiple token sources
    let token =
      socket.handshake.auth?.token ||
      socket.handshake.headers.authorization?.split(' ')?.[1];

    // ✅ NEW: Check HttpOnly cookies
    if (!token) {
      const cookieHeader = socket.handshake.headers.cookie;
      const cookies = parseCookies(cookieHeader);
      token = cookies.jwt || cookies.token; // Try both cookie names
    }

    if (!token) {
      return next(new Error('Authentication required'));
    }

    // ... rest of authentication logic
  } catch {
    next(new Error('Invalid or expired token'));
  }
}
```

### Token Lookup Priority

The backend now checks for JWT token in this order:
1. `socket.handshake.auth.token` (client explicitly provides)
2. `Authorization: Bearer <token>` header
3. **`jwt` or `token` HttpOnly cookie** ← NEW!

## Frontend Requirements

Your frontend can now connect WITHOUT manually passing the token:

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8000', {
  transports: ['websocket'],
  withCredentials: true,  // ← REQUIRED to send cookies!
  reconnection: true,
});

socket.on('connect', () => {
  console.log('✅ Connected:', socket.id);
  
  // Join branch room
  socket.emit('setup:session', {
    branchId: currentBranchId
  });
});

socket.on('order:new', (orderData) => {
  console.log('📥 New order:', orderData);
});
```

### Critical Settings

1. **`withCredentials: true`** - Must be enabled to send cookies with Socket.IO requests
2. **CORS must allow credentials** - Backend already configured with:
   ```javascript
   cors: {
     origin: origins,
     methods: ['GET', 'POST'],
     credentials: true  // ← Required for cookies
   }
   ```

## How It Works

### Step 1: Frontend Connects
```typescript
const socket = io('http://localhost:8000', {
  withCredentials: true  // Browser includes cookies
});
```

### Step 2: Browser Sends Cookies
When the Socket.IO connection is made, the browser automatically includes all cookies for that domain in the `Cookie` header:
```
Cookie: jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; other=values
```

### Step 3: Backend Parses Cookies
```typescript
const cookieHeader = socket.handshake.headers.cookie;
// "jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; other=values"

const cookies = parseCookies(cookieHeader);
// { jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', other: 'values' }

const token = cookies.jwt || cookies.token;
// eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 4: Backend Verifies JWT
```typescript
const decoded = await verifyJwt(token, env.JWT_SECRET);
const user = await User.findById(decoded.id)
  .populate('role')
  .populate('merchant');

if (!user || !user.isActive) {
  return next(new Error('User not found or inactive'));
}

socket.data.user = user;
socket.data.userType = 'staff';
// ... authentication successful
```

## Testing

### 1. Check Cookie Exists
In browser DevTools:
```javascript
// Check if JWT cookie exists (won't show value if HttpOnly)
document.cookie.includes('jwt') // Should be true if cookie exists
```

Or in Network tab:
- Look for the Socket.IO connection request
- Check Request Headers for `Cookie: jwt=...`

### 2. Test Socket Connection
```typescript
socket.on('connect', () => {
  console.log('✅ Socket connected:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection failed:', error.message);
});
```

### 3. Check Backend Logs
When connection succeeds, you should see:
```
socket.auth.cookie {"socketId":"abc123","cookieName":"jwt","tokenPreview":"eyJhbGciOiJIUzI1NiIs..."}
Staff socket connected: abc123 user=user-id-here
User user-id-here joined branch branch-id-here
```

## Troubleshooting

### Error: "Authentication required"
**Cause:** Cookie not being sent or no JWT in cookie

**Check:**
1. Cookie exists in browser
2. `withCredentials: true` is set in socket config
3. Cookie domain matches Socket.IO server domain
4. Cookie hasn't expired

**Debug:**
```typescript
// In backend socket-server.ts, the logger will show:
socket.auth.failed {
  socketId: 'abc123',
  reason: 'No token found in auth, header, or cookies',
  hasAuth: false,
  hasAuthHeader: false,
  hasCookie: true/false  // Check this!
}
```

### Cookie Not Sent Across Origins

If your frontend is on `http://localhost:5173` and backend is on `http://localhost:8000`, cookies should work.

However, if you're using different domains (e.g., `app.example.com` and `api.example.com`), you need:

1. **SameSite=None** on the cookie:
   ```javascript
   res.cookie('jwt', token, {
     httpOnly: true,
     secure: true,  // Required with SameSite=None
     sameSite: 'none',
     // ...
   });
   ```

2. **HTTPS** (required for SameSite=None)

3. **Explicit CORS origin** (not wildcard):
   ```javascript
   cors: {
     origin: 'https://app.example.com',
     credentials: true
   }
   ```

### Cookie Exists But Still Fails

**Check cookie path:**
```javascript
// Cookie must be accessible to Socket.IO path
res.cookie('jwt', token, {
  path: '/',  // Make sure it's root path
  // ...
});
```

**Check cookie domain:**
```javascript
// Don't set domain for localhost
res.cookie('jwt', token, {
  // domain: undefined  // Let browser handle it
  // ...
});
```

## Security Notes

✅ **HttpOnly cookies are MORE secure** than localStorage/sessionStorage because:
- Cannot be accessed by JavaScript (XSS protection)
- Automatically sent with requests
- Browser handles security

✅ **This implementation is secure** because:
- Only reads cookie, doesn't expose it to client
- JWT is still verified server-side
- All existing JWT security checks still apply

⚠️ **CSRF Protection:** Consider adding CSRF tokens for state-changing operations (not needed for Socket.IO read-only events)

## Complete Frontend Example

```typescript
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8000';

export function createSocket(currentBranchId: string): Socket {
  const socket = io(SOCKET_URL, {
    transports: ['websocket'],
    withCredentials: true,  // ← CRITICAL for HttpOnly cookies
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('✅ Socket connected:', socket.id);
    
    // Join branch room
    socket.emit('setup:session', {
      branchId: currentBranchId,
    });
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error.message);
  });

  socket.on('order:new', (orderData) => {
    console.log('📥 NEW ORDER:', orderData);
    // Handle new order
  });

  return socket;
}
```

## Summary

**Before:** Frontend couldn't access HttpOnly cookie, so Socket.IO authentication failed.

**After:** Backend automatically reads JWT from HttpOnly cookie, authentication works seamlessly.

**Frontend change:** Just ensure `withCredentials: true` is set (no token passing needed).

**Backend change:** Added cookie parsing to `authenticateStaffSocket()` function.

✅ **Result:** Secure HttpOnly cookie authentication working with Socket.IO!
