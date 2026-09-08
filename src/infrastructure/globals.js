/**
 * Global state holder - breaks circular dependency pattern
 * Allows health.routes and other modules to access global state
 * without importing server.js directly
 */

const globalHealth = {
  outboxWorker: null,
  integrityScheduler: null,
  subscriptionScheduler: null,
  stuckTableScheduler: null,
};

module.exports = { globalHealth };
