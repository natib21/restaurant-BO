const express = require('express');

const morgan = require('morgan');
const menuRouter = require('./routes/menuRouter');
const orderRouter = require('./routes/orderRouter');
const userRouter = require('./routes/userRouter');
const tableRouter = require('./routes/tableRouter');
const app = express();
app.use(express.json());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use((req, res, next) => {
  console.log('Hello From The middleware');
  next();
});
app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  next();
});

app.use('/api/menu', menuRouter);
app.use('/api/order', orderRouter);
app.use('/api/user', userRouter);
app.use('/api/table', tableRouter);

module.exports = app;
