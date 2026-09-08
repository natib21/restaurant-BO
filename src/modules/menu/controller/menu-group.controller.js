const catchAsync = require('../../../../utils/catchAsync');
const { MenuService } = require('../service/MenuService'); // Legacy service for some methods
const MenuGroupService = require('../service/MenuGroup.service'); // New structured service
const { sendResponse } = require('../../../../utils/sendResponse');
const { getMerchantId } = require('../../../common/utils/tenant-scope');

exports.createMenuGroup = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const userId = req.user._id;
  
  const menuGroup = await MenuGroupService.create(req.body, merchantId, userId);

  sendResponse(res, 201, 'menuGroup', menuGroup);
});

exports.getAllMenuGroups = catchAsync(async (req, res) => {
  const menuGroups = await MenuGroupService.getAll(req);

  sendResponse(res, 200, 'menuGroups', menuGroups, { results: menuGroups.length });
});

exports.getAllMenuGroupsLight = catchAsync(async (req, res) => {
  // Use legacy service for light version (can be refactored later)
  const lightGroups = await MenuService.getAllMenuGroupsLight(req);

  sendResponse(res, 200, 'menuGroups', lightGroups, { results: lightGroups.length });
});

exports.getMenuGroup = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  
  const menuGroup = await MenuGroupService.getById(req.params.id, merchantId);

  sendResponse(res, 200, 'menuGroup', menuGroup);
});

exports.updateMenuGroup = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const userId = req.user._id;
  
  const menuGroup = await MenuGroupService.update(req.params.id, req.body, merchantId, userId);

  sendResponse(res, 200, 'menuGroup', menuGroup);
});

exports.deleteMenuGroup = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const userId = req.user._id;
  
  await MenuGroupService.softDelete(req.params.id, merchantId, userId);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.addItemToGroup = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { menuItemId, ...itemConfig } = req.body;
  
  const updated = await MenuGroupService.addItem(req.params.id, merchantId, menuItemId, itemConfig);

  sendResponse(res, 200, 'menuGroup', updated);
});

exports.removeItemFromGroup = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { menuItemId } = req.body;
  
  const updated = await MenuGroupService.removeItem(req.params.id, merchantId, menuItemId);

  sendResponse(res, 200, 'menuGroup', updated);
});

exports.reorderItems = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { itemsOrder } = req.body;
  
  const menuGroup = await MenuGroupService.reorderItems(req.params.id, merchantId, itemsOrder);

  sendResponse(res, 200, 'menuGroup', menuGroup);
});
