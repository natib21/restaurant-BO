const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-filters');
const hpp = require('hpp');
const path = require('path');
const AppError = require('./utils/appError');
const GlobalErrorHandler = require('./controllers/errorController');

const menuRouter = require('./routes/menuRouter');
const orderRouter = require('./routes/orderRouter');
const userRouter = require('./routes/userRouter');
const tableRouter = require('./routes/tableRouter');
const roleRouter = require('./routes/roleRouter');
const taskRouter = require('./routes/taskRouter');
const merchantRouter = require('./routes/merchantRouter');

const app = express();

app.use(cors());
//1) Global MiddleWare

/* app.use(helmet());

// limit requist from the same app

const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: ' Too Many Requist from this Ip,please try again in an hour',
});
app.use('/api', limiter); */

app.use('/img/menu', express.static(path.join(__dirname, 'uploads/img/menu')));

app.use(express.json(/* { limit: '100mb' } */));

app.use(mongoSanitize());

// Data Sanitization agains XSS
/* app.use((req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach((key) => {
      req.body[key] = xss.inHTMLData(req.body[key]); // Sanitize input
    });
  }
  next();
}); */
// Data security with parameter polution
app.use(hpp());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  next();
});

app.use('/api/v1/user', userRouter);
app.use('/api/v1/tasks', taskRouter);
app.use('/api/v1/roles', roleRouter);
app.use('/api/v1/merchants', merchantRouter);
app.use('/api/v1/menu', menuRouter);
app.use('/api/v1/table', tableRouter);
app.use('/api/v1/order', orderRouter);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this Server `, 404));
});
app.use(GlobalErrorHandler);
module.exports = app;



/* // app.js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const AppError = require('./utils/appError');
const GlobalErrorHandler = require('./controllers/errorController');

const { logger, morganStream } = require('./utils/logger');   // <-- NEW

// ──────────────────────────────────────────────────────────────
// Routers
// ──────────────────────────────────────────────────────────────
const menuRouter = require('./routes/menuRouter');
const orderRouter = require('./routes/orderRouter');
const userRouter = require('./routes/userRouter');
const tableRouter = require('./routes/tableRouter');
const roleRouter = require('./routes/roleRouter');
const taskRouter = require('./routes/taskRouter');
const merchantRouter = require('./routes/merchantRouter');

// ──────────────────────────────────────────────────────────────
// App
// ──────────────────────────────────────────────────────────────
const app = express();

app.use(cors());

// ----------------------------------------------------------------
// 1. Security middlewares (uncomment when you need them)
// ----------------------------------------------------------------
/* app.use(helmet());

const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour',
});
app.use('/api', limiter); */

// ----------------------------------------------------------------
// 2. Static files
// ----------------------------------------------------------------
app.use('/img/menu', express.static(path.join(__dirname, 'uploads/img/menu')));

// ----------------------------------------------------------------
// 3. Body parsers & sanitizers
// ----------------------------------------------------------------
app.use(express.json({ limit: '100mb' }));
app.use(mongoSanitize());
app.use(hpp());

// ----------------------------------------------------------------
// 4. Request-ID + optional user/merchant IDs
// ----------------------------------------------------------------
app.use((req, res, next) => {
  // short, readable request id
  req.requestId = uuidv4().slice(0, 8);
  res.locals.requestId = req.requestId;

  // If you have an auth middleware that sets `req.user`
  if (req.user) {
    res.locals.userId = req.user._id;
    res.locals.merchantId = req.user.merchant?._id || null;
  }

  // keep your old timestamp field
  req.requestTime = new Date().toISOString();
  next();
});

// ----------------------------------------------------------------
// 5. Morgan → Winston (always – dev & prod)
// ----------------------------------------------------------------
morgan.token('reqId', req => res.locals.requestId || '-');
morgan.token('userId', (req, res) => res.locals.userId || '-');
morgan.token('merchantId', (req, res) => res.locals.merchantId || '-');

app.use(
  morgan(
    ':method :url :status :res[content-length] - :response-time ms :reqId :userId :merchantId',
    { stream: morganStream }
  )
);

// ----------------------------------------------------------------
// 6. Development-only pretty morgan (optional, you already had it)
// ----------------------------------------------------------------
if (process.env.NODE_ENV === 'development') {
  // This will print the classic `GET /api/users 200 1.234 ms` in the console
  // while the full line still goes to Winston (so you get both)
  app.use(morgan('dev'));
}

// ----------------------------------------------------------------
// 7. Routes
// ----------------------------------------------------------------
app.use('/api/v1/user', userRouter);
app.use('/api/v1/tasks', taskRouter);
app.use('/api/v1/roles', roleRouter);
app.use('/api/v1/merchants', merchantRouter);
app.use('/api/v1/menu', menuRouter);
app.use('/api/v1/table', tableRouter);
app.use('/api/v1/order', orderRouter);

// ----------------------------------------------------------------
// 8. 404 & Global error handler
// ----------------------------------------------------------------
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

app.use(GlobalErrorHandler);

module.exports = app;
 */