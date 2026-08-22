/**
 * @file src/modules/menu/service/MenuGroup.service.js
 * @description Business logic for menu group management
 */

const MenuGroupRepository = require('../repository/MenuGroup.repository');
const MenuItemRepository = require('../repository/MenuItem.repository');
const AppError = require('../../../../utils/appError');
const ApiFeatures = require('../../../../utils/apiFeatures');
const { normalizeName, normalizeDescription, getMenuName, getMenuDescription, getMenuGroupName } = require('../../../../utils/localization-helper');
const { resolveSingleImageData } = require('../utils/image-response');
const Merchant = require('../../../../models/merchantModel');
const Table = require('../../../../models/tabelModel');

class MenuGroupService {
  /**
   * Get public menu for customers
   * Handles scheduling, time slots, special dates, and filtering
   * 
   * @param {Object} req - Express request object with merchantId, tableId, query params
   * @returns {Object} Public menu with filtered items
   */
  static async getPublicMenu(req) {
    const merchantId = req.merchantId;
    const tableId = req.tableId;
    
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    let tableNumber = null;

    // Validate table if provided
    if (tableId) {
      const table = await Table.findOne({
        _id: tableId,
        merchant: merchantId,
        isActive: true,
      }).select('tableNumber');

      if (!table) {
        throw new AppError('Invalid or inactive table', 400);
      }
      tableNumber = table.tableNumber;
    }

    const requestedType = req.query.type?.toLowerCase();

    // Verify merchant is active
    const merchant = await Merchant.findById(merchantId).select('businessName isActive');
    if (!merchant || !merchant.isActive) {
      throw new AppError('Restaurant not found or closed.', 404);
    }

    // Calculate current time/date for scheduling
    const now = new Date();
    const dayName = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
    const currentTimeStr = now.toTimeString().slice(0, 5);
    const today = now.toISOString().split('T')[0];

    const timeToMinutes = time => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };
    const currentMinutes = timeToMinutes(currentTimeStr);

    // Get all menu groups for merchant
    const allGroups = await MenuGroupRepository.findAll(merchantId, {}, false)
      .select('priority visibility activeDays blockedDays timeSlots specialDates isAlcoholMenu items name description')
      .lean();

    const activeGroupIds = new Set();

    // Filter groups by scheduling rules
    for (const group of allGroups) {
      if (group.visibility === 'hidden') continue;

      let isActive = group.visibility === 'always';

      if (!isActive && group.visibility === 'scheduled') {
        // Check if today is an active day (empty = all days)
        const onActiveDay =
          !group.activeDays?.length || 
          group.activeDays.map(d => d.toLowerCase()).includes(dayName);

        // Check if today is NOT blocked
        const notBlocked =
          !group.blockedDays?.length ||
          !group.blockedDays.map(d => d.toLowerCase()).includes(dayName);

        // Check if current time is in an active time slot (empty = all times)
        const inTimeSlot =
          !group.timeSlots?.length ||
          group.timeSlots.some(slot => {
            const startMin = timeToMinutes(slot.start);
            const endMin = timeToMinutes(slot.end);
            
            // Handle overnight slots (e.g., 22:00-02:00)
            if (endMin < startMin) {
              return currentMinutes >= startMin || currentMinutes <= endMin;
            }
            return currentMinutes >= startMin && currentMinutes <= endMin;
          });

        // Check for special dates (exact or recurring yearly)
        const isSpecialDate = group.specialDates?.some(d => {
          const dateStr = d.date.toISOString().split('T')[0];
          
          if (d.recurringYearly) {
            const monthDay = `${d.date.getMonth() + 1}-${d.date.getDate()}`;
            const todayMD = `${now.getMonth() + 1}-${now.getDate()}`;
            return monthDay === todayMD;
          }
          return dateStr === today;
        });

        isActive = (onActiveDay || isSpecialDate) && notBlocked && inTimeSlot;
      }

      if (isActive) {
        activeGroupIds.add(group._id.toString());
      }
    }

    // Get active groups with populated menu items
    const MenuGroup = require('../model/MenuGroup.model');
    const activeGroups = await MenuGroup.find({
      _id: { $in: Array.from(activeGroupIds) },
      merchant: merchantId,
    })
      .sort({ priority: -1, _id: 1 }) // Sort by priority DESC, then _id ASC for deterministic tie-breaking
      .populate({
        path: 'items.menu',
        match: { 
          available: true, 
          inStock: true, 
          publishStatus: 'published',
          deletedAt: null // Exclude soft-deleted items
        },
        select: 'name description image variants price type isVeg isSpicy isAlcoholic prepTime tags recipe allergens ratingAverage',
      });

    const origin = `${req.protocol}://${req.get('host')}`;
    const seenItemIds = new Set();
    const finalItems = [];

    // Flatten menu items from all active groups
    for (const group of activeGroups) {
      for (const item of group.items) {
        if (!item.menu || item.isHidden) continue;
        if (seenItemIds.has(item.menu._id.toString())) continue;

        seenItemIds.add(item.menu._id.toString());

        const menu = item.menu;
        const defaultPrice = item.overridePrice || menu.variants?.[0]?.price || menu.price || 0;

        const imageData = resolveSingleImageData({
          image: menu.image,
          origin,
        });

        finalItems.push({
          _id: menu._id,
          name: item.customName || getMenuName(menu),
          description: item.customDescription || getMenuDescription(menu) || '',
          image: imageData?.url || null,
          price: defaultPrice,
          variants: menu.variants || [],
          type: menu.type,
          isVeg: menu.isVeg,
          isSpicy: menu.isSpicy,
          isAlcoholic: !!menu.isAlcoholic || group.isAlcoholMenu,
          prepTime: menu.prepTime || '15-25 min',
          tags: menu.tags || [],
          ingredients: menu.recipe?.ingredients || [],
          allergens: menu.allergens || [],
          rating: menu.ratingAverage || 4.5,
          displayedIn: getMenuGroupName(group, 'en'),
        });
      }
    }

    // Filter by type if requested
    let filteredItems = finalItems;
    if (requestedType === 'food') {
      filteredItems = finalItems.filter(i => i.type === 'food');
    } else if (requestedType === 'drink') {
      filteredItems = finalItems.filter(i => i.type === 'drink' && !i.isAlcoholic);
    } else if (requestedType === 'alcohol') {
      filteredItems = finalItems.filter(i => i.isAlcoholic);
    }

    // Extract special offers (tagged items)
    const specialOffers = filteredItems
      .filter(i =>
        i.tags.some(t => ['chef-special', 'trending', 'bestseller', 'limited'].includes(t))
      )
      .slice(0, 10);

    return {
      restaurant: merchant.businessName,
      generatedAt: new Date().toISOString(),
      totalItems: filteredItems.length,
      menus: filteredItems.map(i => ({
        id: i._id,
        name: i.name,
        description: i.description,
        image: i.image,
        price: i.price,
        variants: i.variants,
        type: i.type, // Add type field
        isVeg: i.isVeg,
        isSpicy: i.isSpicy,
        isAlcoholic: i.isAlcoholic,
        prepTime: i.prepTime,
        ingredients: i.ingredients,
        allergens: i.allergens,
        rating: i.rating,
        displayedIn: i.displayedIn,
      })),
      specialOffers: specialOffers.map(i => ({
        id: i._id,
        name: i.name,
        image: i.image,
        price: i.price,
        tag: i.tags.find(t => ['chef-special', 'trending', 'bestseller', 'limited'].includes(t)),
      })),
      tableNumber,
    };
  }

  /**
   * Get staff menu (for authenticated staff members)
   * Similar to public menu but simpler - no table validation, no special offers
   * 
   * @param {Object} req - Express request object with user.merchant
   * @returns {Object} Staff menu with role and filtered items
   */
  static async getStaffMenu(req) {
    const userMerchant = req.user?.merchant;
    
    if (!userMerchant) {
      throw new AppError('You are not associated with any restaurant.', 403);
    }
    
    const merchantId = userMerchant._id ? userMerchant._id : userMerchant;

    if (!merchantId) {
      throw new AppError('You are not associated with any restaurant.', 403);
    }

    const protocol = req.protocol;
    const host = req.get('host');

    // Verify merchant is active
    const merchant = await Merchant.findById(merchantId).select('businessName isActive');
    if (!merchant || !merchant.isActive) {
      throw new AppError('Restaurant not found or closed.', 404);
    }

    // Calculate current time/date for scheduling
    const now = new Date();
    const dayName = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
    const currentTimeStr = now.toTimeString().slice(0, 5);

    const timeToMinutes = time => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };
    const currentMinutes = timeToMinutes(currentTimeStr);

    // Get all menu groups for merchant
    const allGroups = await MenuGroupRepository.findAll(merchantId, {}, false)
      .select('priority visibility activeDays blockedDays timeSlots items name')
      .lean();

    const activeGroupIds = [];

    // Filter groups by scheduling rules
    for (const group of allGroups) {
      if (group.visibility === 'hidden') continue;

      let isActive = group.visibility === 'always';

      if (!isActive && group.visibility === 'scheduled') {
        const onActiveDay =
          !group.activeDays?.length ||
          group.activeDays.map(d => d.toLowerCase()).includes(dayName);

        const notBlocked =
          !group.blockedDays?.length ||
          !group.blockedDays.map(d => d.toLowerCase()).includes(dayName);

        const inTimeSlot =
          !group.timeSlots?.length ||
          group.timeSlots.some(slot => {
            const startMin = timeToMinutes(slot.start);
            const endMin = timeToMinutes(slot.end);
            // Handle overnight slots (e.g., 22:00-02:00)
            if (endMin < startMin) {
              return currentMinutes >= startMin || currentMinutes <= endMin;
            }
            return currentMinutes >= startMin && currentMinutes <= endMin;
          });

        isActive = onActiveDay && notBlocked && inTimeSlot;
      }

      if (isActive) {
        activeGroupIds.push(group._id);
      }
    }

    // Get active groups with populated menu items
    const MenuGroup = require('../model/MenuGroup.model');
    const activeGroups = await MenuGroup.find({
      _id: { $in: activeGroupIds },
      merchant: merchantId,
    })
      .sort({ priority: -1, _id: 1 }) // Sort by priority DESC, then _id ASC for deterministic tie-breaking
      .populate({
        path: 'items.menu',
        match: { 
          available: true, 
          inStock: true, 
          publishStatus: 'published',
          deletedAt: null // Exclude soft-deleted items
        },
      });

    const origin = `${protocol}://${host}`;
    const seenItemIds = new Set();
    const finalItems = [];

    // Flatten menu items from all active groups
    for (const group of activeGroups) {
      for (const item of group.items) {
        if (!item.menu || item.isHidden) continue;

        const itemIdString = item.menu._id.toString();

        if (seenItemIds.has(itemIdString)) continue;
        seenItemIds.add(itemIdString);

        const menu = item.menu;

        const itemPrice =
          item.overridePrice ||
          (menu.variants && menu.variants[0] ? menu.variants[0].price : menu.price) ||
          0;

        const imageData = resolveSingleImageData({
          image: menu.image,
          origin,
        });

        finalItems.push({
          id: menu._id,
          name: item.customName || getMenuName(menu),
          description: item.customDescription || getMenuDescription(menu) || '',
          image: imageData?.url || null,
          price: itemPrice,
          variants: menu.variants || [],
          type: menu.type,
          isVeg: menu.isVeg,
          isSpicy: menu.isSpicy,
          isAlcoholic: !!menu.isAlcoholic || group.isAlcoholMenu,
          prepTime: menu.prepTime || '15-25 min',
          rating: menu.ratingAverage || 4.5,
          category: getMenuGroupName(group, 'en'),
        });
      }
    }

    return {
      role: req.user.role,
      restaurant: merchant.businessName,
      totalItems: finalItems.length,
      menu: finalItems,
    };
  }

  static async getAll(req) {
    const merchantId = req.user?.merchant?._id || req.user?.merchant;
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const baseQuery = MenuGroupRepository.findAll(merchantId, {}, false);
    const features = new ApiFeatures(baseQuery, req.query)
      .search(['name.en', 'name.am', 'description.en', 'description.am'])
      .filter()
      .sort()
      .limitFields()
      .paginate();
    
    return await features.query || [];
  }

  static async getById(id, merchantId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const menuGroup = await MenuGroupRepository.findById(id, merchantId, false);
    if (!menuGroup) throw new AppError('Menu group not found', 404);
    
    return menuGroup;
  }

  static async getByBranch(merchantId, branchId, filters = {}) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    if (!branchId) throw new AppError('Branch ID is required', 400);
    
    return MenuGroupRepository.findByBranch(merchantId, branchId, filters);
  }

  static async create(data, merchantId, userId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    // Normalize localized fields and catch any errors
    try {
      data.name = normalizeName(data.name);
      if (data.description) {
        data.description = normalizeDescription(data.description);
      }
    } catch (error) {
      // Convert generic errors to AppError with 400 status
      throw new AppError(error.message, 400);
    }
    
    // Validate branches
    if (!data.branches || data.branches.length === 0) {
      throw new AppError('At least one branch is required', 400);
    }
    
    return MenuGroupRepository.create({
      ...data,
      merchant: merchantId,
      createdBy: userId,
      updatedBy: userId
    });
  }

  static async update(id, data, merchantId, userId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const menuGroup = await MenuGroupRepository.findById(id, merchantId, false);
    if (!menuGroup) throw new AppError('Menu group not found', 404);
    
    if (data.name) data.name = normalizeName(data.name);
    if (data.description !== undefined) {
      data.description = normalizeDescription(data.description);
    }
    
    data.updatedBy = userId;
    
    return MenuGroupRepository.updateById(id, merchantId, data);
  }

  static async addItem(groupId, merchantId, menuItemId, itemConfig = {}) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    // Verify menu group exists
    const menuGroup = await MenuGroupRepository.findById(groupId, merchantId, false);
    if (!menuGroup) throw new AppError('Menu group not found', 404);
    
    // Verify menu item exists
    const menuItem = await MenuItemRepository.findById(menuItemId, merchantId, false);
    if (!menuItem) throw new AppError('Menu item not found', 404);
    
    // Check if item already in group
    const alreadyExists = menuGroup.items.some(
      item => item.menu.toString() === menuItemId.toString()
    );
    
    if (alreadyExists) {
      throw new AppError('Menu item already in this group', 409);
    }
    
    const itemData = {
      menu: menuItemId,
      sortOrder: itemConfig.sortOrder || Date.now(),
      overridePrice: itemConfig.overridePrice || null,
      customName: itemConfig.customName || null,
      customDescription: itemConfig.customDescription || null,
      isHidden: itemConfig.isHidden || false
    };
    
    return MenuGroupRepository.addItem(groupId, merchantId, itemData);
  }

  static async removeItem(groupId, merchantId, menuItemId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const menuGroup = await MenuGroupRepository.findById(groupId, merchantId, false);
    if (!menuGroup) throw new AppError('Menu group not found', 404);
    
    return MenuGroupRepository.removeItem(groupId, merchantId, menuItemId);
  }

  static async reorderItems(groupId, merchantId, itemsOrder) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    if (!Array.isArray(itemsOrder)) {
      throw new AppError('itemsOrder must be an array', 400);
    }
    
    const menuGroup = await MenuGroupRepository.findById(groupId, merchantId, false);
    if (!menuGroup) throw new AppError('Menu group not found', 404);
    
    return MenuGroupRepository.reorderItems(groupId, merchantId, itemsOrder);
  }

  static async softDelete(id, merchantId, userId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const menuGroup = await MenuGroupRepository.findById(id, merchantId, false);
    if (!menuGroup) throw new AppError('Menu group not found', 404);
    
    return MenuGroupRepository.softDelete(id, merchantId, userId);
  }

  static async restore(id, merchantId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const menuGroup = await MenuGroupRepository.findById(id, merchantId, true);
    if (!menuGroup) throw new AppError('Menu group not found', 404);
    if (!menuGroup.deletedAt) throw new AppError('Menu group is not deleted', 400);
    
    return MenuGroupRepository.restore(id, merchantId);
  }

  /**
   * Publish menu group for a branch — creates versioned snapshot.
   * Transaction-based approach: Atomic creation of MenuPublication + MenuItem updates.
   * 
   * @param {Object} params - Publish parameters
   * @param {string} params.menuGroupId - Menu group ID to publish
   * @param {string} params.merchantId - Merchant ID
   * @param {string} params.branchId - Branch ID
   * @param {string} params.publishedBy - User ID who is publishing
   * @returns {Object} Created MenuPublication
   */
  static async publishMenuGroup({ menuGroupId, merchantId, branchId, publishedBy }) {
    const mongoose = require('mongoose');
    const Menu = require('../model/MenuItem.model');
    const MenuGroup = require('../model/MenuGroup.model');
    const MenuPublication = require('../../../../models/MenuPublication');
    const Recipe = require('../../../../models/Recipe');
    const logger = require('../../../../utils/logger');
    const { getMenuName, getMenuGroupName } = require('../../../../utils/localization-helper');

    // Validation: Verify all visible items have active recipes
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

    if (missing.length > 0) {
      throw new AppError(`Cannot publish: ${missing.length} item(s) missing active recipes`, 400);
    }

    if (!group.branches.map(b => b.toString()).includes(String(branchId))) {
      throw new AppError('Menu group is not assigned to this branch', 400);
    }

    // Retry logic for version conflicts
    const MAX_VERSION_RETRIES = 3;
    let attempt = 0;
    let publication = null;

    while (attempt < MAX_VERSION_RETRIES) {
      attempt++;

      // Start transaction session
      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          // Get latest version (within transaction for consistency)
          const lastPublications = await MenuPublication.find({
            merchant: merchantId,
            branch: branchId,
            menuGroup: menuGroupId,
          })
            .sort({ version: -1 })
            .limit(1)
            .select('version')
            .lean()
            .session(session);

          const last = lastPublications[0];
          const version = (last?.version || 0) + 1;

          // Build snapshot
          const snapshot = {
            menuGroup: {
              _id: group._id,
              name: getMenuGroupName(group, 'en'),
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
              name: getMenuName(m, 'en'),
              publishStatus: 'published',
            })),
          };

          // Create MenuPublication (within transaction)
          const [newPublication] = await MenuPublication.create(
            [
              {
                merchant: merchantId,
                branch: branchId,
                menuGroup: menuGroupId,
                version,
                publishedBy,
                snapshot,
                recipeValidation: { passed: true, missingRecipes: [] },
              },
            ],
            { session }
          );

          publication = newPublication;

          // Update MenuItem.publishStatus (within same transaction)
          const updateResult = await Menu.updateMany(
            { _id: { $in: menus.map(m => m._id) }, merchant: merchantId },
            { $set: { publishStatus: 'published' } },
            { session }
          );

          logger.info('menu.published', {
            publicationId: String(publication._id),
            menuGroupId: String(menuGroupId),
            branchId: String(branchId),
            version: publication.version,
            merchantId: String(merchantId),
            itemCount: updateResult.modifiedCount,
          });

          // Transaction will auto-commit if we reach here without error
        });

        // Transaction succeeded - break retry loop
        break;

      } catch (error) {
        // Check for duplicate version (race condition)
        const isVersionConflict = error.code === 11000 && error.keyPattern?.version;
        const isTransientError = error.errorLabels?.includes('TransientTransactionError');

        if (isVersionConflict || isTransientError) {
          if (attempt < MAX_VERSION_RETRIES) {
            logger.warn('menu.publish.version_conflict', {
              menuGroupId: String(menuGroupId),
              branchId: String(branchId),
              attempt,
              errorType: isVersionConflict ? 'duplicate_version' : 'transient_transaction',
              retrying: true,
            });
            continue; // Retry transaction
          } else {
            throw new AppError(
              'Publish failed due to concurrent modification. Please try again.',
              409
            );
          }
        }

        // Other errors - fail immediately
        throw error;
      } finally {
        // Always end session
        await session.endSession();
      }
    }

    // Create audit log entry (outside transaction - failure shouldn't block publish)
    try {
      const auditLogger = require('../../../../utils/auditLogger');
      await auditLogger({
        user: publishedBy,
        merchant: merchantId,
        branch: branchId,
        action: 'MENU_PUBLISH',
        resource: 'MenuPublication',
        resourceId: publication._id,
        method: 'POST',
        endpoint: '/api/v1/menu/publish',
        statusCode: 200,
        severity: 'medium',
        outcome: 'success',
        metadata: {
          menuGroupId: String(menuGroupId),
          menuGroupName: getMenuGroupName(group, 'en'),
          version: publication.version,
          itemCount: menus.length,
          publishedItems: menus.map(m => ({
            id: String(m._id),
            name: getMenuName(m, 'en'),
          })),
          source: 'service',
        },
      });
    } catch (auditError) {
      // Log audit failure but don't throw - publish succeeded
      logger.error('menu.publish.audit_failed', {
        error: auditError.message,
        publicationId: String(publication._id),
      });
    }

    return publication;
  }
}

module.exports = MenuGroupService;
