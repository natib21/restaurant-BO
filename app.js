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

// Data Sanitization agains NoSQL injection
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

app.use('/api/menu', menuRouter);
app.use('/api/order', orderRouter);
app.use('/api/user', userRouter);
app.use('/api/table', tableRouter);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this Server `, 404));
});

app.use(GlobalErrorHandler);

module.exports = app;
