const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');
const customerService = require('../services/customer.service');
const customerRepository = require('../repositories/customer.repository');
const { getMerchantId } = require('../../../../src/common/utils/tenant-scope');

exports.getCustomer = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  if (!merchantId) return next(new AppError('Merchant context is required', 403));

  const data = await customerService.getCustomerStats(req.params.id, merchantId);

  res.status(200).json({
    status: 'success',
    data: { customer: data.customer, stats: data.stats },
  });
});

exports.getAllCustomers = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  if (!merchantId) return next(new AppError('Merchant context is required', 403));

  const customers = await customerRepository.findAllByMerchant(merchantId);

  res.status(200)
  .json({
     status: 'success', 
     results: customers.length,
      data: { customers }
     });
});

exports.updateCustomer = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  if (!merchantId) return next(new AppError('Merchant context is required', 403));

  const customer = await customerService.updateCustomerByStaff(
    merchantId,
    req.params.id,
    req.body,
    req.user._id
  );

  res.status(200).json({ status: 'success', data: { customer } });
});

exports.deleteCustomer = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  if (!merchantId) return next(new AppError('Merchant context is required', 403));

  await customerService.deleteCustomer(merchantId, req.params.id);

  res.status(204).json({ status: 'success', data: null });
});

exports.giveGift = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  if (!merchantId) return next(new AppError('Merchant context is required', 403));

  await customerService.giveGift(merchantId, req.params.id, req.body, req.user._id);

  res.status(200).json({ status: 'success', message: 'Gift sent!' });
});

exports.addTagOrNote = catchAsync(async (req, res, next) => {
  const merchantId = getMerchantId(req);
  if (!merchantId) return next(new AppError('Merchant context is required', 403));

  const customer = await customerService.addTagOrNote(
    merchantId,
    req.params.id,
    req.body,
    req.user._id
  );

  res.status(200).json({ status: 'success', data: { customer } });
});
