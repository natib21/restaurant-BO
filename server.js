const mongoose = require('mongoose');

const logger = require('./utils/logger');

const dotenv = require('dotenv');

const { createSocketServer } = require('./socket');

process.on('uncaughtException', (err) => {
  logger.error(`UNHANDLED EXCEPTION: ${err.name} - ${err.message}`);
  process.exit(1);
});

dotenv.config({ path: './config.env' });
const app = require('./app');

const server = createSocketServer(app);

const DB = process.env.DATABASE.replace(
  '<PASSWORD>',
  process.env.DATABASE_PASSWORD
);

mongoose.connect(DB).then(() => {
  logger.info('MongoDB connected successfully!');
});

const PORT = process.env.PORT || 3000;
const SERVER = app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});

process.on('unhandledRejection', (err) => {
  logger.error(`UNHANDLED REJECTION: ${err.name} - ${err.message}`);
  console.log('UNHANDLES REJECTION 🔥 SHUTTING DOWN... ');
  SERVER.close(() => {
    process.exit(1);
  });
});

const shutdown = () => {
  logger.info('Shutting down gracefully...');
  SERVER.close(() => {
    logger.info('Closed all connections. Exiting process.');
    process.exit(1);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
