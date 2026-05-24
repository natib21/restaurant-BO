const catchAsync = require('../../../../utils/catchAsync');
const { MenuService } = require('../service/MenuService');

exports.createMenuGroup = catchAsync(async (req, res) => {
  const menuGroup = await MenuService.createMenuGroup(req);

  res.status(201).json({
    status: 'success',
    data: { menuGroup },
  });
});

exports.getAllMenuGroups = catchAsync(async (req, res) => {
  const menuGroups = await MenuService.getAllMenuGroups(req);

  res.status(200).json({
    status: 'success',
    results: menuGroups.length,
    data: { menuGroups },
  });
});

exports.getAllMenuGroupsLight = catchAsync(async (req, res) => {
  const lightGroups = await MenuService.getAllMenuGroupsLight(req);

  res.status(200).json({
    status: 'success',
    results: lightGroups.length,
    data: { menuGroups: lightGroups },
  });
});

exports.getMenuGroup = catchAsync(async (req, res) => {
  const menuGroupWithImages = await MenuService.getMenuGroup(req);

  res.status(200).json({
    status: 'success',
    data: { menuGroup: menuGroupWithImages },
  });
});

exports.updateMenuGroup = catchAsync(async (req, res) => {
  const menuGroup = await MenuService.updateMenuGroup(req);

  res.status(200).json({
    status: 'success',
    data: { menuGroup },
  });
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

  res.status(200).json({
    status: 'success',
    data: { menuGroup: updated },
  });
});

exports.removeItemFromGroup = catchAsync(async (req, res) => {
  const updated = await MenuService.removeItemFromMenuGroup(req);

  res.status(200).json({
    status: 'success',
    data: { menuGroup: updated },
  });
});

exports.reorderItems = catchAsync(async (req, res) => {
  const menuGroup = await MenuService.reorderMenuGroupItems(req);

  res.status(200).json({
    status: 'success',
    data: { menuGroup },
  });
});
