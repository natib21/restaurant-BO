/**
 * @file src/modules/menu/repository/index.js
 * @description Barrel export for all menu repositories
 */

const CategoryRepository = require('./Category.repository');
const MenuItemRepository = require('./MenuItem.repository');
const MenuGroupRepository = require('./MenuGroup.repository');
const ComboRepository = require('./Combo.repository');

module.exports = {
  CategoryRepository,
  MenuItemRepository,
  MenuGroupRepository,
  ComboRepository
};
