const mongoose = require('mongoose');
const Menu = require('../../../../models/menuModel');
const MenuGroup = require('../../../../models/menuGroupModel');
const Recipe = require('../../../../models/Recipe');
const { createIssue, capIssues } = require('../integrity-report');
const { INTEGRITY_SAMPLE_LIMIT } = require('../integrity.constants');

function merchantFilter(merchantId) {
  return merchantId ? { merchant: new mongoose.Types.ObjectId(merchantId) } : {};
}

async function auditMenus({ merchantId } = {}) {
  const issues = [];
  const base = merchantFilter(merchantId);

  const availableMenus = await Menu.find({ ...base, available: true })
    .select('_id name available inStock merchant')
    .limit(INTEGRITY_SAMPLE_LIMIT)
    .lean();

  const menuIds = availableMenus.map(m => m._id);
  const recipes = await Recipe.find({
    ...base,
    menuItem: { $in: menuIds },
    isActive: true,
  })
    .select('menuItem')
    .lean();

  const menusWithRecipe = new Set(recipes.map(r => r.menuItem.toString()));

  for (const menu of availableMenus) {
    if (!menusWithRecipe.has(menu._id.toString())) {
      issues.push(
        createIssue({
          module: 'menu',
          type: 'missing',
          severity: 'critical',
          entityId: menu._id,
          message: `Available menu item "${menu.name}" has no active inventory recipe`,
          suggestion: 'Create Recipe for menu item or set available:false until recipe exists.',
          production_best_practice:
            'Validate recipe existence in menu publish workflow; cache published menu per branch in Redis.',
        })
      );
    }

    if (menu.available && menu.inStock === false) {
      issues.push(
        createIssue({
          module: 'menu',
          type: 'invalid_state',
          severity: 'warning',
          entityId: menu._id,
          message: `Menu item "${menu.name}" is available but marked out of stock (inStock:false)`,
          suggestion: 'Align available and inStock flags or enforce single availability field.',
          production_best_practice:
            'Denormalize availability from inventory in batch job; expose single orderable flag to clients.',
        })
      );
    }
  }

  const groups = await MenuGroup.find(base)
    .select('_id name merchant items')
    .limit(INTEGRITY_SAMPLE_LIMIT)
    .lean();

  const allMenuIds = new Set(
    (await Menu.find(base).select('_id').lean()).map(m => m._id.toString())
  );

  for (const group of groups) {
    for (const item of group.items || []) {
      const menuRef = item.menu?.toString();
      if (!menuRef || !allMenuIds.has(menuRef)) {
        issues.push(
          createIssue({
            module: 'menu',
            type: 'orphan_reference',
            severity: 'critical',
            entityId: group._id,
            message: `MenuGroup "${group.name}" references missing menu item ${menuRef}`,
            suggestion: 'Remove stale item from group or restore menu document.',
            production_best_practice:
              'Use menu publish snapshots so groups reference immutable published item IDs only.',
          })
        );
      }
      if (item.overridePrice != null && item.overridePrice < 0) {
        issues.push(
          createIssue({
            module: 'menu',
            type: 'invalid_state',
            severity: 'critical',
            entityId: group._id,
            message: `MenuGroup "${group.name}" has negative overridePrice for menu ${menuRef}`,
            suggestion: 'Fix pricing override in menu group configuration.',
            production_best_practice:
              'Validate pricing in admin UI and server-side DTO validation (Zod) before save.',
          })
        );
      }
    }
  }

  return capIssues(issues);
}

module.exports = { auditMenus };
