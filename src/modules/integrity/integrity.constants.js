const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/** Expected modular monolith boundaries (read-only filesystem check). */
const REQUIRED_MODULE_PATHS = [
  'src/modules/orders/order-transaction.service.js',
  'src/modules/orders/order-state-machine.service.js',
  'src/modules/orders/order-realtime-events.js',
  'src/infrastructure/outbox/outbox.service.js',
  'src/infrastructure/outbox/outbox-worker.js',
  'src/infrastructure/outbox/outbox-publisher.js',
  'src/common/guards/auth.guard.js',
  'src/common/utils/tenant-scope.js',
  'models/OutboxEvent.js',
  'models/OrderIdempotency.js',
];

const DEPRECATED_OR_DUPLICATE_PATHS = [
  {
    rel: 'src/modules/orders/post-commit-emitter.js',
    reason: 'Superseded by transactional outbox; should not be used for new emits',
  },
  {
    rel: 'app.js',
    reason: 'Legacy entry shim — ensure traffic uses src/server.js',
  },
];

const CANONICAL_SOCKET_EVENTS = [
  'order:create',
  'order:status-updated',
  'order-paid',
  'order-canceled',
  'order-updated',
  'new-order',
  'inventory:stock-updated',
  'inventory:low-stock-alert',
  'notification',
];

const ALLOWED_DIRECT_EMIT_FILES = new Set([
  'src/infrastructure/outbox/outbox-publisher.js',
  'src/infrastructure/websocket/socket-server.js',
  'socket.js',
]);

const CODE_SCAN_ROOTS = ['controllers', 'services', 'src/modules', 'src/infrastructure'];

const INTEGRITY_SAMPLE_LIMIT = Number(process.env.INTEGRITY_SAMPLE_LIMIT) || 500;

module.exports = {
  PROJECT_ROOT,
  REQUIRED_MODULE_PATHS,
  DEPRECATED_OR_DUPLICATE_PATHS,
  CANONICAL_SOCKET_EVENTS,
  ALLOWED_DIRECT_EMIT_FILES,
  CODE_SCAN_ROOTS,
  INTEGRITY_SAMPLE_LIMIT,
};
