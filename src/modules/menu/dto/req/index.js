/**
 * @file src/modules/menu/dto/req/index.js
 * @description Barrel export for request DTOs
 */

const CreateCategoryReqDto = require('./CreateCategoryReq.dto');
const UpdateCategoryReqDto = require('./UpdateCategoryReq.dto');
const CreateMenuItemReqDto = require('./CreateMenuItemReq.dto');
const UpdateMenuItemReqDto = require('./UpdateMenuItemReq.dto');
const CreateMenuGroupReqDto = require('./CreateMenuGroupReq.dto');
const UpdateMenuGroupReqDto = require('./UpdateMenuGroupReq.dto');
const CreateComboReqDto = require('./CreateComboReq.dto');
const UpdateComboReqDto = require('./UpdateComboReq.dto');

module.exports = {
  CreateCategoryReqDto,
  UpdateCategoryReqDto,
  CreateMenuItemReqDto,
  UpdateMenuItemReqDto,
  CreateMenuGroupReqDto,
  UpdateMenuGroupReqDto,
  CreateComboReqDto,
  UpdateComboReqDto
};
