const catchAsync = require('../../../../utils/catchAsync');
const customerService = require('../services/customer.service');
const customerRepository = require('../repositories/customer.repository');

exports.getMe = catchAsync(async (req, res) => {
  res.status(200).json({ status: 'success', data: { customer: req.customer } });
});

exports.updateMe = catchAsync(async (req, res) => {
  const customer = await customerService.updateMe(req.customer, req.body);
  res.status(200).json({ status: 'success', data: { customer } });
});

exports.getMyOrders = catchAsync(async (req, res) => {
  const orders = await customerRepository.getCustomerOrders(req.customer._id);
  res.status(200).json({
    status: 'success',
    results: orders.length,
    data: { orders },
  });
});

exports.claimGift = catchAsync(async (req, res) => {
  await customerService.claimGift(req.customer, req.body.giftId);
  res.status(200).json({ status: 'success', message: 'Gift claimed!' });
});
