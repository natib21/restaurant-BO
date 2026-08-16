import express, { type Express } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import path from 'path';
import cookieParser from 'cookie-parser';
import { loadEnv, getCorsOrigins } from '../config/env';
import { logger, morganStream } from '../common/logger';
import {
  initRequestContext,
  syncRequestContext,
} from '../common/middleware/request-context.middleware';
import healthRoutes from '../modules/health/health.routes';

const AppError = require('../../utils/appError');
const GlobalErrorHandler = require('../../controllers/errorController');

// Legacy routers (migrated incrementally to src/modules)
const branchGroupRouter = require('../../routes/branchMenuGroupRouter');
const menuRouter = require('../../routes/menuRouter');
const menuGroupRouter = require('../../routes/menuGroupRoute');
const orderRouter = require('../../routes/orderRouter');
const userRouter = require('../../routes/userRouter');
const tableRouter = require('../../routes/tableRouter');
const roleRouter = require('../../routes/roleRouter');
const taskRouter = require('../../routes/taskRouter');
const merchantRouter = require('../../routes/merchantRouter');
const comboRouter = require('../../routes/comboRouter');
const assignTableRouter = require('../../routes/staffAssignTabelRouter');
const customerRouter = require('../../routes/customerRouter');
const customerSessionRouter = require('../../routes/customerSessionRouter');
const branchRouter = require('../../routes/branchRouter');
const subscriptionRouter = require('../../routes/subscriptionRoutes');
const ingredientsRouter = require('../../routes/ingredientsRouter');
const inventoryRouter = require('../../routes/inventoryRoutes');
const supplierRouter = require('../../routes/supplierRoutes');
const purchaseOrderRouter = require('../../routes/purchaseOrderRoutes');
const recipeRouter = require('../../routes/recipeRoutes');

export function createApp(): Express {
  const env = loadEnv();
  const app = express();

  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

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

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

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

  app.use('/api/v1/user/login', authLimiter);
  app.use('/api/v1/user/signup', authLimiter);
  app.use('/api/v1/user/forgotPassword', authLimiter);
  app.use('/api', apiLimiter);

  app.use('/img/menu', express.static(path.join(process.cwd(), 'uploads/img/menu')));
  app.use('/img/combo', express.static(path.join(process.cwd(), 'uploads/img/combo')));
  app.use(
    '/img/orderPayment',
    express.static(path.join(process.cwd(), 'uploads/img/orderPayment'))
  );
  app.use('/img/merchants', express.static(path.join(process.cwd(), 'uploads/img/merchants')));

  app.use(express.json({ limit: '10mb' }));
  app.use(mongoSanitize());
  app.use(hpp());
  app.use(cookieParser());

  app.use(initRequestContext);
  app.use(syncRequestContext);

  morgan.token('reqId', req => (req as express.Request).ctx?.requestId || '-');
  morgan.token('userId', req => {
    const r = req as express.Request;
    return (r.user as { _id?: string })?._id?.toString() || r.ctx?.actorId?.toString() || '-';
  });
  morgan.token('merchantId', req => {
    const r = req as express.Request;
    const mid =
      r.ctx?.merchantId ||
      (r.user as { merchant?: { _id?: string } })?.merchant?._id ||
      r.merchantId;
    return mid ? String(mid) : '-';
  });

  app.use(
    morgan(
      ':method :url :status :res[content-length] - :response-time ms :reqId :userId :merchantId',
      {
        stream: {
          write: (message: string) => {
            morganStream.write(message);
          },
        },
      }
    )
  );

  if (env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  }

  app.use(healthRoutes);

  app.use('/api/v1/user', userRouter);
  app.use('/api/v1/tasks', taskRouter);
  app.use('/api/v1/roles', roleRouter);
  app.use('/api/v1/merchants', merchantRouter);
  app.use('/api/v1/menu', menuRouter);
  app.use('/api/v1/branch', branchRouter);
  app.use('/api/v1/branchGroup', branchGroupRouter);
  app.use('/api/v1/menuGroup', menuGroupRouter);
  app.use('/api/v1/menuCombo', comboRouter);
  app.use('/api/v1/table', tableRouter);
  app.use('/api/v1/staff-assignments', assignTableRouter);
  app.use('/api/v1/customer', customerRouter);
  app.use('/api/v1/customerSession', customerSessionRouter);
  app.use('/api/v1/order', orderRouter);
  app.use('/api/v1/subscriptions', subscriptionRouter);
  app.use('/api/v1/ingredients', ingredientsRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/suppliers', supplierRouter);
  app.use('/api/v1/purchase-orders', purchaseOrderRouter);
  app.use('/api/v1/recipes', recipeRouter);

  app.all('*', (req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
  });

  app.use(GlobalErrorHandler);

  return app;
}

module.exports = { createApp };
