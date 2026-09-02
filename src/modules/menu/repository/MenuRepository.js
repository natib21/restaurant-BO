// Use new structured models
const MenuItem = require('../model/MenuItem.model');
const MenuGroup = require('../model/MenuGroup.model');
const Combo = require('../model/Combo.model');
const BranchMenu = require('../../../../models/branchMenuModel');
const BranchMenuGroup = require('../../../../models/branchMenuGroupModel');

/**
 * MongoDB access for menu domain — thin wrappers only (no business rules).
 */
class MenuRepository {
  static getMenuModel() {
    return MenuItem;
  }

  static findMenus(filter) {
    return MenuItem.find(filter);
  }

  static findMenuOne(filter) {
    return MenuItem.findOne(filter);
  }

  /**
   * Find a menu item by ID, scoped to a merchant.
   * Replaces the unscoped `MenuItem.findById(id)` to prevent cross-tenant data access.
   *
   * @param {string} id - Menu item ObjectId
   * @param {ObjectId} merchantId - Merchant ObjectId (required)
   * @returns {Query}
   */
  static findMenuById(id, merchantId) {
    return MenuItem.findOne({ _id: id, merchant: merchantId });
  }

  static createMenu(doc) {
    return MenuItem.create(doc);
  }

  static findOneAndUpdateMenu(filter, update, options) {
    return MenuItem.findOneAndUpdate(filter, update, options);
  }

  static findOneAndDeleteMenu(filter) {
    return MenuItem.findOneAndDelete(filter);
  }

  static countMenus(filter) {
    return MenuItem.countDocuments(filter);
  }

  static newMenu(doc) {
    return new MenuItem(doc);
  }

  static findMenuGroups(filter) {
    return MenuGroup.find(filter);
  }

  static findMenuGroupOne(filter) {
    return MenuGroup.findOne(filter);
  }

  static createMenuGroup(doc) {
    return MenuGroup.create(doc);
  }

  static findOneAndUpdateMenuGroup(filter, update, options) {
    return MenuGroup.findOneAndUpdate(filter, update, options);
  }

  static findOneAndDeleteMenuGroup(filter) {
    return MenuGroup.findOneAndDelete(filter);
  }

  static updateManyMenuGroups(filter, update) {
    return MenuGroup.updateMany(filter, update);
  }

  static findCombos(filter) {
    return Combo.find(filter);
  }

  static findComboOne(filter) {
    return Combo.findOne(filter);
  }

  /**
   * Find a combo by ID, scoped to a merchant.
   * Replaces the unscoped `Combo.findById(id)` to prevent cross-tenant data access.
   *
   * @param {string} id - Combo ObjectId
   * @param {ObjectId} merchantId - Merchant ObjectId (required)
   * @returns {Query}
   */
  static findComboById(id, merchantId) {
    return Combo.findOne({ _id: id, merchant: merchantId });
  }

  static createCombo(doc) {
    return Combo.create(doc);
  }

  static findOneAndDeleteCombo(filter) {
    return Combo.findOneAndDelete(filter);
  }

  static findByIdAndUpdateCombo(id, update, options) {
    return Combo.findByIdAndUpdate(id, update, options);
  }

  static findBranchMenus(filter) {
    return BranchMenu.find(filter);
  }

  static findBranchMenuOne(filter) {
    return BranchMenu.findOne(filter);
  }

  static findBranchMenuGroups(filter) {
    return BranchMenuGroup.find(filter);
  }

  static findBranchMenuGroupOne(filter) {
    return BranchMenuGroup.findOne(filter);
  }

  static createBranchMenuGroup(doc) {
    return BranchMenuGroup.create(doc);
  }

  static findOneAndUpdateBranchMenuGroup(filter, update, options) {
    return BranchMenuGroup.findOneAndUpdate(filter, update, options);
  }

  static findOneAndDeleteBranchMenuGroup(filter) {
    return BranchMenuGroup.findOneAndDelete(filter);
  }
}

module.exports = { MenuRepository };
