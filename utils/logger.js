// utils/logger.js
/**
 * @description Production-ready Winston logger with:
 *  - Structured JSON output in production (stdout + files)
 *  - Pretty-printed logs in development
 *  - Sensitive field redaction (passwords, tokens, card details, PII)
 *  - Morgan HTTP logging piped through Winston
 */

const winston = require('winston');
const chalk = require('chalk');
require('dotenv').config({ path: './config.env' });

// ══════════════════════════════════════════════════════════════════════════════
// 1. REDACTION: Remove sensitive fields from all logs
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Redact sensitive fields from objects (recursively)
 * Covers: passwords, tokens, credit cards, auth headers, PII, session cookies
 */
function redactSensitiveData(obj, depth = 0) {
  if (depth > 10 || !obj || typeof obj !== 'object') return obj;

  const sensitiveKeys = new Set([
    // Authentication & secrets
    'password', 'pwd', 'secret', 'api_key', 'apiKey', 'token', 'jwt', 'refresh_token',
    'access_token', 'bearer', 'authorization', 'auth', 'cookie', 'session_id',
    'sessionid', 'sid', 'csrf_token', 'csrfToken',
    // Payment & financial
    'credit_card', 'card_number', 'card', 'cvv', 'cvc', 'expiry', 'exp',
    'stripe_token', 'stripe_key', 'chapa_key', 'payment_method', 'card_token',
    'iban', 'account_number', 'bank_code', 'pin', 'pan',
    // Personal identification
    'ssn', 'social_security_number', 'national_id', 'drivers_license',
    'passport_number', 'tin', 'tax_id', 'email', 'phone', 'mobile',
    'address', 'dob', 'date_of_birth', 'bloodtype',
    // Verification codes
    'otp', 'code', 'verification_code', 'mfa_code', 'totp',
    // API keys & endpoints (from headers)
    'x-api-key', 'x-api-secret', 'x-auth-token', 'x-access-token', 'x-refresh-token',
  ]);

  const redacted = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key in redacted) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      redacted[key] = '***REDACTED***';
    } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactSensitiveData(redacted[key], depth + 1);
    } else if (typeof redacted[key] === 'string') {
      // Redact standalone tokens/keys (JWT, bearer tokens in values)
      if (redacted[key].startsWith('Bearer ') || /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+/.test(redacted[key])) {
        redacted[key] = '***REDACTED***';
      }
    }
  }

  return redacted;
}

/**
 * Winston format that redacts sensitive data before logging
 */
const redactFormat = winston.format((info) => {
  if (info.message && typeof info.message === 'string') {
    // Redact common patterns in message strings (JWT tokens, API keys, etc)
    info.message = info.message
      .replace(/Bearer [A-Za-z0-9_-]+/gi, 'Bearer ***REDACTED***')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '***JWT_REDACTED***');
  }

  // Redact all metadata fields
  const redactedInfo = { ...info };
  for (const key in redactedInfo) {
    if (key !== 'message' && key !== 'level' && key !== 'timestamp' && typeof redactedInfo[key] === 'object') {
      redactedInfo[key] = redactSensitiveData(redactedInfo[key]);
    }
  }

  return redactedInfo;
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. COLORIZE: Format log levels for console in development
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// 3. DEVELOPMENT FORMAT: Pretty-printed with colors
// ══════════════════════════════════════════════════════════════════════════════

const consoleFormat = winston.format.combine(
  redactFormat(),
  colorizeLevel(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, requestId, userId, merchantId, ...meta }) => {
    const extras = [];
    if (requestId) extras.push(`reqId:${requestId}`);
    if (userId) extras.push(`user:${userId}`);
    if (merchantId) extras.push(`merchant:${merchantId}`);
    const extraStr = extras.length ? chalk.gray(`[${extras.join(' ')}]`) : '';

    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ' ' + JSON.stringify(meta, null, 0);
    }

    return `${chalk.gray(timestamp)} ${level} ${extraStr} ${message}${metaStr}`;
  })
);

// ══════════════════════════════════════════════════════════════════════════════
// 4. PRODUCTION FORMAT: Structured JSON (stdout + files)
// ══════════════════════════════════════════════════════════════════════════════

const productionFormat = winston.format.combine(
  redactFormat(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

// ══════════════════════════════════════════════════════════════════════════════
// 5. FILE FORMAT: Structured JSON with redaction (error.log + combined.log)
// ══════════════════════════════════════════════════════════════════════════════

const fileFormat = winston.format.combine(
  redactFormat(),
  winston.format.timestamp(),
  winston.format.json()
);

// ══════════════════════════════════════════════════════════════════════════════
// 6. CREATE LOGGER: Environment-aware configuration
// ══════════════════════════════════════════════════════════════════════════════

const isProduction = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: isProduction ? productionFormat : consoleFormat,
  transports: [
    // Console: Pretty in dev, JSON in production
    new winston.transports.Console({
      format: isProduction ? productionFormat : consoleFormat,
    }),
    // File: Always JSON (structured)
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', format: fileFormat }),
    new winston.transports.File({ filename: 'logs/combined.log', format: fileFormat }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log', format: fileFormat }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log', format: fileFormat }),
  ],
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. MORGAN STREAM: Pipe Morgan HTTP logs through Winston
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Morgan writes HTTP logs here, which pipes them through Winston
 * Ensures all logs (HTTP + application) go through the same redaction + formatting
 */
const morganStream = {
  write: message => {
    // Remove trailing newline
    const msg = message.trim();

    // Extract requestId, userId, merchantId from res.locals (set by middleware)
    // Falls back to empty strings if not available
    const requestId = global.requestId || '-';
    const userId = global.userId || '-';
    const merchantId = global.merchantId || '-';

    // Log as 'http' level with context metadata
    logger.http(msg, { requestId, userId, merchantId });
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// 8. EXPORTS: Support both import styles
// ══════════════════════════════════════════════════════════════════════════════

// Support both `const { logger }` and `const logger` import styles
module.exports = Object.assign(logger, {
  logger,
  morganStream,
  redactSensitiveData, // Export for use in other modules if needed
});
