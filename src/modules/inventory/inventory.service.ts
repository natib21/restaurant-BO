/**
 * Re-exports legacy InventoryService during migration.
 * Future: move implementation here from services/InventoryService.js
 */
const LegacyInventoryService = require('../../../services/InventoryService');

export class InventoryService extends LegacyInventoryService {}

module.exports = { InventoryService: LegacyInventoryService };
