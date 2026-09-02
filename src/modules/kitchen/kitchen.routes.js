// src/modules/kitchen/kitchen.routes.js
// ✅ PHASE 1: Kitchen Display System routes
const express = require('express');
const kitchenController = require('./controllers/kitchen.controller');
const { protect ,restrictTo} = require('../../common/guards/auth.guard');


const router = express.Router();

// All routes require authentication
router.use(protect);

// ══════════════════════════════════════════════════════════════════════════
// ALL TICKETS (Cross-Station View)
// ══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/kitchen/tickets
 * Get all tickets with optional filters (stationId, status)
 * Access: kitchen, waiter, admin, superAdmin
 */
router.get(
  '/tickets',
  restrictTo('kitchen', 'waiter', 'admin', 'superAdmin'),
  kitchenController.getAllTickets
);

/**
 * GET /api/v1/kitchen/tickets/history
 * Get completed tickets (history view)
 * Access: kitchen, waiter, admin, superAdmin
 */
router.get(
  '/tickets/history',
  restrictTo('kitchen', 'waiter', 'admin', 'superAdmin'),
  kitchenController.getTicketHistory
);

// ══════════════════════════════════════════════════════════════════════════
// KITCHEN STATIONS MANAGEMENT (CRUD)
// ══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/kitchen/stations
 * Get all kitchen stations for the branch
 * Access: kitchen, waiter, admin, superAdmin
 */
router.get(
  '/stations',
  restrictTo('kitchen', 'waiter', 'admin', 'superAdmin'),
  kitchenController.getAllStations
);

/**
 * POST /api/v1/kitchen/stations
 * Create a new kitchen station
 * Access: admin, superAdmin
 */
router.post(
  '/stations',
  restrictTo('admin', 'superAdmin'),
  kitchenController.createStation
);

/**
 * GET /api/v1/kitchen/stations/:id
 * Get a single kitchen station by ID or code
 * Access: kitchen, waiter, admin, superAdmin
 */
router.get(
  '/stations/:id',
  restrictTo('kitchen', 'waiter', 'admin', 'superAdmin'),
  kitchenController.getStationById
);

/**
 * PATCH /api/v1/kitchen/stations/:id
 * Update a kitchen station
 * Access: admin, superAdmin
 */
router.patch(
  '/stations/:id',
  restrictTo('admin', 'superAdmin'),
  kitchenController.updateStation
);

/**
 * DELETE /api/v1/kitchen/stations/:id
 * Delete (deactivate) a kitchen station
 * Access: admin, superAdmin
 */
router.delete(
  '/stations/:id',
  restrictTo('admin', 'superAdmin'),
  kitchenController.deleteStation
);

// ══════════════════════════════════════════════════════════════════════════
// MENU ITEM → STATION ASSIGNMENT
// ══════════════════════════════════════════════════════════════════════════

/**
 * PATCH /api/v1/kitchen/menu-items/:menuItemId/station
 * Assign or remove kitchen station for a menu item
 * Access: kitchen, admin, superAdmin
 * 
 * Body: { stationId: "65abc123..." } or { stationId: null }
 */
router.patch(
  '/menu-items/:menuItemId/station',
  restrictTo('kitchen', 'admin', 'superAdmin'),
  kitchenController.assignMenuItemStation
);

// ══════════════════════════════════════════════════════════════════════════
// STATION TICKETS (KDS Dashboard)
// ══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/kitchen/stations/:stationId/tickets
 * Get active tickets for a station (accepts station code or ObjectId)
 * Access: kitchen, admin, superAdmin
 */
router.get(
  '/stations/:stationId/tickets',
  restrictTo('kitchen', 'admin', 'superAdmin'),
  kitchenController.getStationTickets
);

// ══════════════════════════════════════════════════════════════════════════
// ORDER TICKETS (Order Detail View)
// ══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/kitchen/orders/:orderId/tickets
 * Get all tickets for an order
 * Access: kitchen, waiter, admin, superAdmin
 */
router.get(
  '/orders/:orderId/tickets',
  restrictTo('kitchen', 'waiter', 'admin', 'superAdmin'),
  kitchenController.getOrderTickets
);

// ══════════════════════════════════════════════════════════════════════════
// TICKET STATUS TRANSITIONS
// ══════════════════════════════════════════════════════════════════════════

/**
 * PATCH /api/v1/kitchen/tickets/:ticketId/status
 * Generic status update (with RBAC checks inside service)
 * Access: kitchen, admin, superAdmin
 */
router.patch(
  '/tickets/:ticketId/status',
  restrictTo('kitchen', 'admin', 'superAdmin'),
  kitchenController.updateTicketStatus
);

/**
 * PATCH /api/v1/kitchen/tickets/:ticketId/accept
 * Option 1: Explicit Accept button (not auto-start)
 * Access: kitchen, admin, superAdmin
 */
router.patch(
  '/tickets/:ticketId/accept',
  restrictTo('kitchen', 'admin', 'superAdmin'),
  kitchenController.acceptTicket
);

/**
 * PATCH /api/v1/kitchen/tickets/:ticketId/start
 * Start working on ticket (in_progress)
 * Access: kitchen, admin, superAdmin
 */
router.patch(
  '/tickets/:ticketId/start',
  restrictTo('kitchen', 'admin', 'superAdmin'),
  kitchenController.startTicket
);

/**
 * PATCH /api/v1/kitchen/tickets/:ticketId/ready
 * Mark ticket as ready
 * Access: kitchen, admin, superAdmin
 */
router.patch(
  '/tickets/:ticketId/ready',
  restrictTo('kitchen', 'admin', 'superAdmin'),
  kitchenController.markTicketReady
);

/**
 * PATCH /api/v1/kitchen/tickets/:ticketId/cancel
 * Cancel ticket
 * Access: kitchen, waiter, admin, superAdmin
 */
router.patch(
  '/tickets/:ticketId/cancel',
  restrictTo('kitchen', 'waiter', 'admin', 'superAdmin'),
  kitchenController.cancelTicket
);

// ══════════════════════════════════════════════════════════════════════════
// TICKET ITEM STATUS (Individual Item Updates)
// ══════════════════════════════════════════════════════════════════════════

/**
 * PATCH /api/v1/kitchen/tickets/:ticketId/item/:itemId
 * Update status of a specific item within a ticket
 * Access: kitchen, admin, superAdmin
 * 
 * Body: { status: 'pending' | 'in_progress' | 'ready' }
 */
router.patch(
  '/tickets/:ticketId/item/:itemId',
  restrictTo('kitchen', 'admin', 'superAdmin'),
  kitchenController.updateTicketItemStatus
);

module.exports = router;
