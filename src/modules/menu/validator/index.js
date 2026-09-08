/**
 * @file src/modules/menu/validator/index.js
 * @description Barrel export for all menu validators
 */

const CategoryValidator = require('./Category.validator');
const MenuItemValidator = require('./MenuItem.validator');
const MenuGroupValidator = require('./MenuGroup.validator');
const ComboValidator = require('./Combo.validator');
const CommonValidator = require('./common.validator');

module.exports = {
  CategoryValidator,
  MenuItemValidator,
  MenuGroupValidator,
  ComboValidator,
  CommonValidator
};
