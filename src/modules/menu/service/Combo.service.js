/**
 * @file src/modules/menu/service/Combo.service.js
 * @description Business logic for combo management
 */

const ComboRepository = require('../repository/Combo.repository');
const MenuItemRepository = require('../repository/MenuItem.repository');
const AppError = require('../../../../utils/appError');
const ApiFeatures = require('../../../../utils/apiFeatures');
const { normalizeName, normalizeDescription, getMenuName } = require('../../../../utils/localization-helper');

class ComboService {
  static async getAll(req) {
    const merchantId = req.user?.merchant?._id || req.user?.merchant;
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const baseQuery = ComboRepository.findAll(merchantId, {}, false);
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
    
    const combo = await ComboRepository.findById(id, merchantId, false);
    if (!combo) throw new AppError('Combo not found', 404);
    
    return combo;
  }

  static async getActive(merchantId, branchId = null) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    if (branchId) {
      return ComboRepository.findByBranch(merchantId, branchId, { isActive: true });
    }
    
    return ComboRepository.findActive(merchantId);
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
    
    // Validate and enrich combo items
    if (!data.items || data.items.length === 0) {
      throw new AppError('Combo must have at least one item', 400);
    }
    
    data.items = await this.enrichComboItems(data.items, merchantId);
    
    // Validate pricing
    if (!data.comboPrice || data.comboPrice <= 0) {
      throw new AppError('Combo price must be greater than zero', 400);
    }
    
    return ComboRepository.create({
      ...data,
      merchant: merchantId,
      createdBy: userId,
      updatedBy: userId
    });
  }

  static async update(id, data, merchantId, userId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const combo = await ComboRepository.findById(id, merchantId, false);
    if (!combo) throw new AppError('Combo not found', 404);
    
    if (data.name) data.name = normalizeName(data.name);
    if (data.description !== undefined) {
      data.description = normalizeDescription(data.description);
    }
    
    // Validate and enrich items if provided
    if (data.items) {
      data.items = await this.enrichComboItems(data.items, merchantId);
    }
    
    data.updatedBy = userId;
    
    return ComboRepository.updateById(id, merchantId, data);
  }

  static async toggleActive(id, merchantId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const combo = await ComboRepository.findById(id, merchantId, false);
    if (!combo) throw new AppError('Combo not found', 404);
    
    return ComboRepository.toggleActive(id, merchantId);
  }

  static async softDelete(id, merchantId, userId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const combo = await ComboRepository.findById(id, merchantId, false);
    if (!combo) throw new AppError('Combo not found', 404);
    
    return ComboRepository.softDelete(id, merchantId, userId);
  }

  static async restore(id, merchantId) {
    if (!merchantId) throw new AppError('Merchant ID is required', 400);
    
    const combo = await ComboRepository.findById(id, merchantId, true);
    if (!combo) throw new AppError('Combo not found', 404);
    if (!combo.deletedAt) throw new AppError('Combo is not deleted', 400);
    
    return ComboRepository.restore(id, merchantId);
  }

  /**
   * Enrich combo items with menu item names and validate
   * 
   * @param {Array} items - Array of { menuItem, quantity }
   * @param {ObjectId} merchantId - Merchant ID
   * @returns {Promise<Array>} - Enriched items with nameFallback
   */
  static async enrichComboItems(items, merchantId) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('Combo must have at least one item', 400);
    }

    const menuIds = [...new Set(items.map(i => i.menuItem))];
    const menus = await MenuItemRepository.findByIds(menuIds, merchantId);

    if (menus.length !== menuIds.length) {
      throw new AppError('One or more menu items not found', 404);
    }

    const menuMap = Object.fromEntries(
      menus.map(m => [m._id.toString(), getMenuName(m)])
    );

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
}

module.exports = ComboService;
