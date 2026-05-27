/**
 * Inventory Module Index
 * 
 * Central export point for the inventory module
 */

module.exports = {
  InventoryService: require('./service/inventory.service').InventoryService,
  InventoryRepository: require('./repository/inventory.repository').InventoryRepository,
  InventoryController: require('./controller/inventory.controller'),
  inventoryValidators: require('./validators/inventory.validator'),
};
