const catchAsync = require('../../../utils/catchAsync');
const { BranchControlService } = require('./branch-control.service');
const { getMerchantId } = require('../../common/utils/tenant-scope');

exports.suspendBranch = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const branch = await BranchControlService.suspendBranch(merchantId, req.params.id);
  res.status(200).json({ status: 'success', data: { branch } });
});

exports.activateBranch = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const branch = await BranchControlService.activateBranch(merchantId, req.params.id);
  res.status(200).json({ status: 'success', data: { branch } });
});

exports.setFeatures = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const branch = await BranchControlService.setFeatureFlags(
    merchantId,
    req.params.id,
    req.body.features || {}
  );
  res.status(200).json({
    status: 'success',
    data: { branch, features: BranchControlService.getFeatureFlags(branch) },
  });
});

exports.assignMenuGroup = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const result = await BranchControlService.assignMenuGroupToBranch(
    merchantId,
    req.body.menuGroupId,
    req.params.id
  );
  res.status(200).json({ status: 'success', data: result });
});

exports.listStaff = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const staff = await BranchControlService.listStaffForBranch(merchantId, req.params.id);
  res.status(200).json({ status: 'success', results: staff.length, data: { staff } });
});
