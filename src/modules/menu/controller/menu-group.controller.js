const catchAsync = require('../../../../utils/catchAsync');
const { MenuService } = require('../service/MenuService');
const { sendResponse } = require('../../../../utils/sendResponse');

exports.createMenuGroup = catchAsync(async (req, res) => {
  const menuGroup = await MenuService.createMenuGroup(req);

  sendResponse(res, 201, 'menuGroup', menuGroup);
});

exports.getAllMenuGroups = catchAsync(async (req, res) => {
  const menuGroups = await MenuService.getAllMenuGroups(req);

  sendResponse(res, 200, 'menuGroups', menuGroups, { results: menuGroups.length });
});

exports.getAllMenuGroupsLight = catchAsync(async (req, res) => {
  const lightGroups = await MenuService.getAllMenuGroupsLight(req);

  sendResponse(res, 200, 'menuGroups', lightGroups, { results: lightGroups.length });
});

exports.getMenuGroup = catchAsync(async (req, res) => {
  const menuGroupWithImages = await MenuService.getMenuGroup(req);

  sendResponse(res, 200, 'menuGroup', menuGroupWithImages);
});

exports.updateMenuGroup = catchAsync(async (req, res) => {
  const menuGroup = await MenuService.updateMenuGroup(req);

  sendResponse(res, 200, 'menuGroup', menuGroup);
});

exports.deleteMenuGroup = catchAsync(async (req, res) => {
  await MenuService.deleteMenuGroup(req);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.addItemToGroup = catchAsync(async (req, res) => {
  const updated = await MenuService.addItemToMenuGroup(req);

  sendResponse(res, 200, 'menuGroup', updated);
});

exports.removeItemFromGroup = catchAsync(async (req, res) => {
  const updated = await MenuService.removeItemFromMenuGroup(req);

  sendResponse(res, 200, 'menuGroup', updated);
});

exports.reorderItems = catchAsync(async (req, res) => {
  const menuGroup = await MenuService.reorderMenuGroupItems(req);

  sendResponse(res, 200, 'menuGroup', menuGroup);
});
