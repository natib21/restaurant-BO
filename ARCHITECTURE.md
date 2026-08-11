# Modular Architecture (`refactor/modular-architecture`)



NestJS-inspired layout on Express. Legacy `controllers/`, `routes/`, `models/` remain until each domain is migrated.



## Directory map



```text

src/

├── app/create-app.js           # Express factory

├── server.js                   # Bootstrap

├── config/env.js               # Env + Mongo URI

├── common/

│   ├── database/

│   ├── errors/

│   ├── guards/auth.guard.js    # protect, restrictTo (RBAC)

│   ├── validators/validate.js  # Request DTO validation

│   ├── middleware/request-context.middleware.js

│   ├── utils/tenant-scope.js

│   ├── types/                  # TS RequestContext

│   └── response/

├── modules/

│   ├── auth/                   # Service, controller, validation

│   ├── customers/              # Table session guard

│   ├── health/

│   └── orders/order.service.js

└── infrastructure/

    ├── websocket/socket-server.js

    └── payments/payment-provider.interface.js

```



## Request context (`req.ctx`)



| Field | Staff JWT | Table session |

|-------|-----------|---------------|

| `merchantId` | `user.merchant` | `session.merchant` |

| `branchId` | first `user.branch[]` | `session.branch` |

| `actorType` | `staff` | `customer` / `anonymous` |



Use `src/common/utils/tenant-scope.js` — never assume `req.user` on customer routes.



## Module migration status



| Module | Status |

|--------|--------|

| auth | **Migrated** — `AuthService`, guards, validation; `authController.js` re-exports |

| customers | **Partial** — `protectTableSession` guard |

| orders | **Partial** — `buildOrderItems`, status queries, transitions |

| inventory | **Planned** — move `services/InventoryService.js` |

| health | **Done** |

| merchant / menu | **Planned** — split god controllers |



## Running



```bash

npm install

cp .env.example config.env

npm run dev      # node --watch src/server.js (or tsx after install)

npm start

npm test

```



## API compatibility



- Paths unchanged under `/api/v1/*`

- Ingredients: `GET/POST /api/v1/ingredients` (fixed double path)

- Orders: `GET /api/v1/order/merchant/all` (route order fixed)

- Socket.IO: pass JWT as `auth: { token: '<jwt>' }`



## Security defaults



- Helmet + rate limits enabled

- User list/delete protected with RBAC

- Payment provider keys from env only (`PAYMENT_PROVIDER`, `CHAPA_API_KEY`, `CHAPA_WEBHOOK_SECRET`)

- Password change invalidates old JWTs via `passwordChangedAt`



## Phase 1 (tenant safety) — applied

- User list/update/delete scoped by merchant; role escalation blocked on `PATCH /api/v1/user/:id`
- `protectCustomer` enforces merchant + table session alignment
- Order staff queries use `OrderService.getMerchantId` / `merchantScopedQuery`
- RBAC on staff order routes, menu groups, session admin list
- Customer router: staff vs table-session routes separated

## Next steps

1. Move `InventoryService` into `src/modules/inventory/`

2. Thin `orderController` — one handler file per concern or route group

3. Add Zod (`npm install zod`) and replace `validate.js` schemas

4. Single Mongo session for order + inventory deduction

5. Integration tests with test DB


