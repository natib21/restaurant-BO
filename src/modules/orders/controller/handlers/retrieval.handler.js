/**
 * Order Retrieval Handlers
 * 
 * Handles listing and fetching orders by various filters:
 * - All orders (branch or merchant scoped)
 * - By merchant (all branches)
 * - By branch
 * - By ID
 * 
 * All handlers require JWT + RBAC (staff/merchant scoped).
 */

const catchAsync = require('../../../../utils/catchAsync');
const { OrderService } = require('../../service/OrderService');

/**
 * GET /api/v1/orders (staff)
 * Get all orders for current branch (with pagination, filters)
 * 
 * Query: { page?, limit?, status?, search?, from?, to? }
 * Response: { status, total, page, pages, summary, data: { orders } }
 */
exports.getAllOrders = catchAsync(async (req, res) => {
  const { total, page, pages, summary, orders } = await OrderService.getAllOrders(req);

  res.status(200).json({
    status: 'success',
    total,
    page,
    pages,
    summary,
    data: { orders },
  });
});

/**
 * GET /api/v1/orders/merchant/all (merchant owner)
 * Get all orders across ALL branches (merchant scope)
 * 
 * Query: { page?, limit?, status?, search?, from?, to? }
 * Response: { status, results, total, page, pages, summary, data: { orders } }
 */
exports.getMerchantAllOrders = catchAsync(async (req, res) => {
  const { orders, total, page, pages, summary } = await OrderService.getMerchantAllOrders(req);

  res.status(200).json({
    status: 'success',
    results: orders.length,
    total,
    page,
    pages,
    summary,
    data: { orders },
  });
});

/**
 * GET /api/v1/orders/:id/orders (staff)
 * Get orders for a specific branch (branch scoped)
 * 
 * Params: id (branch ID)
 * Query: { page?, limit?, status?, search? }
 * Response: { status, results, total, page, pages, summary, data: { orders } }
 */
exports.getBranchOrders = catchAsync(async (req, res) => {
  const { orders, total, page, pages, summary } = await OrderService.getBranchOrders(req);

  res.status(200).json({
    status: 'success',
    results: orders.length,
    total,
    page,
    pages,
    summary,
    data: { orders },
  });
});

/**
 * GET /api/v1/orders/:id (staff)
 * Get single order by ID
 * 
 * Params: id (order ID)
 * Response: { status, data: { order } }
 */
exports.getOrderById = catchAsync(async (req, res) => {
  const order = await OrderService.getOrderById(req);

  res.status(200).json({
    status: 'success',
    data: { order },
  });
});
