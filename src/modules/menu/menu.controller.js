const catchAsync = require('../../../utils/catchAsync');
const { MenuManagementService } = require('./menu-management.service');
const { getMerchantId } = require('../../common/utils/tenant-scope');

exports.publishMenuGroup = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { menuGroupId, branchId } = req.body;

  const publication = await MenuManagementService.publishMenuGroup({
    menuGroupId,
    merchantId,
    branchId,
    publishedBy: req.user._id,
  });

  res.status(201).json({
    status: 'success',
    data: { publication },
  });
});

exports.archiveMenuItem = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const menu = await MenuManagementService.archiveMenuItem(req.params.id, merchantId);
  res.status(200).json({ status: 'success', data: { menu } });
});

exports.getBranchPublications = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const publications = await MenuManagementService.getLatestPublicationForBranch(
    merchantId,
    req.params.branchId
  );
  res.status(200).json({ status: 'success', results: publications.length, data: { publications } });
});
