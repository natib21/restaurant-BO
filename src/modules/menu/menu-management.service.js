const mongoose = require('mongoose');
const Menu = require('./model/MenuItem.model');
const MenuGroup = require('./model/MenuGroup.model');
const MenuPublication = require('../../../models/MenuPublication');
const Recipe = require('../../../models/Recipe');
const AppError = require('../../../utils/appError');
const logger = require('../../../utils/logger');
const {
  getMenuName,
  getMenuGroupName,
} = require('../../../utils/localization-helper');

function isOrderablePublishStatus(status) {
  if (!status || status === 'published') return true;
  return false;
}

class MenuManagementService {
  /**
   * Validate all visible items in a menu group have active recipes before publish.
   */
  static async validateRecipesForGroup(menuGroupId, merchantId) {
    const group = await MenuGroup.findOne({ _id: menuGroupId, merchant: merchantId });
    if (!group) throw new AppError('Menu group not found', 404);

    const menuIds = (group.items || []).filter(item => !item.isHidden).map(item => item.menu);

    const menus = await Menu.find({
      _id: { $in: menuIds },
      merchant: merchantId,
      available: true,
    }).select('_id name publishStatus');

    const missing = [];
    for (const menu of menus) {
      const recipe = await Recipe.findOne({
        menuItem: menu._id,
        merchant: merchantId,
        isActive: true,
      }).select('_id');
      if (!recipe) {
        missing.push({ menuItemId: menu._id, name: menu.name });
      }
    }

    return { group, menus, missing };
  }

  /**
   * Publish menu group for a branch — creates versioned snapshot.
   * DEPRECATED: Use MenuGroupService.publishMenuGroup() instead.
   * This method now delegates to MenuGroupService.
   * 
   * @deprecated Use MenuGroupService.publishMenuGroup() directly
   */
  static async publishMenuGroup({ menuGroupId, merchantId, branchId, publishedBy }) {
    const MenuGroupService = require('./service/MenuGroup.service');
    return MenuGroupService.publishMenuGroup({ menuGroupId, merchantId, branchId, publishedBy });
  }

  static async archiveMenuItem(menuItemId, merchantId) {
    const menu = await Menu.findOneAndUpdate(
      { _id: menuItemId, merchant: merchantId },
      { publishStatus: 'archived', available: false },
      { new: true }
    );
    if (!menu) throw new AppError('Menu item not found', 404);
    return menu;
  }

  static async getLatestPublicationForBranch(merchantId, branchId) {
    return MenuPublication.find({
      merchant: merchantId,
      branch: branchId,
      status: 'published',
    })
      .sort('-version')
      .lean();
  }

  /**
   * Used by OrderService — only published (or legacy) items are orderable.
   */
  static buildOrderableMenuFilter(merchantId) {
    return {
      merchant: merchantId,
      available: true,
      $or: [{ publishStatus: 'published' }, { publishStatus: { $exists: false } }],
    };
  }

  static assertMenuItemOrderable(menuItem) {
    if (!menuItem) throw new AppError('Menu item not found or unavailable', 400);
    if (!isOrderablePublishStatus(menuItem.publishStatus)) {
      throw new AppError('Menu item is not published for ordering', 400);
    }
  }
}

module.exports = { MenuManagementService, isOrderablePublishStatus };
