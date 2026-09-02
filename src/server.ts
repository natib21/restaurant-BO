import chalk from 'chalk';
import { loadEnv } from './config/env';
import { logger } from './common/logger';
import { connectDatabase } from './common/database/connection';
import { createApp } from './app/create-app';

const { createSocketServer } = require('./infrastructure/websocket/socket-server');

process.on('uncaughtException', err => {
  logger.error(`UNHANDLED EXCEPTION: ${err.name} - ${err.message}`);
  process.exit(1);
});

async function bootstrap() {
  try {
    const env = loadEnv();
    console.log('✅ Environment loaded');
    
    const app = createApp();
    console.log('✅ App created');

    await connectDatabase();
    logger.info(chalk.white.bgGreen('MongoDB connected successfully!'));
    console.log('✅ Database connected');

    const server = createSocketServer(app);
    console.log('✅ Socket server created');

    const httpServer = server.listen(env.PORT, () => {
      logger.info(chalk.bgCyan(`Server running on port ${env.PORT} [${env.NODE_ENV}]`));
      console.log('✅ Server listening on port', env.PORT);
    });

    process.on('unhandledRejection', (err: Error) => {
      logger.error(`UNHANDLED REJECTION: ${err.name} - ${err.message}`);
      httpServer.close(() => process.exit(1));
    });

    const shutdown = (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully`);
      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('❌ Bootstrap failed:', err);
    logger.error(`Bootstrap failed: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error) console.error('Stack:', err.stack);
    process.exit(1);
  }
}

bootstrap().catch(err => {
  console.error('❌ Bootstrap error:', err);
  process.exit(1);
});
