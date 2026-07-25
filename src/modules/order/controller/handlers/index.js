
/**
 * Order Handlers Index
 * 
 * Re-exports all handler modules for organized access.
 * This enables clean imports in the controller and router.
 */

// Customer operations (table session based)
const customerHandlers = require('./customer.handler');

// Order creation (customer + staff)
const placementHandlers = require('./placement.handler');

// Status queries and transitions
const statusHandlers = require('./status.handler');

// Order mutations (add items, cancel, merge)
const mutationHandlers = require('./mutation.handler');

// Listing and fetching operations
const retrievalHandlers = require('./retrieval.handler');

module.exports = {
  // Customer handlers
  ...customerHandlers,
  
  // Placement handlers
  ...placementHandlers,
  
  // Status handlers
  ...statusHandlers,
  
  // Mutation handlers
  ...mutationHandlers,
  
  // Retrieval handlers
  ...retrievalHandlers,
};
