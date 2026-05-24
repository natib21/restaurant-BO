import winston from 'winston';
import chalk from 'chalk';
import { loadEnv } from '../../config/env';

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
    default:
      break;
  }
  return info;
});

const consoleFormat = winston.format.combine(
  colorizeLevel(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, requestId, userId, merchantId }) => {
    const extras: string[] = [];
    if (requestId) extras.push(`reqId:${requestId}`);
    if (userId) extras.push(`user:${userId}`);
    if (merchantId) extras.push(`merchant:${merchantId}`);
    const extraStr = extras.length ? chalk.gray(`[${extras.join(' ')}]`) : '';
    return `${chalk.gray(timestamp)} ${level} ${extraStr} ${message}`;
  })
);

const isProd = () => loadEnv().NODE_ENV === 'production';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({
      format: isProd() ? winston.format.json() : consoleFormat,
    }),
    ...(isProd()
      ? []
      : [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]),
  ],
});

export const morganStream = {
  write: (message: string, meta?: { requestId?: string; userId?: string; merchantId?: string }) => {
    logger.http(message.trim(), meta);
  },
};

export { logger };
