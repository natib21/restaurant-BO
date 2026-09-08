const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');
const Customer = require('../../../../models/customerModule');
const {
  getMerchantId,
  getBranchId,
  getCustomerId,
} = require('../../../../src/common/utils/tenant-scope');

exports.protectCustomer = catchAsync(async (req, res, next) => {
  const customerId = getCustomerId(req);
  if (!customerId) {
    return next(new AppError('Customer login is required for this action', 401));
  }

  const merchantId = getMerchantId(req);
  if (!merchantId) {
    return next(new AppError('Merchant context is required', 401));
  }

  const customer = await Customer.findOne({ _id: customerId, merchant: merchantId });
  if (!customer) {
    return next(new AppError('Customer not found', 404));
  }

  if (req.tableSession) {
    if (req.tableSession.merchant.toString() !== merchantId.toString()) {
      return next(new AppError('Session is not valid for this merchant', 403));
    }
    if (!req.tableSession.customer) {
      return next(new AppError('Please log in at your table before continuing', 401));
    }
    if (req.tableSession.customer.toString() !== customerId.toString()) {
      return next(new AppError('Session does not match customer', 403));
    }
    if (
      req.tableSession.branch &&
      customer.currentBranch &&
      req.tableSession.branch.toString() !== customer.currentBranch.toString()
    ) {
      return next(new AppError('Customer is not registered for this branch session', 403));
    }
  }

  const branchId = getBranchId(req);
  if (branchId && customer.currentBranch) {
    const resolved = Array.isArray(branchId) ? branchId[0] : branchId;
    const branchStr = (resolved?._id ?? resolved)?.toString();
    if (customer.currentBranch.toString() !== branchStr && req.tableSession?.branch) {
      if (req.tableSession.branch.toString() !== customer.currentBranch.toString()) {
        return next(new AppError('Branch context mismatch', 403));
      }
    }
  }

  req.customer = customer;
  if (req.ctx) {
    req.ctx.customerId = customer._id;
    req.ctx.actorType = 'customer';
    req.ctx.actorId = customer._id;
  }

  next();
});
