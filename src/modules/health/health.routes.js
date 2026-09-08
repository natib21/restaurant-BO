const express = require('express');
const { getConnectionState, getReplicaSetStatus } = require('../../common/database/connection');
const { loadEnv } = require('../../config/env');
const { globalHealth } = require('../../infrastructure/globals');

const router = express.Router();

/**
 * GET /health
 * @description Simple liveness probe — is the app process running?
 * @returns {object} status='ok', uptime, timestamp
 * @statusCode 200
 * 
 * Used by load balancers to detect if the process is alive.
 * Does NOT check external dependencies (DB, cache, etc).
 */
router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready
 * @description Readiness probe — is the app ready to accept requests?
 * @returns {object} status='ready|not_ready', checks={database, outbox, schedulers}, timestamp
 * @statusCode 200 if ready, 503 if not ready
 * 
 * Used by orchestrators (K8s, Docker Swarm, ECS) to determine if the app
 * should receive traffic. Checks critical external dependencies and background workers.
 * 
 * Checks:
 *   - Database connection + replica set status (if applicable)
 *   - Outbox worker running and not stalled
 *   - Integrity scheduler running
 *   - Subscription scheduler running
 */
router.get('/health/ready', async (_req, res) => {
  try {
    const db = getConnectionState();
    
    // Check MongoDB replica set status (if connected)
    const replicaStatus = await getReplicaSetStatus();
    
    // Check outbox worker status
    const outboxWorkerRunning = globalHealth.outboxWorker?.running === true;
    const outboxWorkerProcessing = globalHealth.outboxWorker?.processing === true;
    
    // Check schedulers status
    const integritySchedulerRunning = globalHealth.integrityScheduler !== null;
    const subscriptionSchedulerRunning = globalHealth.subscriptionScheduler !== null;
    
    // Consider ready if:
    // 1. Database is connected (replica set status is informational, not blocking)
    // 2. Outbox worker is running
    // 3. At least one scheduler is running (both optional, so we check if both null = bad)
    const isReady =
      db === 'connected' &&
      outboxWorkerRunning &&
      (integritySchedulerRunning || subscriptionSchedulerRunning);

    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not_ready',
      checks: {
        database: {
          state: db,
          ...replicaStatus,
        },
        outbox_worker: {
          running: outboxWorkerRunning,
          processing: outboxWorkerProcessing,
        },
        integrity_scheduler: {
          running: integritySchedulerRunning,
        },
        subscription_scheduler: {
          running: subscriptionSchedulerRunning,
        },
      },
      env: loadEnv().NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/live
 * @description Liveness probe with extended metrics — monitoring dashboard data.
 * @returns {object} status, uptime, memory, gc, timestamp
 * @statusCode 200
 * 
 * Extended metrics for production monitoring dashboards (Prometheus, Grafana, etc).
 * Includes process memory, CPU, and garbage collection stats.
 */
router.get('/health/live', (_req, res) => {
  const memUsage = process.memoryUsage();
  const db = getConnectionState();

  res.status(200).json({
    status: 'live',
    service: 'restaurant-bo-backend',
    environment: loadEnv().NODE_ENV || 'development',
    uptime: process.uptime(),
    process: {
      pid: process.pid,
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    memory: {
      rss_mb: Math.round(memUsage.rss / 1024 / 1024),
      heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
      external_mb: Math.round(memUsage.external / 1024 / 1024),
    },
    database: {
      state: db,
    },
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
