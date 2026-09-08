# Business SaaS Layer (Additive)

Built on top of the production engine (transactions, outbox, state machine, idempotency, integrity audit).

**No existing API paths were changed.** New routes are under dedicated prefixes.

## New API routes (additive)

| Prefix                                        | Purpose                                |
| --------------------------------------------- | -------------------------------------- |
| `POST /api/v1/files/upload`                   | Tenant-scoped file metadata + storage  |
| `GET /api/v1/files/:id/content`               | Serve file bytes                       |
| `POST /api/v1/menu-mgmt/publish`              | Publish menu group snapshot per branch |
| `PATCH /api/v1/branch-control/:id/suspend`    | Branch lifecycle                       |
| `POST /api/v1/table-system/:id/qr/regenerate` | Signed QR (HMAC)                       |

All require staff JWT + existing `restrictTo()` task RBAC. Capability guard is **off** unless `CAPABILITY_ENFORCEMENT=true`.

## Modules

| Module        | Service                                | Models                                    |
| ------------- | -------------------------------------- | ----------------------------------------- |
| Files         | `FileManagementService`                | `FileAsset`                               |
| Menu          | `MenuManagementService`                | `MenuPublication`, `Menu.publishStatus`   |
| Branch        | `BranchControlService`                 | uses `Branch`, `MenuGroup`                |
| Tables/QR     | `TableSystemService`, `QrTokenService` | uses `Table`                              |
| Notifications | `NotificationService`                  | uses `OutboxEvent` (only path to sockets) |
| Capabilities  | `capabilities.js`, `requireCapability` | `Role.capabilities[]`                     |

## Integration points

- `OrderService.buildOrderItems` → `MenuManagementService.buildOrderableMenuFilter`
- `OrderTransactionService` → `NotificationService.notifyOrderPlaced` (in txn)
- `OrderStateMachineService` → `NotificationService` (in txn)
- `InventoryService` → `NotificationService` (post-commit standalone adjust)

## Backward compatibility

- Existing menu items default `publishStatus: 'published'`
- Empty `Role.capabilities` → infer from role name; task RBAC unchanged
- Legacy `/api/v1/menu`, `/api/v1/branch`, `/api/v1/table` unchanged
- QR scan flow in `customerSessionController` unchanged (QrTokenService matches same HMAC format)

## Production practices (summary)

- **Files:** Metadata in Mongo, bytes in pluggable storage (local → S3 adapter later)
- **Menu:** Draft/publish/archive + immutable `MenuPublication` snapshots per branch
- **Branch:** Suspend/activate + per-branch feature flags in `branch.settings.features`
- **QR:** Branch-level `qrSecretKey` HMAC — never trust client-supplied table id alone
- **Notifications:** Only outbox worker emits sockets
- **Capabilities:** Additive; enable gradually with `CAPABILITY_ENFORCEMENT=true`

## Optional env

```env
CAPABILITY_ENFORCEMENT=false
BRANCH_ACCESS_ENFORCEMENT=false
```

## Future (not implemented)

- S3 storage adapter
- Auto-healing from `SystemIntegrityService` findings
- InventoryReservationService integration with menu publish
