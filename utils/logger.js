// utils/logger.js
const winston = require('winston');
const chalk = require('chalk');
require('dotenv').config({ path: './config.env' });

// ──────────────────────────────────────────────────────────────
// 1. Colorize log levels for console
// ──────────────────────────────────────────────────────────────
const colorizeLevel = winston.format(info => {
  const level = info.level.toUpperCase();
  switch (info.level) {
    case 'error':
      info.level = chalk.red(level);
      break;
    case 'warn':
      info.level = chalk.yellow(level);
      break;
    case 'info':
      info.level = chalk.cyan(level);
      break;
    case 'http':
      info.level = chalk.magenta(level);
      break;
    case 'debug':
      info.level = chalk.gray(level);
      break;
  }
  return info;
});

// ──────────────────────────────────────────────────────────────
// 2. Console format (pretty + color)
// ──────────────────────────────────────────────────────────────
const consoleFormat = winston.format.combine(
  colorizeLevel(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, requestId, userId, merchantId }) => {
    const extras = [];
    if (requestId) extras.push(`reqId:${requestId}`);
    if (userId) extras.push(`user:${userId}`);
    if (merchantId) extras.push(`merchant:${merchantId}`);
    const extraStr = extras.length ? chalk.gray(`[${extras.join(' ')}]`) : '';
    return `${chalk.gray(timestamp)} ${level} ${extraStr} ${message}`;
  })
);

// ──────────────────────────────────────────────────────────────
// 3. File format (clean JSON)
// ──────────────────────────────────────────────────────────────
const fileFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

// ──────────────────────────────────────────────────────────────
// 4. Create logger
// ──────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// ──────────────────────────────────────────────────────────────
// 5. Morgan stream → winston logger
// ──────────────────────────────────────────────────────────────
const morganStream = {
  write: message => {
    // Remove trailing newline
    const msg = message.trim();

    // Extract requestId, userId, merchantId from res.locals (set by middleware)
    const { requestId, userId, merchantId } = require('express').locals || {};

    logger.http(msg, { requestId, userId, merchantId });
  },
};

// Support both `const { logger }` and `const logger` import styles
module.exports = Object.assign(logger, { logger, morganStream });
