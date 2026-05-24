const catchAsync = require('../../../../utils/catchAsync');
const { getMerchantId } = require('../../../common/utils/tenant-scope');
const { BranchService } = require('../service/BranchService');

exports.createBranch = catchAsync(async (req, res) => {
  const branch = await BranchService.createBranch(req);
  res.status(201).json({ status: 'success', data: { branch } });
});

exports.getAllBranches = catchAsync(async (req, res) => {
  const branches = await BranchService.getAllBranches(req);
  res.status(200).json({
    status: 'success',
    results: branches.length,
    data: { branches },
  });
});

exports.getBranch = catchAsync(async (req, res) => {
  const branch = await BranchService.getBranch(req.params.id);
  res.status(200).json({ status: 'success', data: { branch } });
});

exports.updateBranch = catchAsync(async (req, res) => {
  const branch = await BranchService.updateBranch(req);
  res.status(200).json({ status: 'success', data: { branch } });
});

exports.deleteBranch = catchAsync(async (req, res) => {
  await BranchService.deleteBranch(req);
  res.status(204).json({ status: 'success', data: null });
});

exports.regenerateQRCodes = catchAsync(async (req, res) => {
  const { qrVersion } = await BranchService.regenerateBranchQrCodes(req);
  res.status(200).json({
    status: 'success',
    message: 'All QR codes invalidated. New ones generated.',
    data: { qrVersion },
  });
});

exports.getNearbyBranches = catchAsync(async (req, res) => {
  const branches = await BranchService.getNearbyBranches(req);
  res.status(200).json({
    status: 'success',
    results: branches.length,
    data: { branches },
  });
});

exports.inviteBranchManager = catchAsync(async (req, res) => {
  const result = await BranchService.inviteBranchManager(req);
  res.status(201).json({ status: 'success', message: result.message });
});

exports.suspendBranch = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const branch = await BranchService.suspendBranch(merchantId, req.params.id);
  res.status(200).json({ status: 'success', data: { branch } });
});

exports.activateBranch = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const branch = await BranchService.activateBranch(merchantId, req.params.id);
  res.status(200).json({ status: 'success', data: { branch } });
});

exports.setFeatures = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const branch = await BranchService.setFeatureFlags(
    merchantId,
    req.params.id,
    req.body.features || {}
  );
  res.status(200).json({
    status: 'success',
    data: { branch, features: BranchService.getFeatureFlags(branch) },
  });
});

exports.assignMenuGroup = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const result = await BranchService.assignMenuGroupToBranch(
    merchantId,
    req.body.menuGroupId,
    req.params.id
  );
  res.status(200).json({ status: 'success', data: result });
});

exports.listStaff = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const staff = await BranchService.listStaffForBranch(merchantId, req.params.id);
  res.status(200).json({ status: 'success', results: staff.length, data: { staff } });
});
