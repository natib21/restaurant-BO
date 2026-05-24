const catchAsync = require('../../../../utils/catchAsync');
const { MenuService } = require('../service/MenuService');

exports.createBranchMenuGroup = catchAsync(async (req, res) => {
  const menuGroup = await MenuService.createBranchMenuGroup(req);

  res.status(201).json({
    status: 'success',
    data: { menuGroup },
  });
});

exports.getAllBranchMenuGroups = catchAsync(async (req, res) => {
  const groups = await MenuService.getAllBranchMenuGroups(req);

  res.status(200).json({
    status: 'success',
    results: groups.length,
    data: { menuGroups: groups },
  });
});

exports.getBranchMenuGroup = catchAsync(async (req, res) => {
  const group = await MenuService.getBranchMenuGroup(req);

  res.status(200).json({
    status: 'success',
    data: { menuGroup: group },
  });
});

exports.updateBranchMenuGroup = catchAsync(async (req, res) => {
  const group = await MenuService.updateBranchMenuGroup(req);

  res.status(200).json({
    status: 'success',
    data: { menuGroup: group },
  });
});

exports.deleteBranchMenuGroup = catchAsync(async (req, res) => {
  await MenuService.deleteBranchMenuGroup(req);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.addItemToGroup = catchAsync(async (req, res) => {
  const group = await MenuService.addItemToBranchMenuGroup(req);

  res.status(200).json({
    status: 'success',
    data: { menuGroup: group },
  });
});

exports.removeItemFromGroup = catchAsync(async (req, res) => {
  const group = await MenuService.removeItemFromBranchMenuGroup(req);

  res.status(200).json({
    status: 'success',
    data: { menuGroup: group },
  });
});

exports.reorderBranchMenuGroupItems = catchAsync(async (req, res) => {
  const group = await MenuService.reorderBranchMenuGroupItems(req);

  res.status(200).json({
    status: 'success',
    data: { menuGroup: group },
  });
});
