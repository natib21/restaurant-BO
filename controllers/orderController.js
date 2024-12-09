const catchAsync = require('../utils/catchAsync');
const Order = require('../models/orderModel');
exports.getAllOrder = (req, res) => {
  res.status(500).json({
    status: 'Error',
    message: 'This route is not defined',
  });
};
exports.createNewOrder = catchAsync(async (req, res, next) => {
  // Only if items is coming in as a string
  /*  if (typeof req.body.items === 'string') {
    req.body.items = JSON.parse(req.body.items);
  } */

  console.log(req.body);
  const newOrder = await Order.create(req.body);
  res.status(201).json({
    status: 'success',
    order: newOrder,
  });
});
exports.getOrder = (req, res) => {
  res.status(500).json({
    status: 'Error',
    message: 'This route is not defined',
  });
};
exports.updateOrder = (req, res) => {
  res.status(500).json({
    status: 'Error',
    message: 'This route is not defined',
  });
};
exports.deleteOrder = (req, res) => {
  res.status(500).json({
    status: 'Error',
    message: 'This route is not defined',
  });
};
