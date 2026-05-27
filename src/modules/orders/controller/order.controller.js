/**
 * Orders Controller (Modular Architecture)
 * 
 * Aggregator that re-exports handlers from the handlers/ directory.
 * Each handler is organized by concern (placement, status, mutations, retrieval, customer).
 * 
 * Structure:
 * ├── handlers/
 * │   ├── placement.handler.js  — Order creation (customer + staff)
 * │   ├── status.handler.js     — Status queries and transitions
 * │   ├── mutation.handler.js   — Order modifications (add items, cancel, merge)
 * │   ├── retrieval.handler.js  — List and fetch operations
 * │   ├── customer.handler.js   — Customer-specific operations
 * │   └── index.js              — Centralized re-exports
 * └── order.controller.js       — This file (aggregator only)
 */

// Re-export all handlers from the handlers directory
module.exports = require('./handlers');
