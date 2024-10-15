const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const AppError = require('./utils/appError');
const GlobalErrorHandler = require('./controllers/errorController');

const menuRouter = require('./routes/menuRouter');
const orderRouter = require('./routes/orderRouter');
const userRouter = require('./routes/userRouter');
const tableRouter = require('./routes/tableRouter');

const app = express();

app.use('/img/menu', express.static(path.join(__dirname, 'uploads/img/menu')));

app.use(cors());
app.use(express.json());

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
