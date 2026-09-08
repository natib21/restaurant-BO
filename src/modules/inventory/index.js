/**
 * Inventory Module Index
 *
 * Central export point for the inventory module.
 * Exposes the canonical (capitalized) implementation used by OrderService
 * to avoid the split-brain between inventory.service.js and InventoryService.js.
 */

module.exports = {
  InventoryService: require('./service/InventoryService.js').InventoryService,
  InventoryRepository: require('./repository/InventoryRepository.js').InventoryRepository,
  InventoryController: require('./controller/inventory.controller'),
  inventoryValidators: require('./validators/inventory.validator'),
};
