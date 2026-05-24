const fs = require('fs');
const path = require('path');
const OutboxEvent = require('../../../../models/OutboxEvent');
const { createIssue, capIssues } = require('../integrity-report');
const {
  PROJECT_ROOT,
  CANONICAL_SOCKET_EVENTS,
  ALLOWED_DIRECT_EMIT_FILES,
  CODE_SCAN_ROOTS,
  INTEGRITY_SAMPLE_LIMIT,
} = require('../integrity.constants');

function listJsFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      listJsFiles(abs, files);
    } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      files.push(abs);
    }
  }
  return files;
}

function relPath(abs) {
  return path.relative(PROJECT_ROOT, abs).replace(/\\/g, '/');
}

function auditNotifications({ merchantId } = {}) {
  const issues = [];

  for (const root of CODE_SCAN_ROOTS) {
    const absRoot = path.join(PROJECT_ROOT, root);
    for (const file of listJsFiles(absRoot)) {
      const rel = relPath(file);
      if (ALLOWED_DIRECT_EMIT_FILES.has(rel)) continue;
      if (rel.includes('post-commit-emitter')) {
        issues.push(
          createIssue({
            module: 'notifications',
            type: 'invalid_state',
            severity: 'warning',
            entityId: rel,
            message: `Deprecated in-memory emitter still present: ${rel}`,
            suggestion: 'Remove file after confirming all paths use OutboxService.',
            production_best_practice:
              'Transactional outbox is the production standard for reliable side effects after DB commit.',
          })
        );
        continue;
      }

      const content = fs.readFileSync(file, 'utf8');
      const hasDirectEmit =
        /\bgetIo\s*\(/.test(content) ||
        (/\bio\s*\./.test(content) && /\.emit\s*\(/.test(content));

      if (hasDirectEmit) {
        issues.push(
          createIssue({
            module: 'notifications',
            type: 'mismatch',
            severity: 'critical',
            entityId: rel,
            message: `Direct Socket.IO emit detected outside outbox publisher: ${rel}`,
            suggestion: 'Route events through OutboxService.insertEvents + OutboxWorker.',
            production_best_practice:
              'Never emit business events synchronously from controllers; use outbox for at-least-once delivery and crash safety.',
          })
        );
      }
    }
  }

  const canonicalEventsPath = path.join(
    PROJECT_ROOT,
    'src/modules/notifications/events/order-realtime-events.js'
  );
  const legacyShimPath = path.join(PROJECT_ROOT, 'src/modules/orders/order-realtime-events.js');
  const realtimeEventsPath = fs.existsSync(canonicalEventsPath)
    ? canonicalEventsPath
    : legacyShimPath;
  if (fs.existsSync(realtimeEventsPath)) {
    const content = fs.readFileSync(realtimeEventsPath, 'utf8');
    for (const eventName of CANONICAL_SOCKET_EVENTS) {
      if (!content.includes(`'${eventName}'`) && !content.includes(`"${eventName}"`)) {
        issues.push(
          createIssue({
            module: 'notifications',
            type: 'missing',
            severity: 'warning',
            entityId: eventName,
            message: `Canonical event "${eventName}" not found in order-realtime-events builder`,
            suggestion: 'Add builder helper or document intentional deprecation.',
            production_best_practice:
              'Maintain an event schema registry (versioned JSON schema) for all domain events.',
          })
        );
      }
    }
  }

  return issues;
}

async function auditNotificationsAsync({ merchantId } = {}) {
  const issues = auditNotifications({ merchantId });

  const outboxFilter = merchantId ? { merchant: merchantId } : {};
  const [failedCount, stalePending] = await Promise.all([
    OutboxEvent.countDocuments({ ...outboxFilter, status: 'failed' }),
    OutboxEvent.countDocuments({
      ...outboxFilter,
      status: 'pending',
      createdAt: { $lt: new Date(Date.now() - 15 * 60 * 1000) },
    }),
  ]);

  if (failedCount > 0) {
    issues.push(
      createIssue({
        module: 'notifications',
        type: 'invalid_state',
        severity: 'critical',
        entityId: 'outbox',
        message: `${failedCount} outbox event(s) in failed (dead-letter) state`,
        suggestion: 'Inspect logs for outbox.event.dead_letter and replay or fix Socket.IO connectivity.',
        production_best_practice:
          'Alert on dead-letter queue depth; provide admin replay tooling with idempotent consumers.',
      })
    );
  }

  if (stalePending > 0) {
    issues.push(
      createIssue({
        module: 'notifications',
        type: 'invalid_state',
        severity: 'warning',
        entityId: 'outbox',
        message: `${stalePending} outbox event(s) pending longer than 15 minutes`,
        suggestion: 'Verify OUTBOX_WORKER_ENABLED and worker health.',
        production_best_practice:
          'Run outbox workers as separate process or sidecar with horizontal scaling and Redis Socket adapter.',
      })
    );
  }

  return capIssues(issues);
}

module.exports = { auditNotifications: auditNotificationsAsync };
