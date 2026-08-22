const Branch = require('../../../../models/branchModel');
const Table = require('../../../../models/tabelModel');
const StaffAssignment = require('../../../../models/staffAssignTabelModel');
const CustomerSession = require('../../../../models/customerSessionModule');
const MenuGroup = require('../../menu/model/MenuGroup.model');
const User = require('../../../../models/userModel');

/**
 * MongoDB access for branch + table domain — thin wrappers only (no business rules).
 */
class BranchRepository {
  static getBranchModel() {
    return Branch;
  }

  static findBranches(filter) {
    return Branch.find(filter);
  }

  static findBranchOne(filter) {
    return Branch.findOne(filter);
  }

  static findBranchById(id) {
    return Branch.findById(id);
  }

  static createBranch(doc) {
    return Branch.create(doc);
  }

  static findOneAndUpdateBranch(filter, update, options) {
    return Branch.findOneAndUpdate(filter, update, options);
  }

  static updateManyBranches(filter, update) {
    return Branch.updateMany(filter, update);
  }

  static aggregateBranches(pipeline) {
    return Branch.aggregate(pipeline);
  }

  static findTables(filter) {
    return Table.find(filter);
  }

  static findTableOne(filter) {
    return Table.findOne(filter);
  }

  static findTableById(id) {
    return Table.findById(id);
  }

  static createTable(doc) {
    return Table.create(doc);
  }

  static findOneAndUpdateTable(filter, update, options) {
    return Table.findOneAndUpdate(filter, update, options);
  }

  static deleteTableOne(filter) {
    return Table.deleteOne(filter);
  }

  static findStaffAssignments(filter) {
    return StaffAssignment.find(filter);
  }

  static findStaffAssignmentOne(filter) {
    return StaffAssignment.findOne(filter);
  }

  static createStaffAssignment(doc) {
    return StaffAssignment.create(doc);
  }

  static updateManyStaffAssignments(filter, update) {
    return StaffAssignment.updateMany(filter, update);
  }

  static findOneAndUpdateStaffAssignment(filter, update, options) {
    return StaffAssignment.findOneAndUpdate(filter, update, options);
  }

  static findCustomerSessionOne(filter) {
    return CustomerSession.findOne(filter);
  }

  static createCustomerSession(doc) {
    return CustomerSession.create(doc);
  }

  static updateCustomerSessionOne(filter, update) {
    return CustomerSession.updateOne(filter, update);
  }

  static findMenuGroupOne(filter) {
    return MenuGroup.findOne(filter);
  }

  static countUsers(filter) {
    return User.countDocuments(filter);
  }

  static findUsers(filter) {
    return User.find(filter);
  }

  static findUserOne(filter) {
    return User.findOne(filter);
  }
}

module.exports = { BranchRepository };
