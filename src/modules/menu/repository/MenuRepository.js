const Menu = require('../../../../models/menuModel');
const MenuGroup = require('../../../../models/menuGroupModel');
const Combo = require('../../../../models/comboModel');
const BranchMenu = require('../../../../models/branchMenuModel');
const BranchMenuGroup = require('../../../../models/branchMenuGroupModel');

/**
 * MongoDB access for menu domain — thin wrappers only (no business rules).
 */
class MenuRepository {
  static getMenuModel() {
    return Menu;
  }

  static findMenus(filter) {
    return Menu.find(filter);
  }

  static findMenuOne(filter) {
    return Menu.findOne(filter);
  }

  static findMenuById(id) {
    return Menu.findById(id);
  }

  static createMenu(doc) {
    return Menu.create(doc);
  }

  static findOneAndUpdateMenu(filter, update, options) {
    return Menu.findOneAndUpdate(filter, update, options);
  }

  static findOneAndDeleteMenu(filter) {
    return Menu.findOneAndDelete(filter);
  }

  static countMenus(filter) {
    return Menu.countDocuments(filter);
  }

  static newMenu(doc) {
    return new Menu(doc);
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

  static findComboById(id) {
    return Combo.findById(id);
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
