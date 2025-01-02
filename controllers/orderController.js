const catchAsync = require('../utils/catchAsync');
const ApiFeatures = require('../utils/apiFeatures');
const Order = require('../models/orderModel');
const { getIo } = require('../socket');

exports.getAllOrder = catchAsync(async (req, res) => {
  const features = new ApiFeatures(Order.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const allOrders = await features.query;

  res.status(200).json({
    status: 'success',
    result: allOrders.length,
    order: allOrders,
  });
});
exports.createNewOrder = catchAsync(async (req, res, next) => {
  const newOrder = await Order.create(req.body);
  const io = getIo();
  io.emit('new-order', newOrder);
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
exports.updateOrder = async (req, res, next) => {
  const updatedOrder = await Order.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });

  // Emit the updated order event
  io.emit('update-order', updatedOrder);

  res.status(200).json({
    status: 'success',
    data: {
      order: updatedOrder,
    },
  });
};
exports.deleteOrder = (req, res) => {
  res.status(500).json({
    status: 'Error',
    message: 'This route is not defined',
  });
};

exports.acceptOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    order.status = 'Accepted';
    await order.save();

    // Emit the order acceptance event
    io.emit('accept-order', order._id);

    res.status(200).json({
      status: 'success',
      data: {
        order,
      },
    });
  } catch (err) {
    next(err);
  }
};
