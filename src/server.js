const chalk = require('chalk');
const { logger } = require('../utils/logger');
const { loadEnv } = require('./config/env');
const { connectDatabase } = require('./common/database/connection');
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

process.on('uncaughtException', err => {
  logger.error(`UNHANDLED EXCEPTION: ${err.name} - ${err.message}`);
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

  const httpServer = server.listen(env.PORT || 3000, () => {
    logger.info(
      chalk.bgCyan(`Server running on port ${env.PORT || 3000} [${env.NODE_ENV || 'development'}]`)
    );
  });

  process.on('unhandledRejection', err => {
    logger.error(`UNHANDLED REJECTION: ${err.name} - ${err.message}`);
    httpServer.close(() => process.exit(1));
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
