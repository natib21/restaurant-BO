const catchAsync = require('../../../../utils/catchAsync');
const { MenuService } = require('../service/MenuService');
const { sendResponse } = require('../../../../utils/sendResponse');

exports.createBranchMenuGroup = catchAsync(async (req, res) => {
  const menuGroup = await MenuService.createBranchMenuGroup(req);

  sendResponse(res, 201, 'menuGroup', menuGroup);
});

exports.getAllBranchMenuGroups = catchAsync(async (req, res) => {
  const groups = await MenuService.getAllBranchMenuGroups(req);

  sendResponse(res, 200, 'menuGroups', groups, { results: groups.length });
});

exports.getBranchMenuGroup = catchAsync(async (req, res) => {
  const group = await MenuService.getBranchMenuGroup(req);

  sendResponse(res, 200, 'menuGroup', group);
});

exports.updateBranchMenuGroup = catchAsync(async (req, res) => {
  const group = await MenuService.updateBranchMenuGroup(req);

  sendResponse(res, 200, 'menuGroup', group);
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

  sendResponse(res, 200, 'menuGroup', group);
});

exports.removeItemFromGroup = catchAsync(async (req, res) => {
  const group = await MenuService.removeItemFromBranchMenuGroup(req);

  sendResponse(res, 200, 'menuGroup', group);
});

exports.reorderBranchMenuGroupItems = catchAsync(async (req, res) => {
  const group = await MenuService.reorderBranchMenuGroupItems(req);

  sendResponse(res, 200, 'menuGroup', group);
});
