// src/modules/kitchen/controllers/kitchen.controller.js
// ✅ PHASE 1: Kitchen Display System HTTP API
const KitchenTicketService = require('../service/KitchenTicketService');
const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../../utils/appError');
const { resolveStaffBranchId, getMerchantId } = require('../../../common/utils/tenant-scope');

/**
 * GET /api/v1/kitchen/stations
 * Get all kitchen stations for the branch
 */
exports.getAllStations = catchAsync(async (req, res, next) => {
  const branchId = resolveStaffBranchId(req);

  if (!branchId) {
    return next(new AppError('Branch context required', 400));
  }

  const { includeInactive } = req.query;

  const stations = await KitchenTicketService.getAllStations(branchId, {
    includeInactive: includeInactive === 'true',
  });

  res.status(200).json({
    status: 'success',
    results: stations.length,
    data: { stations },
  });
});

/**
 * GET /api/v1/kitchen/stations/:id
 * Get a single kitchen station by ID or code
 */
exports.getStationById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const branchId = resolveStaffBranchId(req);

  if (!branchId) {
    return next(new AppError('Branch context required', 400));
  }

  const station = await KitchenTicketService.getStationById(id, branchId);

  res.status(200).json({
    status: 'success',
    data: { station },
  });
});

/**
 * POST /api/v1/kitchen/stations
 * Create a new kitchen station
 * 
 * Body: { name, code, description?, displayOrder? }
 */
exports.createStation = catchAsync(async (req, res, next) => {
  const branchId = resolveStaffBranchId(req);
  const merchantId = getMerchantId(req);

  if (!branchId || !merchantId) {
    return next(new AppError('Branch and merchant context required', 400));
  }

  const { name, code, description, displayOrder } = req.body;

  if (!name || !code) {
    return next(new AppError('Name and code are required', 400));
  }

  const station = await KitchenTicketService.createStation(
    { name, code, description, displayOrder },
    merchantId,
    branchId
  );

  res.status(201).json({
    status: 'success',
    data: { station },
  });
});

/**
 * PATCH /api/v1/kitchen/stations/:id
 * Update a kitchen station
 * 
 * Body: { name?, code?, description?, displayOrder?, isActive? }
 */
exports.updateStation = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const branchId = resolveStaffBranchId(req);

  if (!branchId) {
    return next(new AppError('Branch context required', 400));
  }

  const { name, code, description, displayOrder, isActive } = req.body;

  const station = await KitchenTicketService.updateStation(
    id,
    { name, code, description, displayOrder, isActive },
    branchId
  );

  res.status(200).json({
    status: 'success',
    data: { station },
  });
});

/**
 * DELETE /api/v1/kitchen/stations/:id
 * Delete (deactivate) a kitchen station
 */
exports.deleteStation = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const branchId = resolveStaffBranchId(req);

  if (!branchId) {
    return next(new AppError('Branch context required', 400));
  }

  const result = await KitchenTicketService.deleteStation(id, branchId);

  res.status(200).json({
    status: 'success',
    data: result,
  });
});

/**
 * PATCH /api/v1/kitchen/menu-items/:menuItemId/station
 * Assign or remove kitchen station for a menu item
 * 
 * Body: { stationId: "65abc123..." } or { stationId: null }
 */
exports.assignMenuItemStation = catchAsync(async (req, res, next) => {
  const { menuItemId } = req.params;
  const { stationId } = req.body;
  
  const branchId = resolveStaffBranchId(req);
  const merchantId = getMerchantId(req);

  if (!branchId || !merchantId) {
    return next(new AppError('Branch and merchant context required', 400));
  }

  const result = await KitchenTicketService.assignMenuItemStation(
    menuItemId,
    stationId,
    merchantId,
    branchId
  );

  res.status(200).json({
    status: 'success',
    data: result,
  });
});

/**
 * GET /api/v1/kitchen/stations/:stationId/tickets
 * Get active tickets for a station (KDS dashboard)
 * 
 * Query params:
 * - includeCompleted: 'true' to include completed tickets (default: false - active board only)
 */
exports.getStationTickets = catchAsync(async (req, res, next) => {
  const { stationId } = req.params;
  const { includeCompleted = 'false' } = req.query;
  const branchId = resolveStaffBranchId(req);

  if (!branchId) {
    return next(new AppError('Branch context required', 400));
  }

  // ✅ Active board: exclude completed tickets by default
  const tickets = await KitchenTicketService.getActiveTickets(stationId, branchId, {
    includeCompleted: includeCompleted === 'true',
  });

  res.status(200).json({
    status: 'success',
    results: tickets.length,
    data: { tickets },
  });
});

/**
 * GET /api/v1/kitchen/tickets/history
 * Get completed tickets (history view)
 * 
 * Query params:
 * - stationId: filter by station (optional)
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 */
exports.getTicketHistory = catchAsync(async (req, res, next) => {
  const { stationId, startDate, endDate } = req.query;
  const branchId = resolveStaffBranchId(req);
  const merchantId = getMerchantId(req);

  if (!branchId || !merchantId) {
    return next(new AppError('Branch and merchant context required', 400));
  }

  const tickets = await KitchenTicketService.getTicketHistory(branchId, merchantId, {
    stationId,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  });

  res.status(200).json({
    status: 'success',
    results: tickets.length,
    data: { tickets },
  });
});

/**
 * GET /api/v1/kitchen/tickets
 * Get all tickets with optional filters (cross-station view)
 */
exports.getAllTickets = catchAsync(async (req, res, next) => {
  const branchId = resolveStaffBranchId(req);
  const { stationId, status } = req.query;

  if (!branchId) {
    return next(new AppError('Branch context required', 400));
  }

  const tickets = await KitchenTicketService.getAllTickets(branchId, {
    stationId,
    status,
  });

  res.status(200).json({
    status: 'success',
    results: tickets.length,
    data: { tickets },
  });
});

/**
 * GET /api/v1/kitchen/orders/:orderId/tickets
 * Get all tickets for an order
 */
exports.getOrderTickets = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;

  const tickets = await KitchenTicketService.getTicketsForOrder(orderId);

  res.status(200).json({
    status: 'success',
    results: tickets.length,
    data: { tickets },
  });
});

/**
 * PATCH /api/v1/kitchen/tickets/:ticketId/status
 * Update ticket status (with RBAC guards)
 * 
 * Body: { status: 'accepted' | 'in_progress' | 'ready' | 'canceled', reason?: string }
 */
exports.updateTicketStatus = catchAsync(async (req, res, next) => {
  const { ticketId } = req.params;
  const { status, reason } = req.body;

  if (!status) {
    return next(new AppError('Status is required', 400));
  }

  const validStatuses = ['accepted', 'in_progress', 'ready', 'canceled'];
  if (!validStatuses.includes(status)) {
    return next(new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400));
  }

  const result = await KitchenTicketService.transitionTicketStatus(
    ticketId,
    status,
    req.user,
    { reason }
  );

  res.status(200).json({
    status: 'success',
    data: {
      ticket: result.ticket,
      previousStatus: result.previousStatus,
      noop: result.noop,
    },
  });
});

/**
 * PATCH /api/v1/kitchen/tickets/:ticketId/accept
 * Accept a ticket (Option 1: Explicit button - syntactic sugar for status update)
 */
exports.acceptTicket = catchAsync(async (req, res, next) => {
  const { ticketId } = req.params;

  const result = await KitchenTicketService.transitionTicketStatus(
    ticketId,
    'accepted',
    req.user
  );

  res.status(200).json({
    status: 'success',
    data: {
      ticket: result.ticket,
      message: 'Ticket accepted successfully',
    },
  });
});

/**
 * PATCH /api/v1/kitchen/tickets/:ticketId/start
 * Start working on a ticket (transition to in_progress)
 */
exports.startTicket = catchAsync(async (req, res, next) => {
  const { ticketId } = req.params;

  const result = await KitchenTicketService.transitionTicketStatus(
    ticketId,
    'in_progress',
    req.user
  );

  res.status(200).json({
    status: 'success',
    data: {
      ticket: result.ticket,
      message: 'Ticket started successfully',
    },
  });
});

/**
 * PATCH /api/v1/kitchen/tickets/:ticketId/ready
 * Mark ticket as ready
 */
exports.markTicketReady = catchAsync(async (req, res, next) => {
  const { ticketId } = req.params;

  const result = await KitchenTicketService.transitionTicketStatus(
    ticketId,
    'ready',
    req.user
  );

  res.status(200).json({
    status: 'success',
    data: {
      ticket: result.ticket,
      message: 'Ticket marked as ready',
    },
  });
});

/**
 * PATCH /api/v1/kitchen/tickets/:ticketId/cancel
 * Cancel a ticket
 */
exports.cancelTicket = catchAsync(async (req, res, next) => {
  const { ticketId } = req.params;
  const { reason } = req.body;

  const result = await KitchenTicketService.transitionTicketStatus(
    ticketId,
    'canceled',
    req.user,
    { reason }
  );

  res.status(200).json({
    status: 'success',
    data: {
      ticket: result.ticket,
      message: 'Ticket canceled successfully',
    },
  });
});

/**
 * PATCH /api/v1/kitchen/tickets/:ticketId/item/:itemId
 * Update status of a specific item within a ticket
 * Body: { status: 'pending' | 'in_progress' | 'ready' }
 */
exports.updateTicketItemStatus = catchAsync(async (req, res, next) => {
  const { ticketId, itemId } = req.params;
  const { status } = req.body;

  if (!status) {
    return next(new AppError('Status is required', 400));
  }

  const actor = {
    id: req.user._id,
    role: req.user.role?.name || 'unknown',
  };

  const ticket = await KitchenTicketService.updateTicketItemStatus(
    ticketId,
    itemId,
    status,
    actor
  );

  res.status(200).json({
    status: 'success',
    data: { ticket },
  });
});
