const catchAsync = require('../../../../utils/catchAsync');
const customerAuthService = require('../services/customer-auth.service');

exports.loginOrCreate = catchAsync(async (req, res, next) => {
  const merchantId = req.merchant?._id || req.merchantId;
  const branchId = req.branch?._id || req.branchId;
  const tableId = req.table?._id || req.tableId;
  const sessionToken = req.headers['x-session-token'] || req.body.sessionToken;

  const result = await customerAuthService.loginOrCreate(
    merchantId,
    branchId,
    tableId,
    sessionToken,
    req.body
  );

  res.status(result.isNew ? 201 : 200).json({
    status: 'success',
    message: result.message,
    existing: !result.isNew,
    seated: result.seated,
    data: { customer: result.customer },
  });
});
