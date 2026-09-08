const Merchant = require('../../../../models/merchantModel');
const Table = require('../../../../models/tabelModel');
const AppError = require('../../../../utils/appError');
const { MenuRepository } = require('../repository/MenuRepository');
const { MenuManagementService } = require('../menu-management.service');
const {
  parseJSON,
  assertMenuCreateFields,
  assertBranchMenuGroupName,
} = require('../validators/menu.validators');
const {
  attachMenuItemImage,
  attachMenuItemImageStandard,
  attachComboImage,
  attachMenuGroupImages,
} = require('../dto/menu-response.dto');
const { resolveSingleImageData } = require('../utils/image-response');
const { ROLE_NAMES } = require('../../../common/constants/roles');
const ApiFeatures = require('../../../../utils/apiFeatures');
const {
  getMenuName,
  getMenuDescription,
  getComboName,
  getComboDescription,
  getMenuGroupName,
  getMenuGroupDescription,
  normalizeName,
  normalizeDescription,
} = require('../../../../utils/localization-helper');

class MenuService {
  /**
   * Validate that one or more branch IDs belong to the given merchant.
   * @param {string|string[]} branchIds - Single branch ID or array of branch IDs
   * @param {string} merchantId - Merchant ObjectId to validate against
   * @throws {AppError} 403 if any branch doesn't belong to the merchant
   */
  static async validateBranchOwnership(branchIds, merchantId) {
    const Branch = require('../../../../models/branchModel');
    
    const ids = Array.isArray(branchIds) ? branchIds : [branchIds];
    const idsAsStrings = ids.map(id => id.toString());
    
    const validBranches = await Branch.find({
      _id: { $in: idsAsStrings },
      merchant: merchantId,
    }).select('_id');
    
    if (validBranches.length !== idsAsStrings.length) {
      throw new AppError('One or more branches do not belong to your merchant', 403);
    }
  }

  /* ---------- Publish / orderability (MenuManagementService — unchanged logic) ---------- */

  static publishMenuGroup(params) {
    const MenuGroupService = require('./MenuGroup.service');
    return MenuGroupService.publishMenuGroup(params);
  }

  static archiveMenuItem(menuItemId, merchantId) {
    return MenuManagementService.archiveMenuItem(menuItemId, merchantId);
  }

  static getLatestPublicationForBranch(merchantId, branchId) {
    return MenuManagementService.getLatestPublicationForBranch(merchantId, branchId);
  }

  static buildOrderableMenuFilter(merchantId) {
    return MenuManagementService.buildOrderableMenuFilter(merchantId);
  }

  static assertMenuItemOrderable(menuItem) {
    return MenuManagementService.assertMenuItemOrderable(menuItem);
  }

  /* ---------- Menu items ---------- */

  static async getPublicMenu(req) {
    const merchantId = req.merchantId;
    const tableId = req.tableId;
    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    let tableNumber = null;

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

    const merchant = await Merchant.findById(merchantId).select('businessName isActive');
    if (!merchant || !merchant.isActive) {
      throw new AppError('Restaurant not found or closed.', 404);
    }

    const now = new Date();
    const dayName = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
    const currentTimeStr = now.toTimeString().slice(0, 5);
    const today = now.toISOString().split('T')[0];

    const timeToMinutes = time => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };
    const currentMinutes = timeToMinutes(currentTimeStr);

    const allGroups = await MenuRepository.findMenuGroups({ merchant: merchant._id })
      .select(
        'priority visibility activeDays blockedDays timeSlots specialDates isAlcoholMenu items name'
      )
      .sort({ priority: -1 });

    const activeGroupIds = new Set();

    for (const group of allGroups) {
      if (group.visibility === 'hidden') continue;

      let isActive = group.visibility === 'always';

      if (!isActive && group.visibility === 'scheduled') {
        const onActiveDay =
          !group.activeDays?.length || group.activeDays.map(d => d.toLowerCase()).includes(dayName);

        const notBlocked =
          !group.blockedDays?.length ||
          !group.blockedDays.map(d => d.toLowerCase()).includes(dayName);

        const inTimeSlot =
          !group.timeSlots?.length ||
          group.timeSlots.some(slot => {
            const startMin = timeToMinutes(slot.start);
            const endMin = timeToMinutes(slot.end);
            if (endMin < startMin) {
              return currentMinutes >= startMin || currentMinutes <= endMin;
            }
            return currentMinutes >= startMin && currentMinutes <= endMin;
          });

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

    const activeGroups = await MenuRepository.findMenuGroups({
      _id: { $in: Array.from(activeGroupIds) },
      merchant: merchantId,
    })
      .sort({ priority: -1 })
      .populate({
        path: 'items.menu',
        match: { available: true, inStock: true, publishStatus: 'published' },
        select:
          'name description image imageUrl imageFilename variants price type isVeg isSpicy isAlcoholic prepTime tags ingredients allergens ratingAverage',
      });
    const origin = `${req.protocol}://${req.get('host')}`;

    const seenItemIds = new Set();
    const finalItems = [];

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
          name: item.customName || getMenuName(menu),  // ✅ Use helper
          description: item.customDescription || getMenuDescription(menu) || '',  // ✅ Use helper
          image: imageData?.url || null,
          price: defaultPrice,
          variants: menu.variants || [],
          type: menu.type,
          isVeg: menu.isVeg,
          isSpicy: menu.isSpicy,
          isAlcoholic: !!menu.isAlcoholic || group.isAlcoholMenu,
          prepTime: menu.prepTime || '15-25 min',
          tags: menu.tags || [],
          ingredients: menu.ingredients || [],
          allergens: menu.allergens || [],
          rating: menu.ratingAverage || 4.5,
          displayedIn: getMenuGroupName(group, 'en'),  // ✅ Use helper for group name
        });
      }
    }

    let filteredItems = finalItems;
    if (requestedType === 'food') {
      filteredItems = finalItems.filter(i => i.type === 'food');
    } else if (requestedType === 'drink') {
      filteredItems = finalItems.filter(i => i.type === 'drink' && !i.isAlcoholic);
    } else if (requestedType === 'alcohol') {
      filteredItems = finalItems.filter(i => i.isAlcoholic);
    }

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

  // service/MenuService.js
  // service/MenuService.js

  static async getAllMenu(req) {
    const merchantId = req.user?.merchant?._id || req.user?.merchant;

    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    // Base query with merchant scoping (NEVER from req.query)
    const baseQuery = MenuRepository.findMenus({ merchant: merchantId });

    // Apply ApiFeatures for filter, search, sort, fields, pagination
    const features = new ApiFeatures(baseQuery, req.query)
      .search(['name', 'description', 'category'])
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const menuItems = await features.query;

    return menuItems || [];
  }

  static async getMenu(req) {
    const merchantId = req.user?.merchant?._id || req.user?.merchant;

    if (!merchantId) {
      throw new AppError('Merchant ID is required', 400);
    }

    const menuItem = await MenuRepository.findMenuOne({
      _id: req.params.id,
      merchant: merchantId,
    });

    if (!menuItem) {
      throw new AppError('Menu item not found.', 404);
    }

    // ✅ Return the Mongoose document directly (NOT the formatted version)
    // The controller will handle population and formatting
    return menuItem;
  }

  // service/MenuService.js

  static async createNewMenu(menuData, req) {
    // ✅ Get merchantId from menuData instead of req.user
    const merchantId = menuData.merchant || req?.user?.merchant?._id;
    if (!merchantId) {
      throw new AppError('Merchant ID is required to create a menu item', 400);
    }

    const variants = parseJSON(menuData.variants, []);
    const ingredients = parseJSON(menuData.ingredients, []);
    const allergens = parseJSON(menuData.allergens, []);
    const tags = parseJSON(menuData.tags, []);

    const {
      name,
      type,
      category,
      description,
      prepTime,
      drinkType,
      isAlcoholic,
      alcoholPercentage,
      isVeg,
      isSpicy,
      available,
      price,
      image,
      imageFilename,
      categoryId,
    } = menuData;

    // ✅ Normalize name and description to handle both string and localized formats
    const normalizedName = normalizeName(name);
    const normalizedDescription = normalizeDescription(description);

    assertMenuCreateFields({ name: normalizedName, type, categoryId: categoryId || category });

    let finalVariants = [];

    if (variants.length > 0) {
      finalVariants = variants.map((v, index) => {
        if (v.price == null || v.price < 0) {
          throw new AppError(`Variant ${index + 1} must have a valid price`, 400);
        }

        return {
          name: v.name?.trim() || 'Regular',
          size: v.size || undefined,
          volume: v.volume || undefined,
          price: Number(v.price),
          calories: v.calories,
          available: v.available !== false,
          isDefault: Boolean(v.isDefault),
        };
      });

      if (!finalVariants.some(v => v.isDefault)) {
        finalVariants[0].isDefault = true;
      }
    }

    if (finalVariants.length === 0) {
      finalVariants.push({
        name: 'Regular',
        price: Number(price) || 0,
        isDefault: true,
      });
    }

    // ✅ Build menu data with localized name and description
    const menuDataToCreate = {
      merchant: merchantId,
      name: normalizedName,  // ✅ Localized name object
      type,
      category: category?.trim() || null,  // Legacy field - optional
      categoryId: categoryId || null,  // New field - preferred
      description: normalizedDescription,  // ✅ Localized description object
      prepTime,
      drinkType: drinkType || null,
      isAlcoholic: isAlcoholic === 'true',
      alcoholPercentage: Number(alcoholPercentage) || 0,
      isVeg: isVeg === 'true' ? true : isVeg === 'false' ? false : null,
      isSpicy: isSpicy === 'true',
      available: available !== 'false',
      price: price || 0,
      variants: finalVariants,
      recipe: { ingredients },
      allergens,
      tags,
      // ✅ Handle image properly
      image: image || null,
      imageFilename: imageFilename || null,
    };

    // Create the menu
    const menu = await MenuRepository.createMenu(menuDataToCreate);

    // Add to default menu group
    await MenuRepository.findOneAndUpdateMenuGroup(
      { merchant: merchantId, isSystemDefault: true },
      {
        $push: {
          items: {
            menu: menu._id,
            sortOrder: Date.now(),
          },
        },
      }
    );

    return menu;
  }

  static async updateMenu(req) {
    const merchantId = req.user.merchant._id;

    const jsonFields = ['variants', 'ingredients', 'allergens', 'tags'];
    jsonFields.forEach(field => {
      if (typeof req.body[field] === 'string') {
        req.body[field] = parseJSON(req.body[field], []);
      }
    });

    if (req.body.available) req.body.available = req.body.available === 'true';
    if (req.body.isSpicy) req.body.isSpicy = req.body.isSpicy === 'true';
    if (req.body.isAlcoholic) req.body.isAlcoholic = req.body.isAlcoholic === 'true';

    if (req.body.isVeg !== undefined) {
      req.body.isVeg = req.body.isVeg === 'true' ? true : req.body.isVeg === 'false' ? false : null;
    }

    // Validate variant prices
    if (req.body.variants && Array.isArray(req.body.variants)) {
      req.body.variants.forEach((v, index) => {
        if (v.price == null || v.price < 0) {
          throw new AppError(`Variant ${index + 1} must have a valid price`, 400);
        }
      });
    }

    // Fix ingredients field structure
    if (req.body.ingredients) {
      req.body.recipe = { ingredients: req.body.ingredients };
      delete req.body.ingredients;
    }

    const updatedMenu = await MenuRepository.findOneAndUpdateMenu(
      { _id: req.params.id, merchant: merchantId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedMenu) throw new AppError('Menu item not found.', 404);
    return updatedMenu;
  }

  static async deleteMenu(req) {
    const merchantId = req.user.merchant._id;

    const menuItem = await MenuRepository.findOneAndDeleteMenu({
      _id: req.params.id,
      merchant: merchantId,
    });

    if (!menuItem) throw new AppError('Menu item not found.', 404);

    await MenuRepository.updateManyMenuGroups(
      { merchant: merchantId },
      { $pull: { items: { menu: req.params.id } } }
    );

    return menuItem;
  }

  static async getActiveMenu(req) {
    // merchantId must come exclusively from the authenticated user's merchant context.
    // Never accept it from route params — a staff user must never be able to
    // request another merchant's menu by manipulating the URL.
    const merchantId = req.user.merchant._id ?? req.user.merchant;
    const now = new Date();
    const currentDay = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();

    const menuGroups = await MenuRepository.findMenuGroups({
      merchant: merchantId,
      visibility: { $in: ['always', 'scheduled'] },
      $and: [
        { $or: [{ activeDays: currentDay }, { activeDays: { $size: 0 } }] },
        { $or: [{ blockedDays: { $ne: currentDay } }, { blockedDays: { $size: 0 } }] }
      ],
    })
      .sort({ priority: -1 })
      .populate({
        path: 'items.menu',
        match: { available: true, inStock: true, publishStatus: 'published' },
        populate: { path: 'variants' },
      });

    const cleanedGroups = menuGroups
      .map(group => {
        const visibleItems = group.items.filter(i => i.menu && !i.isHidden);
        if (visibleItems.length === 0) return null;

        return {
          _id: group._id,
          name: getMenuGroupName(group, 'en'),  // ✅ Use helper for group name
          description: getMenuGroupDescription(group, 'en'),  // ✅ Use helper for group description
          bannerImage: group.bannerImage,
          items: visibleItems.map(i => ({
            _id: i.menu._id,
            name: i.customName || getMenuName(i.menu),  // ✅ Use helper
            description: i.customDescription || getMenuDescription(i.menu),  // ✅ Use helper
            image:
              resolveSingleImageData({
                image: i.menu.image,
              })?.url || null,
            price: i.overridePrice || i.menu.variants[0]?.price || i.menu.price,
            variants: i.menu.variants,
            isVeg: i.menu.isVeg,
            isSpicy: i.menu.isSpicy,
            prepTime: i.menu.prepTime,
          })),
        };
      })
      .filter(Boolean);

    const combos = await MenuRepository.findCombos({
      merchant: merchantId,
    })
      .sort({ priority: -1 })
      .populate('items.menuItem');

    return { menu: cleanedGroups, combos, generatedAt: new Date() };
  }

  static async toggleMenuItemAvailability(req) {
    const merchantId = req.user.merchant._id;
    const itemId = req.params.id;

    const menuItem = await MenuRepository.findMenuOne({
      _id: itemId,
      merchant: merchantId,
    });

    if (!menuItem) {
      throw new AppError('Menu item not found or access denied.', 404);
    }

    const newAvailability = !menuItem.available;
    menuItem.available = newAvailability;

    if (menuItem.variants && menuItem.variants.length > 0) {
      menuItem.variants = menuItem.variants.map(variant => ({
        ...variant,
        available: newAvailability,
      }));
    }

    await menuItem.save({ validateModifiedOnly: true });

    return {
      id: menuItem._id,
      name: getMenuName(menuItem),  // ✅ Use helper
      available: menuItem.available,
      message: `Menu item is now ${newAvailability ? 'available' : 'unavailable'}`,
    };
  }

  static async getStaffMenu(req) {
    const userMerchant = req.user.merchant;
    const merchantId = userMerchant._id ? userMerchant._id : userMerchant;

    if (!merchantId) {
      throw new AppError('You are not associated with any restaurant.', 403);
    }

    const protocol = req.protocol;
    const host = req.get('host');

    const merchant = await Merchant.findById(merchantId).select('businessName isActive');
    if (!merchant || !merchant.isActive) {
      throw new AppError('Restaurant not found or closed.', 404);
    }

    const now = new Date();
    const dayName = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
    const currentTimeStr = now.toTimeString().slice(0, 5);

    const timeToMinutes = time => {
      const timeArray = time.split(':');
      const hours = Number(timeArray[0]);
      const minutes = Number(timeArray[1]);
      return hours * 60 + minutes;
    };
    const currentMinutes = timeToMinutes(currentTimeStr);

    const allGroups = await MenuRepository.findMenuGroups({ merchant: merchantId }).sort({
      priority: -1,
    });
    const activeGroupIds = [];

    for (let i = 0; i < allGroups.length; i++) {
      const group = allGroups[i];
      if (group.visibility === 'hidden') continue;

      let isActive = group.visibility === 'always';

      if (!isActive && group.visibility === 'scheduled') {
        const onActiveDay =
          !group.activeDays ||
          group.activeDays.length === 0 ||
          group.activeDays.map(d => d.toLowerCase()).includes(dayName);

        const notBlocked =
          !group.blockedDays ||
          group.blockedDays.length === 0 ||
          !group.blockedDays.map(d => d.toLowerCase()).includes(dayName);

        const inTimeSlot =
          !group.timeSlots ||
          group.timeSlots.length === 0 ||
          group.timeSlots.some(slot => {
            const startMin = timeToMinutes(slot.start);
            const endMin = timeToMinutes(slot.end);
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

    const activeGroups = await MenuRepository.findMenuGroups({
      _id: { $in: activeGroupIds },
      merchant: merchantId,
    })
      .sort({ priority: -1 })
      .populate({
        path: 'items.menu',
        match: { available: true, inStock: true, publishStatus: 'published' },
      });

    const origin = `${protocol}://${host}`;
    const seenItemIds = new Set();
    const finalItems = [];

    for (let j = 0; j < activeGroups.length; j++) {
      const groupObj = activeGroups[j];

      for (let k = 0; k < groupObj.items.length; k++) {
        const itemEntry = groupObj.items[k];

        if (!itemEntry.menu || itemEntry.isHidden) continue;

        const itemIdString = itemEntry.menu._id.toString();

        if (seenItemIds.has(itemIdString)) continue;
        seenItemIds.add(itemIdString);

        const menu = itemEntry.menu;

        const itemPrice =
          itemEntry.overridePrice ||
          (menu.variants && menu.variants[0] ? menu.variants[0].price : menu.price) ||
          0;

        const imageData = resolveSingleImageData({
          image: menu.image,
          origin,
        });

        finalItems.push({
          id: menu._id,
          name: itemEntry.customName || getMenuName(menu),  // ✅ Use helper
          description: itemEntry.customDescription || getMenuDescription(menu) || '',  // ✅ Use helper
          image: imageData?.url || null,
          price: itemPrice,
          variants: menu.variants || [],
          type: menu.type,
          isVeg: menu.isVeg,
          isSpicy: menu.isSpicy,
          isAlcoholic: !!menu.isAlcoholic || groupObj.isAlcoholMenu,
          prepTime: menu.prepTime || '15-25 min',
          rating: menu.ratingAverage || 4.5,
          category: groupObj.name,
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

  /* ---------- Menu groups ---------- */

  static async createMenuGroup(req) {
    const merchantId = req.user.merchant._id;
    const branchId = req.user.branch._id;

    const {
      name,
      description,
      bannerImage,
      visibility,
      priority,
      timeSlots,
      activeDays,
      blockedDays,
      isAlcoholMenu,
      items,
    } = req.body;

    // ✅ Normalize localized fields
    const normalizedName = normalizeName(name);
    const normalizedDescription = normalizeDescription(description);

    return MenuRepository.createMenuGroup({
      merchant: merchantId,
      branches: branchId,
      name: normalizedName,
      description: normalizedDescription,
      bannerImage,
      visibility: visibility || 'always',
      priority: priority || 0,
      timeSlots,
      activeDays,
      blockedDays,
      isAlcoholMenu: isAlcoholMenu || false,
      items,
    });
  }

  static async getAllMenuGroups(req) {
    const merchantId = req.user.merchant._id;

    // Base query with merchant scoping (NEVER from req.query)
    const baseQuery = MenuRepository.findMenuGroups({ merchant: merchantId })
      .populate({
        path: 'items.menu',
        select: 'name image variants available inStock',
      });

    // Apply ApiFeatures for filter, search, sort, fields, pagination
    const features = new ApiFeatures(baseQuery, req.query)
      .search(['name', 'description'])
      .filter()
      .sort()
      .limitFields()
      .paginate();

    return await features.query;
  }

  static async getAllMenuGroupsLight(req) {
    const merchantId = req.user.merchant._id || req.user._id;

    // Base query with merchant scoping (NEVER from req.query)
    const baseQuery = MenuRepository.findMenuGroups({ merchant: merchantId })
      .select(
        'name description bannerImage visibility priority isAlcoholMenu isSystemDefault slug items.menu items.sortOrder items.isHidden items.overridePrice items.customName'
      )
      .lean();

    // Apply ApiFeatures for filter, search, sort, pagination
    const features = new ApiFeatures(baseQuery, req.query)
      .search(['name'])
      .filter()
      .sort()
      .paginate();

    const menuGroups = await features.query;

    return menuGroups.map(group => ({
      ...group,
      items: group.items.map(item => ({
        menu: item.menu,
        sortOrder: item.sortOrder,
        overridePrice: item.overridePrice,
        customName: item.customName,
        customDescription: item.customDescription,
        isHidden: item.isHidden,
        _id: item._id,
      })),
    }));
  }

  static async getMenuGroup(req) {
    const merchantId = req.user.merchant._id;

    const menuGroup = await MenuRepository.findMenuGroupOne({
      _id: req.params.id,
      merchant: merchantId,
    })
      .populate({
        path: 'items.menu',
        select: 'name image type variants available inStock prepTime isVeg isSpicy isAlcoholic',
      })
      .lean();

    if (!menuGroup) throw new AppError('Menu group not found', 404);

    return attachMenuGroupImages(menuGroup, req);
  }

  static async updateMenuGroup(req) {
    const merchantId = req.user.merchant._id || req.user._id;

    // ✅ Normalize localized fields if present
    if (req.body.name) {
      req.body.name = normalizeName(req.body.name);
    }
    if (req.body.description !== undefined) {
      req.body.description = normalizeDescription(req.body.description);
    }

    const menuGroup = await MenuRepository.findOneAndUpdateMenuGroup(
      { _id: req.params.id, merchant: merchantId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!menuGroup) throw new AppError('Menu group not found or unauthorized', 404);
    return menuGroup;
  }

  static async deleteMenuGroup(req) {
    const merchantId = req.user.merchant._id || req.user._id;

    const menuGroup = await MenuRepository.findOneAndDeleteMenuGroup({
      _id: req.params.id,
      merchant: merchantId,
    });

    if (!menuGroup) throw new AppError('Menu group not found or unauthorized', 404);
    return menuGroup;
  }

  static async addItemToMenuGroup(req) {
    const { menuId } = req.body;
    const merchantId = req.user.merchant._id || req.user._id;

    const menuItem = await MenuRepository.findMenuOne({ _id: menuId, merchant: merchantId });
    if (!menuItem) throw new AppError('Dish not found', 404);

    const updated = await MenuRepository.findOneAndUpdateMenuGroup(
      { _id: req.params.id, merchant: merchantId },
      {
        $push: {
          items: {
            menu: menuId,
            sortOrder: Date.now(),
          },
        },
      },
      { new: true }
    );

    if (!updated) throw new AppError('Menu group not found', 404);

    await updated.populate('items.menu');
    return updated;
  }

  static async removeItemFromMenuGroup(req) {
    const merchantId = req.user.merchant._id || req.user._id;
    const { menuId } = req.body;

    const updated = await MenuRepository.findOneAndUpdateMenuGroup(
      { _id: req.params.id, merchant: merchantId },
      { $pull: { items: { menu: menuId } } },
      { new: true }
    );

    if (!updated) throw new AppError('Menu group or item not found', 404);

    await updated.populate('items.menu');
    return updated;
  }

  static async reorderMenuGroupItems(req) {
    const { items } = req.body;
    const merchantId = req.user.merchant._id || req.user._id;

    const menuGroup = await MenuRepository.findMenuGroupOne({
      _id: req.params.id,
      merchant: merchantId,
    });
    if (!menuGroup) throw new AppError('Menu group not found', 404);

    menuGroup.items.forEach(item => {
      const newOrder = items.find(i => i.menuId === item.menu.toString());
      if (newOrder) item.sortOrder = newOrder.sortOrder;
    });

    await menuGroup.save();
    await menuGroup.populate('items.menu');
    return menuGroup;
  }

  /* ---------- Combos ---------- */

  static async enrichComboItems(items) {
    if (!items?.length) {
      throw new AppError('Combo must have at least one item', 400);
    }

    const menuIds = [...new Set(items.map(i => i.menuItem))];
    const menus = await MenuRepository.findMenus({ _id: { $in: menuIds } }).select('name');

    const menuMap = Object.fromEntries(menus.map(m => [m._id.toString(), getMenuName(m)]));  // ✅ Use helper

    return items.map(item => {
      const name = menuMap[item.menuItem.toString()];
      if (!name) {
        throw new AppError(`Menu item ${item.menuItem} not found`, 404);
      }

      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        throw new AppError('Invalid item quantity', 400);
      }

      return {
        menuItem: item.menuItem,
        nameFallback: name,
        quantity: qty,
      };
    });
  }

  static parseComboFormFields(body) {
    ['items', 'branches', 'availableOnDays', 'timeSlots', 'tags'].forEach(field => {
      if (typeof body[field] === 'string') {
        try {
          body[field] = JSON.parse(body[field]);
        } catch {
          body[field] = [];
        }
      }
    });
  }

  static async createCombo(comboData, req) {
    MenuService.parseComboFormFields(comboData);

    // Normalize localized fields
    if (comboData.name) {
      comboData.name = normalizeName(comboData.name);
    }
    if (comboData.description) {
      comboData.description = normalizeDescription(comboData.description);
    }

    if (req.user.role.name !== ROLE_NAMES.SUPER_MERCHANT_ADMIN) {
      if (!req.user.branch) throw new AppError('No branch assigned', 403);
      comboData.branches = [req.user.branch._id];
    } else if (!comboData.branches?.length) {
      throw new AppError('Super admin must select at least one branch', 400);
    } else {
      // Validate branch ownership for SUPER-MERCHANT-ADMIN
      await MenuService.validateBranchOwnership(comboData.branches, req.user.merchant._id);
    }

    comboData.items = await MenuService.enrichComboItems(comboData.items);
    comboData.merchant = req.user.merchant._id;

    return MenuRepository.createCombo(comboData);
  }

  static async getActiveCombos(req) {
    const branchId = req.query.branchId || req.user?.branch?._id;
    if (!branchId) throw new AppError('Branch ID is required', 400);

    // Base query with merchant scoping (NEVER from req.query)
    const baseQuery = MenuRepository.findCombos({
      merchant: req.user.merchant._id,
      $or: [{ branches: { $size: 0 } }, { branches: branchId }],
    }).populate('items.menuItem', 'name image price defaultVariant variants available inStock');

    // Apply ApiFeatures for search, filter, sort, fields, pagination
    const features = new ApiFeatures(baseQuery, req.query)
      .search(['name', 'description'])
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const combos = await features.query;

    return combos
      .filter(combo => combo.isAvailableNow(branchId))
      .map(combo => {
        const override = combo.branchOverrides.find(
          o => o.branch.toString() === branchId.toString()
        );

        if (!override) return combo.toObject();

        return {
          ...combo.toObject(),
          comboPrice: override.comboPrice ?? combo.comboPrice,
          items: override.items?.length > 0 ? override.items : combo.items,
          availableOnDays: override.availableOnDays ?? combo.availableOnDays,
          timeSlots: override.timeSlots ?? combo.timeSlots,
          validFrom: override.validFrom ?? combo.validFrom,
          validUntil: override.validUntil ?? combo.validUntil,
          isActive: override.isActive ?? combo.isActive,
          isBranchSpecial: true,
        };
      });
  }

  static async getAllCombos(req) {
    const userRole = req.user.role.name;
    const userBranchId = req.user.branch?._id;

    // Build base query filter (merchant scoping NEVER from req.query)
    let queryFilter = { merchant: req.user.merchant._id };

    if (userRole !== ROLE_NAMES.SUPER_MERCHANT_ADMIN) {
      if (!userBranchId) throw new AppError('No branch assigned', 403);
      queryFilter.$or = [{ branches: { $size: 0 } }, { branches: userBranchId }];
    }

    // Base query with merchant scoping
    const baseQuery = MenuRepository.findCombos(queryFilter).populate({
      path: 'branches',
      select: 'name location.code location.city location.formattedAddress',
    });

    // Apply ApiFeatures for search, filter, sort, fields, pagination
    const features = new ApiFeatures(baseQuery, req.query)
      .search(['name', 'description'])
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const combos = await features.query;

    return combos.map(combo => attachComboImage(combo.toObject(), req));
  }

  static async getCombo(req) {
    const merchantId = req.user.merchant._id;
    const combo = await MenuRepository.findComboById(req.params.id, merchantId).populate({
      path: 'branches',
      select: 'name location.formattedAddress location.city location.code publicUrl',
    });

    if (!combo) {
      throw new AppError('Combo not found', 404);
    }

    return attachComboImage(combo.toObject(), req);
  }

  static async updateCombo(req) {
    MenuService.parseComboFormFields(req.body);

    // ✅ Normalize localized fields if present
    if (req.body.name) {
      req.body.name = normalizeName(req.body.name);
    }
    if (req.body.description !== undefined) {
      req.body.description = normalizeDescription(req.body.description);
    }

    const combo = await MenuRepository.findComboOne({
      _id: req.params.id,
      merchant: req.user.merchant._id,
    });
    if (!combo) throw new AppError('Combo not found', 404);

    if (req.body.branches !== undefined && req.user.role.name !== ROLE_NAMES.SUPER_MERCHANT_ADMIN) {
      throw new AppError('Not allowed to change branches', 403);
    }

    // Validate branch ownership if SUPER-MERCHANT-ADMIN is updating branches
    if (req.body.branches !== undefined && req.user.role.name === ROLE_NAMES.SUPER_MERCHANT_ADMIN) {
      await MenuService.validateBranchOwnership(req.body.branches, req.user.merchant._id);
    }

    if (req.body.items) {
      req.body.items = await MenuService.enrichComboItems(req.body.items);
    }

    Object.assign(combo, req.body);
    await combo.save();
    return combo;
  }

  static async updateBranchOverride(req) {
    const { comboId } = req.params;
    const branchId = req.user.branch?._id?.toString();

    ['items', 'availableOnDays', 'timeSlots'].forEach(field => {
      if (typeof req.body[field] === 'string') {
        try {
          req.body[field] = JSON.parse(req.body[field]);
        } catch {
          req.body[field] = [];
        }
      }
    });

    const combo = await MenuRepository.findComboOne({
      _id: comboId,
      merchant: req.user.merchant._id,
    });
    if (!combo) throw new AppError('Combo not found', 404);

    if (
      req.user.role.name !== ROLE_NAMES.SUPER_MERCHANT_ADMIN &&
      req.user.branch?._id.toString() !== branchId
    ) {
      throw new AppError('You can only override your own branch', 403);
    }

    const isApplicable =
      combo.branches.length === 0 || combo.branches.some(b => b.toString() === branchId);
    if (!isApplicable) throw new AppError('Combo not available in this branch', 400);

    combo.branchOverrides = combo.branchOverrides.filter(o => o.branch.toString() !== branchId);

    const hasData = Object.keys(req.body).length > 0;
    if (!hasData) {
      await combo.save();
      return { combo, message: 'Branch override removed' };
    }

    if (req.body.items) {
      req.body.items = await MenuService.enrichComboItems(req.body.items);
    }

    combo.branchOverrides.push({ branch: branchId, ...req.body });

    await combo.save();

    const refreshed = await MenuRepository.findComboById(comboId, req.user.merchant._id);
    return { combo: refreshed, message: 'Branch override updated' };
  }

  static async deleteCombo(req) {
    const combo = await MenuRepository.findOneAndDeleteCombo({
      _id: req.params.id,
      merchant: req.user.merchant._id,
    });

    if (!combo) throw new AppError('Combo not found or not authorized', 404);
    return combo;
  }

  static async incrementComboSold({ comboId, quantity = 1 }) {
    const result = await MenuRepository.findByIdAndUpdateCombo(
      comboId,
      { $inc: { totalSold: quantity } },
      { new: true }
    );

    if (!result) throw new AppError('Combo not found', 404);
    return result;
  }

  static async toggleComboActive(req) {
    const merchantId = req.user.merchant._id;
    const comboId = req.params.id;

    const combo = await MenuRepository.findComboOne({
      _id: comboId,
      merchant: merchantId,
    });

    if (!combo) {
      throw new AppError('Combo not found or access denied.', 404);
    }

    const newActiveStatus = !combo.isActive;
    combo.isActive = newActiveStatus;

    await combo.save({ validateModifiedOnly: true });

    return {
      id: combo._id,
      name: getComboName(combo, 'en'), // Extract English name
      isActive: combo.isActive,
      message: `Special offer is now ${newActiveStatus ? 'active' : 'inactive'}`,
    };
  }

  static async toggleBranchActive(req) {
    const { comboId } = req.params;
    const branchId = req.user.branch?._id?.toString();

    if (!branchId) throw new AppError('No branch assigned', 403);

    let targetBranchId = branchId;
    if (req.user.role.name === ROLE_NAMES.SUPER_MERCHANT_ADMIN && req.body.branchId) {
      // Validate branch ownership before accepting submitted branch ID
      await MenuService.validateBranchOwnership(req.body.branchId, req.user.merchant._id);
      targetBranchId = req.body.branchId;
    }

    const combo = await MenuRepository.findComboOne({
      _id: comboId,
      merchant: req.user.merchant._id,
    });
    if (!combo) throw new AppError('Combo not found', 404);

    const isApplicable =
      combo.branches.length === 0 || combo.branches.some(b => b.toString() === targetBranchId);
    if (!isApplicable) throw new AppError('Combo not available in this branch', 400);

    let override = combo.branchOverrides.find(o => o.branch.toString() === targetBranchId);
    if (!override) {
      override = { branch: targetBranchId };
      combo.branchOverrides.push(override);
    }

    const current = override.isActive !== undefined ? override.isActive : combo.isActive;
    override.isActive = !current;

    const meaningfulFields = [
      'isActive',
      'comboPrice',
      'items',
      'availableOnDays',
      'timeSlots',
      'validFrom',
      'validUntil',
    ];

    const hasMeaningfulData = meaningfulFields.some(field => {
      const value = override[field];
      return Array.isArray(value) ? value.length > 0 : value !== undefined;
    });

    if (!hasMeaningfulData) {
      combo.branchOverrides.pull(override._id);
    }

    await combo.save();

    return {
      isActive: override.isActive ?? combo.isActive,
      message: `Combo ${override.isActive ? 'activated' : 'deactivated'} for this branch`,
    };
  }

  /* ---------- Branch menu groups ---------- */

  static async createBranchMenuGroup(req) {
    const merchantId = req.user.merchant._id.toString();
    const branchId = req.user.branch._id.toString();

    const {
      name,
      description,
      bannerImage,
      visibility = 'always',
      priority = 0,
      timeSlots,
      activeDays,
      blockedDays,
      isAlcoholMenu = false,
      items = [],
    } = req.body;

    assertBranchMenuGroupName(name);

    if (items.length > 0) {
      const itemIds = items.map(i => i.menuItemId).filter(Boolean);
      const validCount = await MenuRepository.countMenus({
        _id: { $in: itemIds },
        merchant: merchantId,
      });

      if (validCount !== itemIds.length) {
        throw new AppError('One or more menu items do not belong to your restaurant', 403);
      }
    }

    const menuGroup = await MenuRepository.createBranchMenuGroup({
      branch: branchId,
      merchant: merchantId,
      name: name.trim(),
      description,
      bannerImage,
      visibility,
      priority: Number(priority),
      timeSlots,
      activeDays,
      blockedDays,
      isAlcoholMenu,
      items: items.map(item => ({
        menuItem: item.menuItemId,
        sortOrder: item.sortOrder ?? Date.now(),
        overridePrice: item.overridePrice ?? null,
        customName: item.customName?.trim() || null,
        customDescription: item.customDescription?.trim() || null,
        isHidden: !!item.isHidden,
      })),
    });

    await menuGroup.populate({
      path: 'items.menuItem',
      select: 'name image price variants type isVeg isSpicy isAlcoholic prepTime',
    });

    return menuGroup;
  }

  static async getAllBranchMenuGroups(req) {
    const merchantId = req.user.merchant._id.toString();
    const branchId = req.user.branch._id.toString();

    // Base query with merchant and branch scoping (NEVER from req.query)
    const baseQuery = MenuRepository.findBranchMenuGroups({
      branch: branchId,
      merchant: merchantId,
    }).populate({
      path: 'items.menuItem',
      select: 'name image price variants type isVeg isSpicy isAlcoholic prepTime tags',
    });

    // Apply ApiFeatures for search, filter, sort, fields, pagination
    const features = new ApiFeatures(baseQuery, req.query)
      .search(['name', 'description'])
      .filter()
      .sort()
      .limitFields()
      .paginate();

    return await features.query;
  }

  static async getBranchMenuGroup(req) {
    const merchantId = req.user.merchant._id.toString();
    const branchId = req.user.branch._id.toString();

    const group = await MenuRepository.findBranchMenuGroupOne({
      _id: req.params.id,
      branch: branchId,
      merchant: merchantId,
    }).populate({
      path: 'items.menuItem',
      select: 'name image price variants type isVeg isSpicy isAlcoholic prepTime',
    });

    if (!group) {
      throw new AppError('Menu group not found or you do not have access', 404);
    }

    return group;
  }

  static async updateBranchMenuGroup(req) {
    const merchantId = req.user.merchant._id.toString();
    const branchId = req.user.branch._id.toString();

    const allowedUpdates = {
      name: req.body.name?.trim(),
      description: req.body.description,
      bannerImage: req.body.bannerImage,
      visibility: req.body.visibility,
      priority: Number(req.body.priority),
      timeSlots: req.body.timeSlots,
      activeDays: req.body.activeDays,
      blockedDays: req.body.blockedDays,
      isAlcoholMenu: req.body.isAlcoholMenu,
    };

    const group = await MenuRepository.findOneAndUpdateBranchMenuGroup(
      { _id: req.params.id, branch: branchId, merchant: merchantId },
      allowedUpdates,
      { new: true, runValidators: true }
    );

    if (!group) {
      throw new AppError('Menu group not found or unauthorized', 404);
    }

    await group.populate('items.menuItem');
    return group;
  }

  static async deleteBranchMenuGroup(req) {
    const merchantId = req.user.merchant._id.toString();
    const branchId = req.user.branch._id.toString();

    const group = await MenuRepository.findOneAndDeleteBranchMenuGroup({
      _id: req.params.id,
      branch: branchId,
      merchant: merchantId,
      isSystemDefault: false,
    });

    if (!group) {
      throw new AppError('Menu group not found, unauthorized, or is system default', 404);
    }

    return group;
  }

  static async addItemToBranchMenuGroup(req) {
    const merchantId = req.user.merchant._id.toString();
    const branchId = req.user.branch._id.toString();
    const { menuItemId, overridePrice, customName } = req.body;

    if (!menuItemId) throw new AppError('menuItemId is required', 400);

    const menuItem = await MenuRepository.findMenuOne({
      _id: menuItemId,
      merchant: merchantId,
    });
    if (!menuItem) throw new AppError('Menu item not found or unauthorized', 404);

    const group = await MenuRepository.findOneAndUpdateBranchMenuGroup(
      { _id: req.params.id, branch: branchId, merchant: merchantId },
      {
        $push: {
          items: {
            $each: [
              {
                menuItem: menuItemId,
                sortOrder: Date.now(),
                overridePrice: overridePrice ?? null,
                customName: customName?.trim() || null,
                isHidden: false,
              },
            ],
            $position: 0,
          },
        },
      },
      { new: true }
    ).populate('items.menuItem');

    if (!group) throw new AppError('Menu group not found', 404);
    return group;
  }

  static async removeItemFromBranchMenuGroup(req) {
    const merchantId = req.user.merchant._id.toString();
    const branchId = req.user.branch._id.toString();
    const { menuItemId } = req.body;

    const group = await MenuRepository.findOneAndUpdateBranchMenuGroup(
      { _id: req.params.id, branch: branchId, merchant: merchantId },
      { $pull: { items: { menuItem: menuItemId } } },
      { new: true }
    ).populate('items.menuItem');

    if (!group) throw new AppError('Menu group not found', 404);
    return group;
  }

  static async reorderBranchMenuGroupItems(req) {
    const merchantId = req.user.merchant._id.toString();
    const branchId = req.user.branch._id.toString();
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('Items array is required', 400);
    }

    const group = await MenuRepository.findBranchMenuGroupOne({
      _id: req.params.id,
      branch: branchId,
      merchant: merchantId,
    });

    if (!group) throw new AppError('Menu group not found', 404);

    const orderMap = new Map(items.map(i => [i.menuItemId, i.sortOrder]));

    group.items.forEach(item => {
      const newOrder = orderMap.get(item.menuItem.toString());
      if (newOrder !== undefined) item.sortOrder = newOrder;
    });

    await group.save();
    await group.populate('items.menuItem');
    return group;
  }
}

module.exports = { MenuService };
