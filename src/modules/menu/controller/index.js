/**
 * @file src/modules/menu/controller/index.js
 * @description Barrel export for all menu controllers
 */

const CategoryController = require('./Category.controller');
const MenuItemController = require('./menu.controller');
const MenuGroupController = require('./menu-group.controller');
const ComboController = require('./combo.controller');
const BranchMenuGroupController = require('./branch-menu-group.controller');

module.exports = {
  CategoryController,
  MenuItemController,
  MenuGroupController,
  ComboController,
  BranchMenuGroupController
};
