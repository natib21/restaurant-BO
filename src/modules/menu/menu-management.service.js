const mongoose = require('mongoose');
const Menu = require('../../../models/menuModel');
const MenuGroup = require('../../../models/menuGroupModel');
const MenuPublication = require('../../../models/MenuPublication');
const Recipe = require('../../../models/Recipe');
const AppError = require('../../../utils/appError');
const logger = require('../../../utils/logger');

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

    const menuIds = (group.items || [])
      .filter(item => !item.isHidden)
      .map(item => item.menu);

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
   */
  static async publishMenuGroup({ menuGroupId, merchantId, branchId, publishedBy }) {
    const { group, menus, missing } = await MenuManagementService.validateRecipesForGroup(
      menuGroupId,
      merchantId
    );

    if (missing.length > 0) {
      throw new AppError(
        `Cannot publish: ${missing.length} item(s) missing active recipes`,
        400
      );
    }

    if (!group.branches.map(b => b.toString()).includes(String(branchId))) {
      throw new AppError('Menu group is not assigned to this branch', 400);
    }

    const last = await MenuPublication.findOne({
      merchant: merchantId,
      branch: branchId,
      menuGroup: menuGroupId,
    })
      .sort('-version')
      .select('version')
      .lean();

    const version = (last?.version || 0) + 1;

    await Menu.updateMany(
      { _id: { $in: menus.map(m => m._id) }, merchant: merchantId },
      { $set: { publishStatus: 'published' } }
    );

    const snapshot = {
      menuGroup: {
        _id: group._id,
        name: group.name,
        visibility: group.visibility,
        priority: group.priority,
      },
      items: group.items.map(item => ({
        menu: item.menu,
        sortOrder: item.sortOrder,
        overridePrice: item.overridePrice,
        isHidden: item.isHidden,
      })),
      menus: menus.map(m => ({
        _id: m._id,
        name: m.name,
        publishStatus: 'published',
      })),
    };

    const publication = await MenuPublication.create({
      merchant: merchantId,
      branch: branchId,
      menuGroup: menuGroupId,
      version,
      publishedBy,
      snapshot,
      recipeValidation: { passed: true, missingRecipes: [] },
    });

    logger.info('menu.published', {
      menuGroupId: String(menuGroupId),
      branchId: String(branchId),
      version,
      merchantId: String(merchantId),
    });

    return publication;
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
