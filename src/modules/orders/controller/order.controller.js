const AppError = require('../../../../utils/appError');
const catchAsync = require('../../../../utils/catchAsync');
const multer = require('multer');
const sharp = require('sharp');
const { getMerchantId, getBranchId } = require('../../../common/utils/tenant-scope');
const { OrderService } = require('../service/OrderService');
const { OrderTransactionService } = require('../order-transaction.service');
const { IdempotencyService } = require('../idempotency.service');
const { formatOrderByNumberPayload } = require('../dto/order-response.dto');

const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

exports.uploadOrderPaymentPhoto = upload.single('image');

exports.resizeOrderPaymentPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  const merchantId = OrderService.getMerchantId(req);
  const itemName = (req.body.name || 'item').replace(/\s+/g, '_').toLowerCase();
  const filename = `orderPayment-${merchantId}-${itemName}-${Date.now()}.jpeg`;

  await sharp(req.file.buffer)
    .resize(800, 800, { fit: 'cover', position: 'center' })
    .toFormat('jpeg')
    .jpeg({ quality: 92 })
    .toFile(`uploads/img/orderPayment/${filename}`);

  req.body.image = filename;
  next();
});

exports.placeOrder = catchAsync(async (req, res, next) => {
  const { items } = req.body;
  const { tableId, customerId } = req;

  const merchantId = getMerchantId(req);
  const branchId = getBranchId(req) ?? req.tableSession?.branch;

  if (!branchId) {
    return next(new AppError('Branch context is required', 400));
  }

  const idempotencyKey = IdempotencyService.normalizeKey(req.get('Idempotency-Key'));

  const { order, replayed } = await OrderTransactionService.executePlaceOrder({
    merchantId,
    branchId,
    tableId,
    customerId,
    customer: req.customer,
    customerName: req.customer?.fullName || 'Guest',
    customerPhone: req.customer?.phone || null,
    items,
    performedBy: req.user?._id || null,
    idempotencyKey,
  });

  if (replayed) {
    res.set('Idempotent-Replayed', 'true');
  }

  res.status(201).json({
    status: 'success',
    message: `Order ${order.orderNumber} sent to kitchen!`,
    data: {
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: order.totalAmount,
        placedAt: order.placedAt,
      },
    },
  });
});

exports.staffPlaceOrder = catchAsync(async (req, res) => {
  const order = await OrderService.staffPlaceOrder(req);

  res.status(201).json({
    status: 'success',
    message: `Order ${order.orderNumber} placed successfully!`,
    data: {
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        status: order.status,
        totalAmount: order.totalAmount,
        tableNumber: order.tableNumber,
        customerName: order.customerName,
        location: order.location,
        placedAt: order.placedAt,
        items: order.items,
      },
    },
  });
});

exports.getMyActiveOrder = catchAsync(async (req, res) => {
  const ordersWithImages = await OrderService.getMyActiveOrder(req);

  res.status(200).json({
    status: 'success',
    results: ordersWithImages.length,
    data: { orders: ordersWithImages },
  });
});

exports.getActiveOrders = catchAsync(async (req, res) => {
  const ordersWithImages = await OrderService.getActiveOrders(req);

  res.status(200).json({
    status: 'success',
    results: ordersWithImages.length,
    data: { orders: ordersWithImages },
  });
});

exports.updateOrderStatus = catchAsync(async (req, res) => {
  const { order, noop } = await OrderService.updateOrderStatus(req);
  const { status } = req.body;

  res.status(200).json({
    status: 'success',
    message: noop ? `Order already in status ${status}` : `Order updated to ${status}`,
    data: { order },
  });
});

exports.markAsPaid = catchAsync(async (req, res) => {
  const order = await OrderService.markAsPaid(req);

  res.status(200).json({
    status: 'success',
    message: 'Payment confirmed!',
    data: { order },
  });
});

exports.getMyOrderHistory = catchAsync(async (req, res) => {
  const ordersWithImages = await OrderService.getMyOrderHistory(req);

  res.status(200).json({
    status: 'success',
    results: ordersWithImages.length,
    data: { orders: ordersWithImages },
  });
});

exports.getOrderByNumber = catchAsync(async (req, res) => {
  const order = await OrderService.getOrderByNumber(req);

  res.status(200).json({
    status: 'success',
    data: {
      order: formatOrderByNumberPayload(order),
    },
  });
});

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

const createStatusEndpoint = status =>
  catchAsync(async (req, res) => {
    const orders = await OrderService.getOrdersByStatus(req, status);
    res.status(200).json({
      status: 'success',
      count: orders.length,
      data: { orders },
    });
  });

exports.getPendingOrders = createStatusEndpoint('pending');
exports.getAcceptedOrders = createStatusEndpoint('accepted');
exports.getPreparingOrders = createStatusEndpoint('preparing');
exports.getReadyOrders = createStatusEndpoint('ready');
exports.getServedOrders = createStatusEndpoint('served');
exports.getCanceledOrders = createStatusEndpoint('canceled');

exports.getCompletedOrders = catchAsync(async (req, res) => {
  const { orders, summary } = await OrderService.getCompletedOrders(req);

  res.status(200).json({
    status: 'success',
    count: orders.length,
    summary,
    data: { orders },
  });
});

exports.mergeOrders = catchAsync(async (req, res) => {
  const targetOrder = await OrderService.mergeOrders(req);

  res.status(200).json({
    status: 'success',
    message: `Orders successfully merged into ${targetOrder.orderNumber}`,
    data: { order: targetOrder },
  });
});

exports.cancelOrder = catchAsync(async (req, res) => {
  const { order, alreadyCanceled } = await OrderService.cancelOrder(req);

  if (alreadyCanceled) {
    return res.status(200).json({
      status: 'success',
      message: `Order ${order.orderNumber} already canceled`,
      data: { order },
    });
  }

  res.status(200).json({
    status: 'success',
    message: `Order ${order.orderNumber} successfully canceled`,
    data: { order },
  });
});

exports.addItemToOrder = catchAsync(async (req, res) => {
  const order = await OrderService.addItemToOrder(req);

  res.status(200).json({
    status: 'success',
    message: `Item(s) added to order ${order.orderNumber}`,
    data: { order },
  });
});

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

exports.getOrderById = catchAsync(async (req, res) => {
  const order = await OrderService.getOrderById(req);

  res.status(200).json({
    status: 'success',
    data: { order },
  });
});
