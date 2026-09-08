/**
 * @file src/modules/menu/dto/res/index.js
 * @description Barrel export for response DTOs
 */

const CategoryResDto = require('./CategoryRes.dto');
const MenuItemResDto = require('./MenuItemRes.dto');
const MenuGroupResDto = require('./MenuGroupRes.dto');
const ComboResDto = require('./ComboRes.dto');
const PublicMenuResDto = require('./PublicMenuRes.dto');

module.exports = {
  CategoryResDto,
  MenuItemResDto,
  MenuGroupResDto,
  ComboResDto,
  PublicMenuResDto
};
