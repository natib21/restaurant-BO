# Telegram Integration — Backend Guide

This document describes everything the backend exposes for the Telegram integration: data models, endpoints, request/response payloads, environment variables, and the event flow end to end. Use this as the contract when building the merchant back-office and customer app frontends.

---

## 1. Overview

Each merchant connects **their own** Telegram bot (created via [@BotFather](https://t.me/BotFather)). Customers link their Telegram account to their CRM profile by tapping a deep link that opens a chat with that merchant's bot and sends `/start <token>`. Once linked, the merchant can message that customer (order updates, promos) via the bot — and, via the two-way chat feature (§4.8–4.10), hold a full conversation entirely inside the back-office.

```
Merchant BO          Backend                    Telegram
─────────────        ────────────────           ─────────────
Paste bot token  →   validate + register    →   setWebhook()
                      webhook, store secret

Customer app     →   generate link token    
(post-checkout)      (short-lived)

Customer taps    ─────────────────────────  →   opens chat, sends
deep link                                       /start <token>

                 ←───────────────────────── ←   webhook POST
Backend resolves token, links
customer.telegram, sends welcome msg

Merchant BO      →   POST .../telegram/send  →   sendMessage()  →  Telegram  →  Customer
Customer replies ─────────────────────────  →   webhook POST   →  logged as inbound TelegramMessage
Merchant BO      ←   GET .../conversations   ←   reads message log, no Telegram app needed
```

---

## 2. Data models

### 2.1 `Merchant` (relevant fields)

| Field | Type | Notes |
|---|---|---|
| `telegramBotToken` | String | From BotFather. `select: false` — never returned by default queries. |
| `telegramBotUsername` | String | Public `@username`, used to build deep links. Safe to expose to frontend. |
| `telegramWebhookSecret` | String | Random secret Telegram echoes back on every webhook call. `select: false`. |
| `telegramBotConnectedAt` | Date | Set when connection succeeds. `null`/absent = not connected. |
| `telegramChannel` | String | Optional broadcast channel handle (separate feature, not covered here). |

### 2.2 `Customer.telegram` (subdocument)

| Field | Type | Notes |
|---|---|---|
| `id` | String | Telegram's global user id. |
| `chatId` | String | Chat id used to send messages to this customer. |
| `username` | String | Telegram `@username`, optional (not all users have one). |
| `firstName` | String | From Telegram profile. |
| `profilePic` | String | Optional, if you fetch it separately via `getUserProfilePhotos`. |
| `linked` | Boolean | `true` once `/start` has been resolved successfully. |
| `linkedAt` | Date | |
| `optIn` | Boolean | Marketing consent. Set `true` on link, `false` on `/stop`. |
| `optInAt` | Date | |
| `lastInteractionAt` | Date | Updated on every inbound message. |

### 2.3 `TelegramLinkToken`

| Field | Type | Notes |
|---|---|---|
| `token` | String | Random hex, unique. Embedded in the deep link. |
| `merchant` | ObjectId → Merchant | |
| `customer` | ObjectId → Customer | Nullable — see §5.3 for table-only tokens. |
| `branch` | ObjectId → Branch | Optional, tags which branch generated the link. |
| `table` | String | Optional, table identifier if generated from table QR. |
| `used` | Boolean | Set `true` once consumed. |
| `usedAt` | Date | |
| `expiresAt` | Date | TTL-indexed — MongoDB auto-deletes expired tokens. |

### 2.4 `TelegramMessage`

Powers the two-way chat feature (§4.8–4.10) — one row per message, either direction.

| Field | Type | Notes |
|---|---|---|
| `merchant` | ObjectId → Merchant | |
| `customer` | ObjectId → Customer | |
| `direction` | String enum: `in` / `out` | `in` = customer → merchant, `out` = merchant → customer |
| `text` | String | |
| `telegramMessageId` | String | Telegram's own `message_id`, for dedup/troubleshooting |
| `readAt` | Date, nullable | Set when the merchant views it in the dashboard (§4.10) |
| `createdAt` | Date | |

---

## 3. Environment variables

| Variable | Required | Description |
|---|---|---|
| `PUBLIC_API_BASE_URL` | Yes | Public HTTPS base URL of this backend, e.g. `https://api.menuroom.et`. Used to build the webhook URL passed to Telegram's `setWebhook`. |

---

## 4. Endpoints

### 4.1 `POST /api/v1/merchant/:merchantId/telegram/connect`

Authenticated (merchant owner/admin). Validates the bot token, registers the webhook with Telegram, and stores credentials.

**Request**
```
POST /api/v1/merchant/64f1.../telegram/connect
Authorization: Bearer <token>
Content-Type: application/json

{
  "botToken": "123456789:AAExampleBotTokenHere"
}
```

**Response — 200**
```json
{
  "message": "Telegram bot connected successfully",
  "botUsername": "marios_pizza_bot"
}
```

**Response — 400** (missing token)
```json
{ "message": "botToken is required" }
```

**Response — 404**
```json
{ "message": "Merchant not found" }
```

**Response — 500** (invalid token, or Telegram API rejected `setWebhook`)
```json
{ "message": "Telegram getMe failed: Unauthorized" }
```

---

### 4.2 `GET /api/v1/merchant/:merchantId/telegram/status`

Authenticated. Returns current connection state for the BO settings page.

**Response — 200 (connected)**
```json
{
  "connected": true,
  "botUsername": "marios_pizza_bot",
  "connectedAt": "2026-08-01T09:12:00.000Z",
  "linkedCustomersCount": 312,
  "optInCount": 289
}
```

**Response — 200 (not connected)**
```json
{ "connected": false }
```

---

### 4.3 `DELETE /api/v1/merchant/:merchantId/telegram/disconnect`

Authenticated. Clears stored bot credentials. Existing `customer.telegram` links are **not** deleted — they simply stop receiving messages until reconnected.

**Response — 200**
```json
{ "message": "Telegram bot disconnected" }
```

---

### 4.4 `POST /api/v1/telegram/webhook/:merchantId`

**Public** — called by Telegram's servers, not by your frontend. No user auth; verified via the `X-Telegram-Bot-Api-Secret-Token` header against the merchant's stored `telegramWebhookSecret`.

**Request headers**
```
X-Telegram-Bot-Api-Secret-Token: <merchant's telegramWebhookSecret>
```

**Request body** (Telegram's standard [Update](https://core.telegram.org/bots/api#update) object — example for `/start`)
```json
{
  "update_id": 123456789,
  "message": {
    "message_id": 42,
    "from": {
      "id": 987654321,
      "is_bot": false,
      "first_name": "Abebe",
      "username": "abebe_t"
    },
    "chat": { "id": 987654321, "type": "private" },
    "date": 1723456789,
    "text": "/start 3f9a1c2e8b7d4e5f"
  }
}
```

**Response** — always `200` immediately (Telegram retries aggressively on non-200 or slow responses). All processing happens after the response is sent; failures are logged, not surfaced to Telegram.

**Behavior by message text:**

| Input | Behavior |
|---|---|
| `/start <token>` | Resolves the link token, updates `customer.telegram`, sends a welcome message. |
| `/start` (no token) | Sends "This link seems invalid or expired" message. |
| `/stop` or `stop` | Sets `customer.telegram.optIn = false` (matched by `chatId`), sends unsubscribe confirmation. |
| anything else | Sends a generic fallback message pointing them to the ordering flow. |

**Also, regardless of text:** if the sender's `chatId` matches a linked customer, the inbound message is logged as a `TelegramMessage` (`direction: 'in'`) and `customer.telegram.lastInteractionAt` is updated — this is what feeds the two-way chat in §4.8–4.10.

---

### 4.5 `POST /api/v1/merchant/:merchantId/telegram/send`

Authenticated (merchant owner/admin). Sends a message from the merchant to a specific, already-linked customer, and logs it as an outbound `TelegramMessage`.

**Request**
```
POST /api/v1/merchant/64f1.../telegram/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "customerId": "64f7...",
  "text": "Your order #1042 is ready for pickup!"
}
```

**Response — 200**
```json
{ "message": "Message sent" }
```

**Response — 400** (missing fields, or customer not linked)
```json
{ "message": "customerId and text are required" }
```
```json
{ "message": "Customer has not linked Telegram yet" }
```

**Response — 404**
```json
{ "message": "Merchant not found" }
```
```json
{ "message": "Customer not found" }
```

**Notes**
- This endpoint does **not** check `telegram.optIn` — it's intended for transactional messages (order status, pickup ready) tied to something the customer already did, as well as manual replies in the chat UI (§4.8–4.10). A future bulk/broadcast/marketing endpoint should filter to `optIn: true` customers only; this one shouldn't.
- Message text is sent as-is with `parse_mode: 'HTML'` — escape any user-generated content before interpolating it into `text` to avoid malformed HTML breaking delivery.

---

### 4.6 `POST /api/v1/customer/:customerId/telegram/link-token` — *planned, not yet implemented*

Will be called by the customer app right after checkout to generate the deep link shown to the customer.

**Planned request**
```json
{
  "branchId": "64f2...",   // optional
  "table": "T12"           // optional
}
```

**Planned response**
```json
{
  "deepLink": "https://t.me/marios_pizza_bot?start=3f9a1c2e8b7d4e5f",
  "expiresAt": "2026-08-12T10:00:00.000Z"
}
```

---

### 4.7 Two-way chat — overview

Goal: let a merchant see a customer's Telegram messages and reply, entirely inside the back-office — no separate Telegram app/login required.

This is powered by the `TelegramMessage` log (§2.4): §4.4's webhook now persists every inbound message (not just `/start`/`/stop`), and §4.5's send endpoint persists every outbound one. Three endpoints expose this to the dashboard: an inbox list (§4.8), a single thread (§4.9), and a read-receipt action (§4.10).

**Recommended dashboard flow:**
1. Messages page loads → `GET .../telegram/conversations` → render inbox list sorted by most recent, with unread badges.
2. Poll that same endpoint every ~5–10s to catch new conversations/messages while the inbox is in view.
3. Opening a thread → `GET .../telegram/conversations/:customerId` for full history, then `PATCH .../read` to clear its badge.
4. While a thread is open, poll `GET .../conversations/:customerId` every ~3s for new inbound messages.
5. Sending → `POST .../telegram/send` (§4.5), then re-fetch or optimistically append to the open thread.

Polling is the simplest first version. A websocket/SSE push on new inbound `TelegramMessage` creation is the natural upgrade once the polling version works end to end.

---

### 4.8 `GET /api/v1/merchant/:merchantId/telegram/conversations`

Authenticated. Returns one row per customer who has any `TelegramMessage` history, most recent first — the merchant's chat inbox.

**Response — 200**
```json
{
  "conversations": [
    {
      "customerId": "64f7...",
      "customerName": "Abebe Tesfaye",
      "lastMessage": "Is my order ready yet?",
      "lastMessageAt": "2026-08-11T14:02:00.000Z",
      "lastDirection": "in",
      "unreadCount": 2
    }
  ]
}
```

| Field | Notes |
|---|---|
| `lastDirection` | `in` if the customer sent the most recent message, `out` if the merchant did — lets the UI show a "you replied" indicator. |
| `unreadCount` | Count of inbound (`direction: 'in'`) messages with `readAt: null` for this customer. |

---

### 4.9 `GET /api/v1/merchant/:merchantId/telegram/conversations/:customerId`

Authenticated. Returns the full message thread with one customer, oldest first, for the chat panel to render.

**Response — 200**
```json
{
  "messages": [
    {
      "_id": "64fa...",
      "direction": "out",
      "text": "Welcome, Abebe! You'll get order updates and offers here.",
      "createdAt": "2026-08-10T09:00:00.000Z",
      "readAt": null
    },
    {
      "_id": "64fb...",
      "direction": "in",
      "text": "Is my order ready yet?",
      "createdAt": "2026-08-11T14:02:00.000Z",
      "readAt": null
    }
  ]
}
```

---

### 4.10 `PATCH /api/v1/merchant/:merchantId/telegram/conversations/:customerId/read`

Authenticated. Marks all unread inbound messages in this thread as read — call this when the merchant opens the thread, so the inbox badge (§4.8 `unreadCount`) clears.

**Response — 200**
```json
{ "message": "Marked as read" }
```

---

## 5. Notes and edge cases

### 5.1 Consent
`customer.telegram.optIn` is only ever set `true` by a successful `/start` — i.e. the customer must actively open the bot. This is the consent record; don't message anyone whose `optIn` is not `true`, except for transactional sends and manual chat replies via §4.5, which are tied to something the customer already initiated.

### 5.2 One bot per merchant, not per branch
Bot credentials live on `Merchant`, not `Branch`. Branch is recorded per link via `TelegramLinkToken.branch` and copied onto `customer.branch` at link time — see the CRM architecture discussion for reasoning.

### 5.3 Table-only tokens
If a `TelegramLinkToken` is generated from a table QR before a `Customer` record exists (`customer: null`), the current webhook handler does **not** auto-create a customer — it returns `null` and the bot sends the "invalid link" message. Extend `resolveStart` if you want anonymous-to-identified linking supported.

### 5.4 Token lifetime
Link tokens default to a 24-hour TTL (`expiresAt`), auto-deleted by MongoDB's TTL index. Adjust `ttlHours` in `createLinkToken()` if checkout-to-Telegram-tap gaps commonly exceed a day.

### 5.5 Security
- `telegramBotToken` and `telegramWebhookSecret` are both `select: false` on the `Merchant` model — never returned by default `find`/`findById` calls, must be explicitly `.select('+telegramBotToken')`.
- The webhook endpoint is intentionally unauthenticated (Telegram cannot send a Bearer token) — the secret header check *is* the authentication for that route.
- Never paste a live `telegramBotToken` into chat, tickets, commit messages, or logs. If one is ever exposed, revoke it via BotFather (`/mybots` → bot → API Token → Revoke) and reconnect with a fresh one.

### 5.6 Chat inbox performance
§4.8's conversation list uses an aggregation over `TelegramMessage` grouped by `customer`. Fine at moderate volume; if a merchant's message history grows large, consider a denormalized `lastMessageAt`/`lastMessage` pair cached directly on `Customer.telegram` (updated on every insert) instead of aggregating on every inbox load.