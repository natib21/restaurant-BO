const Branch = require('../../../../models/branchModel');
const Table = require('../../../../models/tabelModel');
const StaffAssignment = require('../../../../models/staffAssignTabelModel');
const CustomerSession = require('../../../../models/customerSessionModule');
const MenuGroup = require('../../menu/model/MenuGroup.model');
const User = require('../../../../models/userModel');

/**
 * MongoDB access for branch + table domain — thin wrappers only (no business rules).
 * 
 * ✅ PHASE 2-1: Added centralized active-resource helpers to enforce soft-delete pattern.
 * Use findActiveBranch(), findActiveBranches(), findActiveTable(), findActiveTables() 
 * instead of generic find methods when querying for resources that should be active.
 */
class BranchRepository {
  static getBranchModel() {
    return Branch;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BRANCH QUERIES — Generic (for admin/restore operations)
  // ══════════════════════════════════════════════════════════════════════════
  
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

  // ══════════════════════════════════════════════════════════════════════════
  // BRANCH QUERIES — Active Resources (enforce soft-delete)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Find active branches matching filter.
   * Automatically enforces isActive: true.
   * Use for all normal branch queries (list, read, update).
   */
  static findActiveBranches(filter = {}) {
    return Branch.find({ ...filter, isActive: true });
  }

  /**
   * Find single active branch matching filter.
   * Automatically enforces isActive: true.
   * Use for all normal branch read/update operations.
   */
  static findActiveBranchOne(filter = {}) {
    return Branch.findOne({ ...filter, isActive: true });
  }

  /**
   * Find active branch by ID.
   * Automatically enforces isActive: true.
   */
  static findActiveBranchById(id) {
    return Branch.findOne({ _id: id, isActive: true });
  }

  /**
   * Update active branch (with transaction support).
   * Automatically enforces isActive: true on read.
   */
  static findOneAndUpdateActiveBranch(filter, update, options) {
    return Branch.findOneAndUpdate({ ...filter, isActive: true }, update, options);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TABLE QUERIES — Generic (for admin/restore operations)
  // ══════════════════════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════════════════════
  // TABLE QUERIES — Active Resources (enforce soft-delete)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Find active tables matching filter.
   * Automatically enforces isActive: true.
   * Use for all normal table queries (list, read, update).
   */
  static findActiveTables(filter = {}) {
    return Table.find({ ...filter, isActive: true });
  }

  /**
   * Find single active table matching filter.
   * Automatically enforces isActive: true.
   * Use for all normal table read/update operations.
   */
  static findActiveTableOne(filter = {}) {
    return Table.findOne({ ...filter, isActive: true });
  }

  /**
   * Find active table by ID.
   * Automatically enforces isActive: true.
   */
  static findActiveTableById(id) {
    return Table.findOne({ _id: id, isActive: true });
  }

  /**
   * Update active table (with transaction support).
   * Automatically enforces isActive: true on read.
   */
  static findOneAndUpdateActiveTable(filter, update, options) {
    return Table.findOneAndUpdate({ ...filter, isActive: true }, update, options);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STAFF ASSIGNMENTS
  // ══════════════════════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════════════════════
  // CUSTOMER SESSIONS
  // ══════════════════════════════════════════════════════════════════════════

  static findCustomerSessionOne(filter) {
    return CustomerSession.findOne(filter);
  }

  static createCustomerSession(doc) {
    return CustomerSession.create(doc);
  }

  static updateCustomerSessionOne(filter, update) {
    return CustomerSession.updateOne(filter, update);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MENU GROUPS
  // ══════════════════════════════════════════════════════════════════════════

  static findMenuGroupOne(filter) {
    return MenuGroup.findOne(filter);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // USERS
  // ══════════════════════════════════════════════════════════════════════════

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
