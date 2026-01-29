// controllers/orderController.js
const Order = require('../models/orderModel');
const MenuItem = require('../models/menuModel');
const Customer = require('../models/customerModule');
const Table = require('../models/tabelModel');
const CustomerSession = require('../models/customerSessionModule');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { getIo } = require('../socket');
const mongoose = require('mongoose');
const multer = require('multer');
const sharp = require('sharp');
const ApiFeatures = require('../utils/apiFeatures');
// ====================================================
//  HELPER: Multi-tenant scoped query
// ====================================================
const merchantScopedQuery = (query = {}, req) => ({
  ...query,
  merchant: req.user.merchant._id,
});

const attachPaymentImage = (order, req) => {
  if (!order?.paymentDetails?.receiptImage) return order;

  return {
    ...order,
    paymentDetails: {
      ...order.paymentDetails,
      receiptImage: `${req.protocol}://${req.get('host')}/img/orderPayment/${order.paymentDetails.receiptImage}`,
    },
  };
};
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

exports.uploadOrderPaymentPhoto = upload.single('image');

/* ===================================================================
   2. IMAGE PROCESSING: Resize & save uploaded image
   =================================================================== */

exports.resizeOrderPaymentPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  const merchantId = req.user.id; // merchant login
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

// ====================================================
//  HELPER: Build Order Items (fully multi-tenant safe)
// ====================================================
const buildOrderItems = async (items, merchantId) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new AppError('Order must contain at least one item', 400);
  }

  let subtotal = 0;
  const orderItems = [];

  for (const item of items) {
    if (!item.menuItemId) {
      throw new AppError('Each item must have "menuItem" field (ObjectId)', 400);
    }
    const menuItem = await MenuItem.findOne({
      _id: item.menuItemId,
      merchant: merchantId, // ⛑ multi-tenant protection
      available: true,
    });
    console.log('Item :- ', item, ' merhcant :- ', merchantId);
    if (!menuItem) {
      throw new AppError('Menu item not found or unavailable', 400);
    }

    const quantity = Number(item.quantity) || 1;
    if (quantity < 1) throw new AppError('Quantity must be at least 1', 400);
    const unitPrice = menuItem.price;
    const totalPrice = quantity * unitPrice;

    orderItems.push({
      menuItem: menuItem._id,
      name: menuItem.name,
      quantity,
      unitPrice,
      totalPrice,
      notes: item.notes || '',
    });

    subtotal += totalPrice;
  }

  return { orderItems, subtotal };
};

// order status transitions
const VALID_TRANSITIONS = {
  pending: ['accepted', 'canceled'],
  accepted: ['preparing'],
  preparing: ['ready'],
  ready: ['served'],
  served: ['completed'],
};
// ====================================================
//  REUSABLE: Get orders by status + optional filters
// ====================================================
const getOrdersByStatus = async (req, statusArray, extraFilter = {}) => {
  const merchantId = req.merchant._id;

  return await Order.find({
    merchant: merchantId,
    status: { $in: statusArray },
    ...extraFilter,
  })
    .populate('table', 'tableNumber')
    .populate('assignedWaiter', 'fullName')
    .populate('assignedKitchenStaff', 'fullName')
    .select(
      'orderNumber status tableNumber totalAmount placedAt readyAt items assignedWaiter assignedKitchenStaff'
    )
    .sort({ placedAt: 1 })
    .lean()
    .then(orders =>
      orders.map(order => ({
        ...order,
        itemCount: order.items.reduce((s, i) => s + i.quantity, 0),
        elapsed: formatElapsed(order.placedAt),
        urgency: getUrgency(order.placedAt),
      }))
    );
};

// Helper: "12 min ago"
const formatElapsed = date => {
  const mins = Math.floor((Date.now() - new Date(date)) / 60000);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60}m`;
};

// Helper: red/orange/green
const getUrgency = date => {
  const mins = Math.floor((Date.now() - new Date(date)) / 60000);
  if (mins > 25) return 'high';
  if (mins > 15) return 'medium';
  return 'low';
};

// Summary for completed
const calculateSummary = orders => ({
  totalOrders: orders.length,
  totalRevenue: orders.reduce((s, o) => s + o.totalAmount, 0),
  avgOrderValue: orders.length
    ? Math.round(orders.reduce((s, o) => s + o.totalAmount, 0) / orders.length)
    : 0,
});
// ====================================================
//  1. PLACE ORDER (Customer)
// ====================================================
exports.placeOrder = catchAsync(async (req, res, next) => {
  const { items } = req.body;
  const { tableId, customerId } = req;

  // Verify table belongs to this merchant
  const table = await Table.findOne(merchantScopedQuery({ _id: tableId }, req));
  if (!table) return next(new AppError('Table not found', 404));

  // Build safe items
  const { orderItems, subtotal } = await buildOrderItems(
    items,
    req.merchantId // pass merchantId FIXED 🔥
  );

  const totalAmount = subtotal;

  const order = await Order.create({
    merchant: req.merchantId,
    branch: req.branchId,
    customer: customerId,
    customerName: req.customer?.fullName || 'Guest',
    customerPhone: req.customer?.phone || null,
    table: tableId,
    tableNumber: table.tableNumber,
    orderType: 'dine_in',
    items: orderItems,
    subtotal,
    totalAmount,
    paymentStatus: 'unpaid',
    placedAt: new Date(),
  });

  // update customer stats
  if (req.customer) {
    req.customer.stats.totalOrders += 1;
    req.customer.stats.totalSpent += totalAmount;
    req.customer.stats.lastOrderAt = new Date();

    req.customer.history.push({
      action: 'place_order',
      details: `Placed order ${order.orderNumber}`,
      order: order._id,
      addedAt: new Date(),
    });

    await req.customer.save({ validateBeforeSave: false });
  }
  const io = getIo();

  io.emit('new-order', {
    orderId: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    tableNumber: table.tableNumber,
    totalAmount: order.totalAmount,
    placedAt: order.placedAt,
    items: orderItems,
  });
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

// ====================================================
//  1B. STAFF PLACE ORDER (Waiter/Cashier creates order)
// ====================================================
exports.staffPlaceOrder = catchAsync(async (req, res, next) => {
  const {
    items,
    tableId,
    orderType,
    customerName,
    customerPhone,
    subtotal,
    notes,
    branchId,
    location,
  } = req.body;
  console.log(req.body);
  if (!orderType || !['dine_in', 'takeaway', 'delivery'].includes(orderType)) {
    return next(new AppError('Valid orderType is required (dine_in, takeaway, delivery)', 400));
  }

  if (orderType === 'dine_in' && !tableId) {
    return next(new AppError('tableId is required for dine-in orders', 400));
  }

  // For dine-in: validate table belongs to merchant
  let tableNumber = null;
  if (orderType === 'dine_in') {
    const table = await Table.find({ branch: branchId, _id: tableId });
    if (!table) return next(new AppError('Table not found', 404));
    // if (table.status !== 'available') {
    //   return next(new AppError('Table is not available', 400));
    // }
    tableNumber = table.tableNumber;
  }
  const totalAmount = subtotal;

  const order = new Order({
    merchant: req.user.merchant._id,
    branch: branchId,
    customerName: customerName || 'Walk-in Customer',
    customerPhone: customerPhone || null,
    table: orderType === 'dine_in' ? tableId : null,
    tableNumber: orderType === 'dine_in' ? tableNumber : null,
    orderType,
    items,
    subtotal,
    totalAmount,
    paymentStatus: 'unpaid',
    status: 'pending',
    notes: notes || '',
    location,
    placedBy: req.user._id, // Track who placed it (staff)
  });
  await order.save();

  if (orderType === 'dine_in') {
    await Table.findByIdAndUpdate(tableId, { status: 'occupied' });
  }
  const io = getIo();

  // 1. Broadcast new order to users with ORDER_VIEW or ORDER_MANAGE permissions
  io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:create', {
    orderId: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    tableNumber: order.tableNumber,
    location: order.location,
    totalAmount: order.totalAmount,
    branch: branchId,
    placedAt: order.placedAt,
    items: order.items,
    orderType: order.orderType,
    customerName: order.customerName,
    placedBy: req.user.firstName || 'Staff',
  });

  /*   io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('order:new', {
    ... // same data
  }); */

  // 2. Optional: Send a notification to kitchen staff
  io.to(`branch:${branchId}:perm:KITCHEN_VIEW`).emit('notification', {
    title: 'New Order!',
    message: `Order ${order.orderNumber} placed${tableNumber ? ` - Table ${tableNumber}` : ''}`,
    type: 'info',
    sound: true,
    orderId: order._id,
  });

  // 3. Also send to general branch room (for table sync, etc.)
  io.to(`branch:${branchId}`).emit('order:create', {
    orderNumber: order.orderNumber,
    tableNumber,
    status: 'pending',
  });

  // Respond to client
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

// ====================================================
//  2. GET CUSTOMER ACTIVE ORDER
// ====================================================
exports.getMyActiveOrder = catchAsync(async (req, res) => {
  const order = await Order.findOne(
    merchantScopedQuery(
      {
        customer: req.customerId,
        table: req.tableId,
        status: { $in: ['pending', 'accepted', 'preparing', 'ready', 'served'] },
      },
      req
    )
  )
    .populate('items.menuItem', 'name image')
    .sort('-placedAt');
  const ordersWithImages = order.map(order => attachPaymentImage(order, req));

  res.status(200).json({
    status: 'success',
    results: ordersWithImages.length,
    data: { orders: ordersWithImages },
  });
});

// ===================================================
//  3. STAFF: GET ACTIVE ORDERS
// ===================================================
exports.getActiveOrders = catchAsync(async (req, res) => {
  const orders = await Order.find(
    merchantScopedQuery({ status: ['pending', 'accepted', 'preparing', 'ready'] }, req)
  )
    .populate('table', 'tableNumber')
    .populate('items.menuItem', 'name')
    .sort({ placedAt: 1 });

  const ordersWithImages = orders.map(order => attachPaymentImage(order, req));

  res.status(200).json({
    status: 'success',
    results: ordersWithImages.length,
    data: { orders: ordersWithImages },
  });
});

// ====================================================
//  4. UPDATE ORDER STATUS
// ====================================================
exports.updateOrderStatus = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { status, assignedWaiter, assignedKitchenStaff } = req.body;
  console.log(req.params);
  const order = await Order.findOne(merchantScopedQuery({ _id: id }, req));

  if (!order) return next(new AppError('Order not found', 404));

  if (!VALID_TRANSITIONS[order.status]?.includes(status)) {
    return next(new AppError(`Cannot change from ${order.status} → ${status}`, 400));
  }

  const previousStatus = order.status;

  // Update fields
  order.status = status;
  if (status === 'accepted') order.acceptedAt = new Date();
  if (status === 'ready') order.readyAt = new Date();
  if (status === 'served') order.servedAt = new Date();
  if (status === 'completed') order.completedAt = new Date();

  if (assignedWaiter) order.assignedWaiter = assignedWaiter;
  if (assignedKitchenStaff) order.assignedKitchenStaff = assignedKitchenStaff;

  await order.save();

  // ────────────────────────────────────────────────
  //          SOCKET BROADCAST - IMPROVED
  // ────────────────────────────────────────────────
  const io = getIo();
  const branchId = order.branch.toString();

  const payload = {
    orderId: order._id.toString(),
    orderNumber: order.orderNumber,
    branchId,
    tableNumber: order.tableNumber,
    status: order.status,
    previousStatus,
    updatedAt: new Date().toISOString(),
    assignedWaiter: order.assignedWaiter ? { id: order.assignedWaiter.toString() } : null,
    assignedKitchenStaff: order.assignedKitchenStaff
      ? { id: order.assignedKitchenStaff.toString() }
      : null,
    readyAt: order.readyAt?.toISOString() || null,
    servedAt: order.servedAt?.toISOString() || null,
    completedAt: order.completedAt?.toISOString() || null,
  };

  // 1. Send to users who can view/manage orders
  io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:status-updated', payload);
  io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('order:status-updated', payload);

  // 2. Also useful for kitchen staff
  if (['preparing', 'ready'].includes(status)) {
    io.to(`branch:${branchId}:perm:KITCHEN_VIEW`).emit('order:status-updated', payload);
  }

  // 3. General branch room → good for table overview screens / big dashboard
  io.to(`branch:${branchId}`).emit('order:status-updated', {
    ...payload,
    // lighter version if needed for table view
    itemsCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
  });

  // 4. Optional: very important notification sound for certain transitions
  if (status === 'ready' || status === 'served') {
    io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('notification', {
      title: status === 'ready' ? 'Order Ready!' : 'Order Served',
      message: `Table ${order.tableNumber} — ${order.orderNumber}`,
      type: 'success',
      orderId: order._id.toString(),
      sound: true,
    });
  }

  // Cleanup logic (table / session)
  if (status === 'completed' && order.paymentStatus === 'paid') {
    // ... your existing cleanup code ...
  }

  res.status(200).json({
    status: 'success',
    message: `Order updated to ${status}`,
    data: { order },
  });
});
// ====================================================
//  5. MARK ORDER AS PAID
// ====================================================
exports.markAsPaid = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { paymentMethod, bankName, image } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Find order
    const order = await Order.findOne(merchantScopedQuery({ _id: id }, req)).session(session);

    if (!order) {
      await session.abortTransaction();
      return next(new AppError('Order not found', 404));
    }

    if (order.paymentStatus === 'paid') {
      await session.abortTransaction();
      return next(new AppError('Order already paid', 400));
    }

    // Optional: only allow marking paid after certain status (e.g. served)
    // if (!['served', 'ready'].includes(order.status)) {
    //   await session.abortTransaction();
    //   return next(new AppError('Order must be served before marking as paid', 400));
    // }

    // 2. Mark as paid + record who & how
    order.paymentStatus = 'paid';
    order.paidAt = new Date();
    order.paidBy = req.user._id; // who marked it (staff)
    order.paymentMethod = paymentMethod; // important for reporting later

    order.paymentDetails = {
      method: paymentMethod || 'cash',
      bankName: bankName || null,
      paidAt: new Date(),
      receiptImage: image || null, // This is the filename from req.body.image
    };
    await order.save({ session });

    // 3. Auto-complete if not already done
    let wasCompleted = order.status === 'completed';
    if (!wasCompleted) {
      order.status = 'completed';
      order.completedAt = new Date();
      await order.save({ session });
    }

    // 4. Award loyalty points (if customer)
    if (req.customer) {
      const points = Math.floor(order.totalAmount);
      req.customer.loyalty.points += points;
      req.customer.loyalty.totalPointsEarned += points;

      const tiers = { bronze: 0, silver: 5000, gold: 20000, platinum: 50000 };
      const newTier = Object.keys(tiers)
        .reverse()
        .find(t => req.customer.loyalty.totalPointsEarned >= tiers[t]);

      if (newTier && newTier !== req.customer.loyalty.tier) {
        req.customer.loyalty.tier = newTier;
      }

      req.customer.history.push({
        action: 'award_points',
        details: `Earned ${points} points from order ${order.orderNumber} (${paymentMethod})`,
        order: order._id,
        addedAt: new Date(),
      });

      await req.customer.save({ session, validateBeforeSave: false });
    }

    // 5. Cleanup session & table
    if (order.table) {
      await CustomerSession.updateOne(
        merchantScopedQuery({ tableId: order.table, isActive: true }, req),
        { isActive: false },
        { session }
      );

      const table = await Table.findOne(merchantScopedQuery({ _id: order.table }, req)).session(
        session
      );

      if (table) {
        table.status = 'available';
        await table.save({ session });
      }
    }

    // Commit all changes
    await session.commitTransaction();

    // ────────────────────────────────────────────────
    // SOCKET BROADCAST - targeted
    // ────────────────────────────────────────────────
    const io = getIo();
    const branchId = order.branch.toString();

    const paidPayload = {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      tableNumber: order.tableNumber,
      paymentStatus: 'paid',
      paymentMethod,
      bankName,
      receiptImage: image,
      paidAt: order.paidAt.toISOString(),
      completedAt: order.completedAt?.toISOString(),
      totalAmount: order.totalAmount,
    };

    // Send to relevant branch rooms only (not io.emit!)
    io.to(`branch:${branchId}`).emit('order-paid', paidPayload);

    // Also notify staff who can manage/view
    io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order-paid', paidPayload);
    io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('order-paid', paidPayload);

    // Optional: special notification for cashiers/managers
    io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('notification', {
      title: 'Payment Received',
      message: `Order #${order.orderNumber} – ${paymentMethod.toUpperCase()} – Table ${order.tableNumber || 'Takeaway'}`,
      type: 'success',
      sound: true,
      orderId: order._id.toString(),
    });

    res.status(200).json({
      status: 'success',
      message: 'Payment confirmed!',
      data: { order },
    });
  } catch (err) {
    await session.abortTransaction();
    return next(err);
  } finally {
    session.endSession();
  }
});
// ====================================================
//  6. GET CUSTOMER ORDER HISTORY
// ====================================================
exports.getMyOrderHistory = catchAsync(async (req, res) => {
  const orders = await Order.find(
    merchantScopedQuery(
      {
        customer: req.customerId,
        status: ['completed', 'canceled'],
      },
      req
    )
  )
    .select('orderNumber items totalAmount status placedAt')
    .sort('-placedAt')
    .limit(50);
  const ordersWithImages = orders.map(order => attachPaymentImage(order, req));

  res.status(200).json({
    status: 'success',
    results: orders.length,
    data: { orders: ordersWithImages },
  });
});

// ====================================================
//  7. GET ORDER BY ORDER NUMBER (Customer OR Staff)
// ====================================================
exports.getOrderByNumber = catchAsync(async (req, res, next) => {
  const { orderNumber } = req.params; // e.g. #T5-467 or T5-467 → we normalize

  if (!orderNumber) {
    return next(new AppError('Order number is required', 400));
  }

  // Normalize: accept both "#T5-467" and "T5-467"
  const cleanNumber = orderNumber.trim().toUpperCase().replace(/^#/, '#');

  // Base query: find by orderNumber + merchant
  const baseQuery = merchantScopedQuery({ orderNumber: cleanNumber }, req);

  // Build final query based on role
  let query = Order.findOne(baseQuery);

  // STAFF / ADMIN → can see everything (including deleted/canceled if needed)
  if (req.user || req.isStaff) {
    query = query.select('+isDeleted'); // if you add soft delete later
  }
  // CUSTOMER → can only see their own orders
  else if (req.customerId) {
    query = query.and({ customer: req.customerId });
  }
  // ANONYMOUS TABLE SESSION → allow if table matches
  else if (req.tableId) {
    query = query.and({ table: req.tableId });
  } else {
    return next(new AppError('Unauthorized', 401));
  }

  const order = await query
    .populate('table', 'tableNumber status')
    .populate('items.menuItem', 'name image')
    .populate('assignedWaiter', 'fullName')
    .populate('assignedKitchenStaff', 'fullName')
    .lean(); // faster + cleaner

  if (!order) {
    return next(new AppError('Order not found or access denied', 404));
  }

  // Optional: Hide sensitive fields from customer
  if (!req.user && !req.isStaff) {
    delete order.assignedWaiter;
    delete order.assignedKitchenStaff;
  }

  res.status(200).json({
    status: 'success',
    data: {
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        orderType: order.orderType,
        tableNumber: order.tableNumber,
        customerName: order.customerName,
        totalAmount: order.totalAmount,
        placedAt: order.placedAt,
        acceptedAt: order.acceptedAt,
        readyAt: order.readyAt,
        servedAt: order.servedAt,
        completedAt: order.completedAt,
        items: order.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          notes: item.notes || null,
          image: item.menuItem?.image || null,
        })),
        timeline: {
          placed: order.placedAt,
          accepted: order.acceptedAt,
          ready: order.readyAt,
          served: order.servedAt,
          completed: order.completedAt,
        },
        assigned: {
          waiter: order.assignedWaiter?.fullName || null,
          kitchen: order.assignedKitchenStaff?.fullName || null,
        },
      },
    },
  });
});

// ====================================================
//  8. GET ALL ORDERS (Staff / Admin) — PAGINATED + FILTERS
// ====================================================
exports.getAllOrders = catchAsync(async (req, res, next) => {
  // 1. Build the Initial Base Query Object (Security First)
  let queryObj = { merchant: req.user.merchant._id };

  // 2. Handle Custom Logic (Regex, Dates, Search)
  // We do this manually because ApiFeatures handles exact matches better than complex $or logic
  const { tableNumber, customerPhone, dateFrom, dateTo, search } = req.query;

  if (tableNumber) queryObj.tableNumber = { $regex: tableNumber, $options: 'i' };

  if (customerPhone) {
    queryObj.customerPhone = { $regex: customerPhone.trim(), $options: 'i' };
  }

  if (dateFrom || dateTo) {
    queryObj.placedAt = {};
    if (dateFrom) queryObj.placedAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      queryObj.placedAt.$lte = end;
    }
  }

  if (search) {
    const searchRegex = { $regex: search.trim(), $options: 'i' };
    queryObj.$or = [{ orderNumber: searchRegex }, { customerName: searchRegex }];
  }

  // 3. Execute ApiFeatures
  // We pass the Mongoose Query and the request query string
  // Note: We use Order.find(queryObj) to ensure merchant security is baked in
  const features = new ApiFeatures(Order.find(queryObj), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  // 4. Get Total Count for Pagination (using the filtered queryObj)
  const total = await Order.countDocuments(queryObj);

  // 5. Execute Final Query with Populates
  const orders = await features.query
    .populate('table', 'tableNumber status')
    .populate('customer', 'fullName phone')
    .populate('assignedWaiter', 'fullName')
    .populate('assignedKitchenStaff', 'fullName')
    .lean();

  // 6. Post-processing (Images and Summary)
  const ordersWithSummary = orders.map(order => {
    const withImage = attachPaymentImage(order, req);
    return {
      ...withImage,
      itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
    };
  });

  // 7. Aggregate Stats
  const stats = await Order.aggregate([
    { $match: queryObj },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$totalAmount' },
        totalOrders: { $sum: 1 },
        paidOrders: {
          $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] },
        },
        avgOrderValue: { $avg: '$totalAmount' },
      },
    },
  ]);

  const summary = stats[0] || { totalRevenue: 0, totalOrders: 0, paidOrders: 0, avgOrderValue: 0 };

  // 8. Send Response
  res.status(200).json({
    status: 'success',
    total,
    page: req.query.page * 1 || 1,
    pages: Math.ceil(total / (req.query.limit * 1 || 40)),
    summary: {
      totalRevenue: summary.totalRevenue,
      totalOrders: summary.totalOrders,
      paidOrders: summary.paidOrders,
      avgOrderValue: Math.round(summary.avgOrderValue || 0),
    },
    data: {
      orders: ordersWithSummary,
    },
  });
});
// ====================================================
//  2–8. STATUS ENDPOINTS (ALL REUSE ONE FUNCTION)
// ====================================================
const createStatusEndpoint = status =>
  catchAsync(async (req, res) => {
    const orders = await getOrdersByStatus(req, status);
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
  const orders = await getOrdersByStatus(req, 'completed', { paymentStatus: 'paid' });
  const summary = {
    totalOrders: orders.length,
    totalRevenue: orders.reduce((s, o) => s + o.totalAmount, 0),
    avgOrderValue: orders.length
      ? Math.round(orders.reduce((s, o) => s + o.totalAmount, 0) / orders.length)
      : 0,
  };

  res.status(200).json({
    status: 'success',
    count: orders.length,
    summary,
    data: { orders },
  });
});

// ====================================================
//  9. STAFF: MERGE ORDERS (e.g., combining tables)
// ====================================================
exports.mergeOrders = catchAsync(async (req, res, next) => {
  const { orderIds, targetOrderId } = req.body;
  if (!orderIds || orderIds.length < 1) {
    return next(new AppError('Must provide orders to merge', 400));
  }

  const merchantId = req.merchant._id;

  // 1. Validate Target Order
  const targetOrder = await Order.findOne(
    merchantScopedQuery({ _id: targetOrderId, status: { $ne: 'completed' } }, req)
  );
  if (!targetOrder) return next(new AppError('Target order not found or completed', 404));

  // 2. Find and Validate Source Orders
  const sourceOrders = await Order.find(
    merchantScopedQuery({ _id: { $in: orderIds }, status: { $ne: 'completed' } }, req)
  );

  if (sourceOrders.length !== orderIds.length) {
    return next(new AppError('One or more source orders not found or completed', 404));
  }

  // 3. Perform Merge Logic
  let subtotalIncrease = 0;

  for (const sourceOrder of sourceOrders) {
    // Add items
    targetOrder.items.push(...sourceOrder.items);
    subtotalIncrease += sourceOrder.subtotal;

    // Update order status/notes (optional: track the merge in notes)
    targetOrder.notes = targetOrder.notes || '';
    targetOrder.notes += ` | MERGED FROM ${sourceOrder.orderNumber}`;

    // Mark source order as merged/canceled and delete its customer session
    sourceOrder.status = 'canceled'; // Or 'merged' if you add that status
    sourceOrder.paymentStatus = 'paid'; // To prevent double payment issues, assume paid via target
    sourceOrder.canceledReason = 'Merged into another order';
    await sourceOrder.save({ validateBeforeSave: false });

    // Clean up session for the merged table/customer
    await CustomerSession.updateOne(
      merchantScopedQuery({ tableId: sourceOrder.table, isActive: true }, req),
      { isActive: false }
    );

    const table = await Table.findOne(merchantScopedQuery({ _id: sourceOrder.table }, req));
    if (table) {
      table.status = 'available';
      await table.save({ validateBeforeSave: false });
    }
  }

  // 4. Update Target Order Totals
  targetOrder.subtotal += subtotalIncrease;
  targetOrder.totalAmount = targetOrder.subtotal; // Assuming no tax/discount logic here
  await targetOrder.save();

  res.status(200).json({
    status: 'success',
    message: `Orders successfully merged into ${targetOrder.orderNumber}`,
    data: { order: targetOrder },
  });
});

// ====================================================
//  11. CUSTOMER/STAFF: CANCEL ORDER
// ====================================================
exports.cancelOrder = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;
  const { reason = 'Customer/Staff Cancellation' } = req.body;

  const order = await Order.findOne(merchantScopedQuery({ _id: orderId }, req));

  if (!order) return next(new AppError('Order not found', 404));

  // Only allow cancellation if status is 'pending' or 'accepted' (staff override)
  if (!['pending', 'accepted'].includes(order.status) && !req.isStaff) {
    return next(new AppError(`Order cannot be canceled once it is ${order.status}`, 400));
  }

  if (order.status === 'canceled' || order.status === 'completed') {
    return next(new AppError('Order is already canceled or completed', 400));
  }

  order.status = 'canceled';
  order.canceledAt = new Date();
  order.canceledBy = req.isStaff ? req.user._id : req.customerId; // Track who canceled
  order.canceledReason = reason;

  await order.save();

  // Update customer stats (reduce total orders/spent if it was the last order)
  // This logic is complex, often best handled by background jobs or simpler tracking.
  const io = getIo();
  io.emit('order-canceled', {
    orderId: order._id,
    orderNumber: order.orderNumber,
    canceledBy: order.canceledBy,
    canceledAt: order.canceledAt,
    reason: order.canceledReason,
  });
  res.status(200).json({
    status: 'success',
    message: `Order ${order.orderNumber} successfully canceled`,
    data: { order },
  });
});

// ====================================================
//  10. STAFF/CUSTOMER: ADD ITEM TO EXISTING ORDER
// ====================================================
exports.addItemToOrder = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;
  const { items } = req.body; // Array of { menuItem, quantity, notes }

  const order = await Order.findOne(
    merchantScopedQuery(
      { _id: orderId, status: { $in: ['pending', 'accepted', 'preparing'] } },
      req
    )
  );

  if (!order) {
    return next(new AppError('Active order not found or cannot be modified', 404));
  }

  // NOTE: You'll need to add logic to restrict which status is modifiable (e.g., not 'ready' or 'served').

  // Build safe items using the existing helper
  const { orderItems: newItems, subtotal: newSubtotal } = await buildOrderItems(
    items,
    req.merchant._id
  );

  // Add items to the order and update totals
  order.items.push(...newItems);
  order.subtotal += newSubtotal;
  order.totalAmount = order.subtotal; // Assuming totalAmount = subtotal

  // Optional: Update status to 'pending' if it was 'accepted'/'preparing' to alert kitchen of change
  if (order.status !== 'pending') {
    order.status = 'accepted';
  }

  await order.save();
  const io = getIo();
  io.emit('order-updated', {
    orderId: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    items: order.items,
    totalAmount: order.totalAmount,
  });
  res.status(200).json({
    status: 'success',
    message: `Item(s) added to order ${order.orderNumber}`,
    data: { order },
  });
});

// ====================================================
//  GET SINGLE ORDER BY ID (Staff / Customer / Table Session)
// ====================================================
// ====================================================
//  GET ALL ORDERS FOR MERCHANT (All Branches Combined)
//  For merchant owner / admin dashboard
// ====================================================
exports.getMerchantAllOrders = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id; // Assuming merchant owner has user.merchant

  let queryObj = { merchant: merchantId };

  const {
    status,
    paymentStatus,
    orderType,
    branchId, // Optional: filter by specific branch
    dateFrom,
    dateTo,
    search,
    page = 1,
    limit = 20,
    sort = '-placedAt',
  } = req.query;

  // Optional branch filter
  if (branchId) queryObj.branch = branchId;

  if (status && status !== 'all') queryObj.status = status;
  if (paymentStatus && paymentStatus !== 'all') queryObj.paymentStatus = paymentStatus;
  if (orderType && orderType !== 'all') queryObj.orderType = orderType;

  if (dateFrom || dateTo) {
    queryObj.placedAt = {};
    if (dateFrom) queryObj.placedAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      queryObj.placedAt.$lte = end;
    }
  }

  if (search) {
    const searchRegex = { $regex: search.trim(), $options: 'i' };
    queryObj.$or = [
      { orderNumber: searchRegex },
      { customerName: searchRegex },
      { customerPhone: searchRegex },
    ];
  }

  const total = await Order.countDocuments(queryObj);

  const orders = await Order.find(queryObj)
    .populate('branch', 'name') // Show branch name
    .populate('table', 'tableNumber')
    .populate('customer', 'fullName phone')
    .populate('assignedWaiter', 'fullName')
    .populate('assignedKitchenStaff', 'fullName')
    .select(
      'orderNumber status paymentStatus totalAmount placedAt branch tableNumber customerName orderType items'
    )
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .lean();

  const ordersWithSummary = orders.map(order => {
    const withImage = attachPaymentImage(order, req);

    return {
      ...withImage,
      itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
      branchName: order.branch?.name || 'Unknown',
    };
  });

  // Summary stats
  const stats = await Order.aggregate([
    { $match: queryObj },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$totalAmount' },
        totalOrders: { $sum: 1 },
        paidOrders: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
      },
    },
  ]);

  const summary = stats[0] || { totalRevenue: 0, totalOrders: 0, paidOrders: 0 };

  res.status(200).json({
    status: 'success',
    results: ordersWithSummary.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
    summary: {
      totalRevenue: summary.totalRevenue,
      totalOrders: summary.totalOrders,
      paidOrders: summary.paidOrders,
      avgOrderValue: summary.totalOrders
        ? Math.round(summary.totalRevenue / summary.totalOrders)
        : 0,
    },
    data: { orders: ordersWithSummary },
  });
});

// ====================================================
//  GET ALL ORDERS FOR A SPECIFIC BRANCH
//  For branch managers / staff
// ====================================================
exports.getBranchOrders = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { id: branchId } = req.params;

  if (!branchId) return next(new AppError('branchId is required', 400));

  // 1. Build manual query object for Security
  let queryObj = {
    merchant: merchantId,
    branch: branchId,
  };

  const { dateFrom, dateTo, search, page = 1, limit = 20 } = req.query;

  // Date Logic
  if (dateFrom || dateTo) {
    queryObj.placedAt = {};
    if (dateFrom) queryObj.placedAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      queryObj.placedAt.$lte = end;
    }
  }

  // Search Logic
  if (search) {
    const searchRegex = { $regex: search.trim(), $options: 'i' };
    queryObj.$or = [
      { orderNumber: searchRegex },
      { customerName: searchRegex },
      { customerPhone: searchRegex },
    ];
  }

  // 2. Initialize ApiFeatures
  // We apply populate() to the base query immediately
  const features = new ApiFeatures(
    Order.find(queryObj)
      .populate('branch', 'name')
      .populate('table', 'tableNumber status')
      .populate('customer', 'fullName phone')
      .populate('assignedWaiter', 'fullName'),
    req.query
  )
    .filter()
    .sort()
    .limitFields()
    .paginate();

  // 3. FORCE BRANCH INCLUSION
  // This is the "Magic Fix": It ensures that even if limitFields runs,
  // 'branch' is added back to the selection so populate works.
  features.query = features.query.select('branch table customer');

  // 4. Execute Query
  const orders = await features.query.lean();

  // 5. Summary Stats
  const total = await Order.countDocuments(queryObj);
  const stats = await Order.aggregate([
    { $match: queryObj },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$totalAmount' },
        totalOrders: { $sum: 1 },
        paidOrders: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
        avgOrderValue: { $avg: '$totalAmount' },
      },
    },
  ]);

  const summary = stats[0] || { totalRevenue: 0, totalOrders: 0, paidOrders: 0, avgOrderValue: 0 };

  // 6. Map Data
  const ordersWithItemCount = orders.map(order => {
    const withImage = attachPaymentImage(order, req);
    return {
      ...withImage,
      itemCount: order.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0,
    };
  });

  // 7. Final Response
  res.status(200).json({
    status: 'success',
    results: ordersWithItemCount.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
    summary: {
      totalRevenue: summary.totalRevenue,
      totalOrders: summary.totalOrders,
      paidOrders: summary.paidOrders,
      avgOrderValue: Math.round(summary.avgOrderValue || 0),
    },
    data: {
      orders: ordersWithItemCount,
    },
  });
});

// ====================================================
//  GET SINGLE ORDER BY ID (Staff / Customer / Table)
// ====================================================
exports.getOrderById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  if (!id) {
    return next(new AppError('Order ID is required', 400));
  }

  let order = await Order.findById(id)
    .populate('items.menuItem', 'name price')
    .populate('table', 'tableNumber')
    .populate('assignedWaiter', 'fullName')
    .populate('branch', 'name')
    .populate('assignedKitchenStaff', 'fullName')
    .populate('placedBy', 'firstName lastName')
    .lean();

  if (!order) {
    return next(new AppError('Order not found', 404));
  }
  console.log(order);
  // Attach full URL for payment image if it exists
  if (order.paymentDetails?.receiptImage) {
    order = {
      ...order,
      paymentDetails: {
        ...order.paymentDetails,
        receiptImage: `${req.protocol}://${req.get('host')}/img/orderPayment/${order.paymentDetails.receiptImage}`,
      },
    };
  }

  res.status(200).json({
    status: 'success',
    data: {
      order,
    },
  });
});
