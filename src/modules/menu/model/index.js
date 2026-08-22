/**
 * @file src/modules/menu/model/index.js
 * @description Barrel export for all menu models
 */

const Category = require('./Category.model');
const MenuItem = require('./MenuItem.model');
const MenuGroup = require('./MenuGroup.model');
const Combo = require('./Combo.model');

module.exports = {
  Category,
  MenuItem,
  MenuGroup,
  Combo
};
