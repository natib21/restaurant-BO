/**
 * @file src/app/create-app.js
 * @description Express application factory.
 *
 * Middleware order (matters):
 *  1. Trust proxy
 *  2. CORS
 *  3. Helmet
 *  4. Rate limiters
 *  5. Static files
 *  6. Webhook raw-body (MUST be before express.json)
 *  7. express.json
 *  8. Security: mongoSanitize, hpp
 *  9. cookieParser
 * 10. Request context (requestId, actorType, merchantId, branchId)
 * 11. Branch context enrichment
 * 12. Response helpers (res.sendSuccess / res.sendError)
 * 13. Morgan logging
 * 14. All API routes (src/routes/index.js)
 * 15. 404 catch-all
 * 16. Global error handler
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const path = require('path');
const cookieParser = require('cookie-parser');

const { loadEnv, getCorsOrigins } = require('../config/env');
const { morganStream } = require('../../utils/logger');
const {
  initRequestContext,
  syncRequestContext,
} = require('../common/middleware/request-context.middleware');
const { enrichBranchContext } = require('../common/middleware/branch-context.middleware');
const responseMiddleware = require('../common/middleware/response.middleware');
const AppError = require('../../utils/appError');
const GlobalErrorHandler = require('../../utils/globalErrorHandler');

// ── Single aggregated router (all domains) ────────────────────────────────────
const apiRoutes = require('../routes/index');

// ── Subscription webhook controller is registered by the subscriptions router ─

function createApp() {
  const env = loadEnv();
  const app = express();

  // ── 1. Trust proxy ────────────────────────────────────────────────────────
  if (env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  // ── 2. CORS ───────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const allowed = getCorsOrigins();
        if (allowed.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })
  );

  // ── 3. Helmet ─────────────────────────────────────────────────────────────
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // ── 4. Rate limiters ──────────────────────────────────────────────────────
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many auth attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: env.NODE_ENV === 'production' ? 500 : 2000,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/signup', authLimiter);
  app.use('/api/v1/auth/forgot-password', authLimiter);
  app.use('/api', apiLimiter);

  // ── 5. Static files ───────────────────────────────────────────────────────
  app.use('/img/menu', express.static(path.join(process.cwd(), 'uploads/img/menu')));
  app.use('/img/combo', express.static(path.join(process.cwd(), 'uploads/img/combo')));
  app.use(
    '/img/orderPayment',
    express.static(path.join(process.cwd(), 'uploads/img/orderPayment'))
  );
  app.use('/img/merchants', express.static(path.join(process.cwd(), 'uploads/img/merchants')));

  // ── 6. Body parser ────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));

  // ── 8. Security middleware ────────────────────────────────────────────────
  app.use(mongoSanitize());
  app.use(hpp());

  // ── 9. Cookie parser ──────────────────────────────────────────────────────
  app.use(cookieParser());

  // ── 10. Request context ───────────────────────────────────────────────────
  app.use(initRequestContext);
  app.use(syncRequestContext);

  // ── 11. Branch context ────────────────────────────────────────────────────
  app.use(enrichBranchContext);

  // ── 12. Response helpers ──────────────────────────────────────────────────
  app.use(responseMiddleware);

  // ── 13. Logging ───────────────────────────────────────────────────────────
  morgan.token('reqId', req => req.ctx?.requestId || '-');
  morgan.token('userId', req => req.user?._id?.toString() || req.ctx?.actorId?.toString() || '-');
  morgan.token('merchantId', req => {
    const mid = req.ctx?.merchantId || req.user?.merchant?._id || req.merchantId;
    return mid ? String(mid) : '-';
  });

  app.use(
    morgan(
      ':method :url :status :res[content-length] - :response-time ms :reqId :userId :merchantId',
      {
        stream: { write: msg => morganStream.write(msg.trim()) },
      }
    )
  );

  if (env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  }

  // ── 14. All API routes ────────────────────────────────────────────────────
  app.use(apiRoutes);

  // ── 15. 404 catch-all ─────────────────────────────────────────────────────
  app.all('*', (req, _res, next) => {
    next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
  });

  // ── 16. Global error handler ──────────────────────────────────────────────
  app.use(GlobalErrorHandler);

  return app;
}

module.exports = { createApp };
