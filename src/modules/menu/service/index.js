/**
 * @file src/modules/menu/service/index.js
 * @description Barrel export for all menu services
 */

const CategoryService = require('./Category.service');
const MenuItemService = require('./MenuItem.service');
const MenuGroupService = require('./MenuGroup.service');
const ComboService = require('./Combo.service');
// Note: MenuManagementService is at module root, not in service folder
const MenuManagementService = require('../menu-management.service');

module.exports = {
  CategoryService,
  MenuItemService,
  MenuGroupService,
  ComboService,
  MenuManagementService
};
