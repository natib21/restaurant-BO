/**
 * ============================================================================
 * IMPORTANT: Sentry must be initialized FIRST, before all other code.
 * This allows Sentry to capture unhandled exceptions and rejections globally.
 * ============================================================================
 */
const Sentry = require('@sentry/node');
const { 
  initSentry,
  captureGlobalException,
  captureGlobalRejection,
  setBackgroundWorkerContext,
} = require('./infrastructure/monitoring/sentry');
initSentry();

const chalk = require('chalk');
const { logger } = require('../utils/logger');
const { loadEnv } = require('./config/env');
const { connectDatabase, getConnectionState, getReplicaSetStatus } = require('./common/database/connection');
const { createApp } = require('./app/create-app');
const { createSocketServer } = require('./infrastructure/websocket/socket-server');
const { startOutboxWorker, getOutboxWorker } = require('./infrastructure/outbox/outbox-worker');
const {
  startIntegrityScheduler,
  stopIntegrityScheduler,
} = require('./modules/integrity/integrity.scheduler');
const {
  startSubscriptionScheduler,
  stopSubscriptionScheduler,
} = require('./modules/subscriptions/subscription.scheduler');

// ══════════════════════════════════════════════════════════════════════════════
// Global health status — exported for /health/ready endpoint to access
// ══════════════════════════════════════════════════════════════════════════════
const globalHealth = {
  outboxWorker: null,
  integrityScheduler: null,
  subscriptionScheduler: null,
};

// ══════════════════════════════════════════════════════════════════════════════
// Global error handlers with Sentry integration
// Sentry DOES NOT replace existing logging/exit behavior — it enhances it
// ══════════════════════════════════════════════════════════════════════════════

process.on('uncaughtException', async err => {
  // 1. Send to Sentry (async, must wait for flush)
  captureGlobalException(err, { context: 'uncaughtException' });
  
  // 2. Log locally (existing behavior)
  logger.error(`UNHANDLED EXCEPTION: ${err.name} - ${err.message}`);
  
  // 3. Flush Sentry (wait up to 2 seconds for errors to send to Sentry servers)
  // This is critical — without this, the process exits before HTTP request completes
  try {
    if (Sentry.close) {
      await Sentry.close(2000);
    }
  } catch (flushErr) {
    logger.error(`Sentry flush error: ${flushErr.message}`);
  }
  
  // 4. Exit process (existing behavior)
  process.exit(1);
});

async function bootstrap() {
  const env = loadEnv();
  const app = createApp();

  await connectDatabase();
  logger.info(chalk.white.bgGreen('MongoDB connected successfully!'));

  const server = createSocketServer(app);
  const outboxWorker = startOutboxWorker();
  const integrityScheduler = startIntegrityScheduler();
  const subscriptionScheduler = startSubscriptionScheduler();

  // ────────────────────────────────────────────────────────────────────────────
  // Store references in globalHealth for /health/ready endpoint to access
  // ────────────────────────────────────────────────────────────────────────────
  globalHealth.outboxWorker = outboxWorker;
  globalHealth.integrityScheduler = integrityScheduler;
  globalHealth.subscriptionScheduler = subscriptionScheduler;

  const httpServer = server.listen(env.PORT || 3000, () => {
    logger.info(
      chalk.bgCyan(`Server running on port ${env.PORT || 3000} [${env.NODE_ENV || 'development'}]`)
    );
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Unhandled Rejection Handler (Sentry + existing logging/exit)
  // ════════════════════════════════════════════════════════════════════════════
  process.on('unhandledRejection', async err => {
    // 1. Send to Sentry (async, must wait for flush)
    captureGlobalRejection(err, { context: 'unhandledRejection' });
    
    // 2. Log locally (existing behavior)
    logger.error(`UNHANDLED REJECTION: ${err.name} - ${err.message}`);
    
    // 3. Close server
    httpServer.close();
    
    // 4. Flush Sentry (wait up to 2 seconds for errors to send to Sentry servers)
    // This is critical — without this, the process exits before HTTP request completes
    try {
      if (Sentry.close) {
        await Sentry.close(2000);
      }
    } catch (flushErr) {
      logger.error(`Sentry flush error: ${flushErr.message}`);
    }
    
    // 5. Exit process (existing behavior)
    process.exit(1);
  });

  const shutdown = async signal => {
    logger.info(`${signal} received — shutting down gracefully`);
    if (outboxWorker) {
      await outboxWorker.stop();
    }
    stopIntegrityScheduler();
    if (integrityScheduler?.stop) integrityScheduler.stop();
    stopSubscriptionScheduler();
    if (subscriptionScheduler?.stop) subscriptionScheduler.stop();
    httpServer.close(() => process.exit(0));
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch(err => {
  logger.error(`Bootstrap failed: ${err.message}`);
  process.exit(1);
});

// ══════════════════════════════════════════════════════════════════════════════
// Export global health status for /health/ready endpoint to access worker status
// ══════════════════════════════════════════════════════════════════════════════
module.exports = { globalHealth };
