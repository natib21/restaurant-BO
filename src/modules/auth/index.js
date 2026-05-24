const authController = require('./auth.controller');
const authValidation = require('./auth.validation');
const { protect, restrictTo } = require('../../common/guards/auth.guard');

module.exports = {
  ...authController,
  protect,
  restrictTo,
  ...authValidation,
};
