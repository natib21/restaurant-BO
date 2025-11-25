// controllers/customerController.js
const jwt = require('jsonwebtoken');
const axios = require('axios');
const Customer = require('../models/customerModule');
const Order = require('../models/orderModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// ====================== LOYALTY CONFIG ======================
const POINTS_PER_BIRR = 1;
const TIERS = { bronze: 0, silver: 5000, gold: 20000, platinum: 50000 };

// ====================== JWT HELPER ======================
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '90d',
  });
};

const createSendToken = (customer, statusCode, res) => {
  const token = signToken(customer._id);
  const cookieOptions = {
    expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  };
  res.cookie('jwt', token, cookieOptions);

  res.status(statusCode).json({
    status: 'success',
    token,
    data: { customer },
  });
};

// ====================== 1. LOGIN / CREATE (Public) → JWT ======================
exports.loginOrCreate = catchAsync(async (req, res, next) => {
  const {
    merchantId,
    fullName,
    phone,
    tableNumber,
    source = 'guest',
    telegramUser,
    facebookToken,
    tiktokToken,
  } = req.body;

  if (!merchantId) return next(new AppError('merchantId is required', 400));

  let customerData = {
    merchant: merchantId,
    fullName: (fullName || 'Guest').trim(),
    phone: phone ? phone.replace(/\s/g, '') : undefined,
    currentTable: tableNumber?.trim(),
    source,
    lastSeen: new Date(),
  };

  let filter = { merchant: merchantId };

  if (source === 'telegram' && telegramUser) {
    const { id, username, first_name, last_name, photo_url } = telegramUser;
    customerData.source = 'telegram';
    customerData.fullName = `${first_name} ${last_name || ''}`.trim();
    customerData.telegram = {
      id: String(id),
      username: username || null,
      firstName: first_name,
      profilePic: photo_url || null,
    };
    filter['telegram.id'] = String(id);
  } else if (source === 'facebook' && facebookToken) {
    try {
      const { data: fb } = await axios.get('https://graph.facebook.com/v20.0/me', {
        params: { fields: 'id,name,picture.type(large)', access_token: facebookToken },
      });
      customerData.source = 'facebook';
      customerData.fullName = fb.name;
      customerData.facebook = { id: fb.id, profilePic: fb.picture?.data?.url || null };
      filter['facebook.id'] = fb.id;
    } catch {
      return next(new AppError('Invalid Facebook token', 401));
    }
  } else if (source === 'tiktok' && tiktokToken) {
    try {
      const { data } = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
        headers: { Authorization: `Bearer ${tiktokToken}` },
        params: { fields: 'open_id,username,avatar_url,display_name' },
      });
      const user = data.data.user;
      customerData.source = 'tiktok';
      customerData.fullName = user.display_name || user.username;
      customerData.tiktok = {
        id: user.open_id,
        username: user.username,
        profilePic: user.avatar_url || null,
      };
      filter['tiktok.id'] = user.open_id;
    } catch {
      return next(new AppError('Invalid TikTok token', 401));
    }
  } else {
    customerData.source = phone ? 'phone' : 'guest';
    if (phone) filter.phone = customerData.phone;
  }

  const customer = await Customer.findOneAndUpdate(filter, customerData, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    runValidators: true,
  });

  createSendToken(customer, 200, res);
});
// ADD THIS AT THE END OF customerController.js
exports.protectCustomer = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(new AppError('You are not logged in. Please login again.', 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const customer = await Customer.findById(decoded.id);
    if (!customer) {
      return next(new AppError('Customer no longer exists', 401));
    }

    req.customer = customer;
    next();
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401));
  }
});
// ====================== CUSTOMER (JWT Required) ======================
exports.getMe = catchAsync(async (req, res, next) => {
  res.status(200).json({
    status: 'success',
    data: { customer: req.customer },
  });
});

exports.updateMe = catchAsync(async (req, res, next) => {
  const { fullName, phone } = req.body;
  const customer = req.customer;

  if (fullName) customer.fullName = fullName.trim();
  if (phone) {
    if (!/^\+?251[79]\d{8}$/.test(phone.replace(/\s/g, ''))) {
      return next(new AppError('Invalid phone number', 400));
    }
    customer.phone = phone.replace(/\s/g, '');
  }

  await customer.save();
  res.status(200).json({ status: 'success', data: { customer } });
});

exports.getMyOrders = catchAsync(async (req, res, next) => {
  const orders = await Order.find({ customer: req.customer._id })
    .select('orderNumber items totalAmount status createdAt table')
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: orders.length,
    data: { orders },
  });
});

exports.claimGift = catchAsync(async (req, res, next) => {
  const { giftId } = req.body;
  const gift = req.customer.loyalty.gifts.id(giftId);
  if (!gift || gift.claimed || (gift.expiresAt && gift.expiresAt < new Date())) {
    return next(new AppError('Invalid or expired gift', 400));
  }
  gift.claimed = true;
  gift.claimedAt = new Date();
  await req.customer.save();
  res.status(200).json({ status: 'success', message: 'Gift claimed!' });
});

// ====================== STAFF / ADMIN CRUD (Full Access) ======================
// Get One Customer (CRM Detail)
exports.getCustomer = catchAsync(async (req, res, next) => {
  const customer = await Customer.findById(req.params.id)
    .populate('loyalty.gifts.menuItem', 'name price image');

  if (!customer || customer.merchant.toString() !== req.merchant._id.toString()) {
    return next(new AppError('Customer not found', 404));
  }

  const stats = await Order.aggregate([
    { $match: { customer: customer._id, status: 'completed' } },
    { $group: { _id: null, totalSpent: { $sum: '$totalAmount' }, visits: { $sum: 1 } } },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      customer,
      stats: stats[0] || { totalSpent: 0, visits: 0 },
    },
  });
});

// Get All Customers (CRM List)
exports.getAllCustomers = catchAsync(async (req, res, next) => {
  const customers = await Customer.find({ merchant: req.merchant._id })
    .select('fullName phone currentTable lastSeen loyalty.tier loyalty.points source createdAt')
    .sort('-lastSeen');

  res.status(200).json({
    status: 'success',
    results: customers.length,
    data: { customers },
  });
});

// Update Customer (Staff)
exports.updateCustomer = catchAsync(async (req, res, next) => {
  const allowed = ['fullName', 'phone', 'tags', 'notes', 'loyalty.points', 'loyalty.tier'];
  const updates = {};
  allowed.forEach(field => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, merchant: req.merchant._id },
    updates,
    { new: true, runValidators: true }
  );

  if (!customer) return next(new AppError('Customer not found', 404));

  res.status(200).json({ status: 'success', data: { customer } });
});

// Delete Customer (Soft Delete)
exports.deleteCustomer = catchAsync(async (req, res, next) => {
  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, merchant: req.merchant._id },
    { isActive: false },
    { new: true }
  );

  if (!customer) return next(new AppError('Customer not found', 404));

  res.status(204).json({ status: 'success', data: null });
});

// Give Gift / Add Note / Tag
exports.giveGift = catchAsync(async (req, res, next) => {
  const { name, type = 'free_item', value, menuItemId, expiresInDays = 30, reason } = req.body;

  const customer = await Customer.findOne({ _id: req.params.id, merchant: req.merchant._id });
  if (!customer) return next(new AppError('Customer not found', 404));

  customer.loyalty.gifts.push({
    name,
    type,
    value,
    menuItem: menuItemId,
    expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    givenBy: req.user._id,
    reason,
  });

  await customer.save();
  res.status(200).json({ status: 'success', message: 'Gift sent!' });
});

exports.addTagOrNote = catchAsync(async (req, res, next) => {
  const { tag, note } = req.body;
  const update = { $push: {} };
  if (tag) update.$push.tags = { value: tag, addedBy: req.user._id };
  if (note) update.$push.notes = { text: note, addedBy: req.user._id };

  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, merchant: req.merchant._id },
    update,
    { new: true }
  );

  if (!customer) return next(new AppError('Customer not found', 404));
  res.status(200).json({ status: 'success', data: { customer } });
});

// Award Points (Internal)
exports.awardPoints = catchAsync(async (customerId, amount) => {
  const points = Math.floor(amount * POINTS_PER_BIRR);
  const customer = await Customer.findById(customerId);
  if (!customer) return;

  customer.loyalty.points += points;
  customer.loyalty.totalPointsEarned += points;

  const newTier = Object.keys(TIERS).reverse().find(t => customer.loyalty.totalPointsEarned >= TIERS[t]);
  if (newTier && newTier !== customer.loyalty.tier) {
    customer.loyalty.tier = newTier;
  }
  await customer.save();
});