// controllers/customerController.js
const axios = require('axios');
const Customer = require('../models/customerModule');
const Order = require('../models/orderModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const CustomerSession = require('../models/customerSessionModule');
// ====================== LOYALTY CONFIG ======================
const POINTS_PER_BIRR = 1;
const TIERS = { bronze: 0, silver: 5000, gold: 20000, platinum: 50000 };

// ====================== HELPERS ======================
const ensureHistoryArray = customer => {
  if (!Array.isArray(customer.history)) customer.history = [];
};
exports.loginOrCreate = catchAsync(async (req, res, next) => {
  const merchantId = req.merchantId; // from protectMerchant middleware
  const tableId = req.tableId; // ← this is ObjectId from QR/session
  const sessionToken = req.tableSession?.token; // from protectTableSession

  const { fullName, phone, source = 'guest', telegramUser, facebookToken, tiktokToken } = req.body;

  if (!merchantId) {
    return next(new AppError('merchantId is required', 400));
  }

  const baseData = {
    merchant: merchantId,
    fullName: (fullName || 'Guest').trim(),
    currentTable: tableId ? String(tableId) : null, // keep as string or ObjectId as you prefer
    lastSeen: new Date(),
  };

  // Build filter + customer data based on auth source
  let filter = { merchant: merchantId };
  let customerData = { ...baseData };

  // TELEGRAM AUTH
  if (source === 'telegram' && telegramUser) {
    const { id, username, first_name, last_name, photo_url } = telegramUser;
    filter['telegram.id'] = String(id);
    customerData.source = 'telegram';
    customerData.fullName = `${first_name || ''} ${last_name || ''}`.trim() || 'Telegram User';
    customerData.telegram = {
      id: String(id),
      username: username || null,
      firstName: first_name || null,
      lastName: last_name || null,
      profilePic: photo_url || null,
    };
  }
  // FACEBOOK AUTH
  else if (source === 'facebook' && facebookToken) {
    try {
      const { data: fb } = await axios.get('https://graph.facebook.com/v20.0/me', {
        params: { fields: 'id,name,picture.type(large)', access_token: facebookToken },
      });

      filter['facebook.id'] = fb.id;
      customerData.source = 'facebook';
      customerData.fullName = fb.name || 'Facebook User';
      customerData.facebook = { id: fb.id, profilePic: fb.picture?.data?.url || null };
    } catch (err) {
      return next(new AppError('Invalid or expired Facebook token', 401));
    }
  }
  // TIKTOK AUTH
  else if (source === 'tiktok' && tiktokToken) {
    try {
      const { data } = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
        headers: { Authorization: `Bearer ${tiktokToken}` },
        params: { fields: 'open_id,username,avatar_url,display_name' },
      });

      const user = data.data.user;
      filter['tiktok.id'] = user.open_id;
      customerData.source = 'tiktok';
      customerData.fullName = user.display_name || user.username || 'TikTok User';
      customerData.tiktok = {
        id: user.open_id,
        username: user.username || null,
        profilePic: user.avatar_url || null,
      };
    } catch (err) {
      return next(new AppError('Invalid or expired TikTok token', 401));
    }
  }
  // GUEST OR PHONE
  else {
    customerData.source = 'guest';
    if (phone) {
      const cleanPhone = phone.replace(/\s+/g, '');
      if (cleanPhone) {
        customerData.phone = cleanPhone;
        filter.phone = cleanPhone;
      }
    }
  }

  // ————————————————————————
  // CORRECT SESSION LOOKUP (THIS WAS THE BUG!)
  // ————————————————————————
  let session = null;

  if (sessionToken && tableId) {
    console.log('Looking for session →', { sessionToken, tableId, merchantId });

    session = await CustomerSession.findOne({
      token: sessionToken,
      merchant: merchantId,
      tableId: tableId, // ← THIS IS THE CORRECT FIELD (ObjectId)
      customer: null, // not linked yet
      isActive: true,
      expiresAt: { $gt: new Date() },
    });

    console.log('Session found →', session ? 'YES' : 'NO');
  }

  // Try to find existing customer
  let customer = await Customer.findOne(filter);
   console.log("Customer Found :-",customer)
  // ————————————————————————
  // EXISTING CUSTOMER
  // ————————————————————————
  if (customer) {
    customer.fullName = customerData.fullName || customer.fullName;
    customer.currentTable = tableId ? String(tableId) : customer.currentTable;
    customer.lastSeen = new Date();

    // Merge social data
    if (customerData.telegram) Object.assign(customer.telegram || {}, customerData.telegram);
    if (customerData.facebook) Object.assign(customer.facebook || {}, customerData.facebook);
    if (customerData.tiktok) Object.assign(customer.tiktok || {}, customerData.tiktok);

    // Upgrade source if better
    const sourcePriority = { guest: 1, phone: 2, telegram: 3, facebook: 3, tiktok: 3 };
    if (sourcePriority[customerData.source] > (sourcePriority[customer.source] || 0)) {
      customer.source = customerData.source;
    }

    // Link the anonymous session to this customer
    if (session) {
      session.customer = customer._id;
      await session.save();
    }

    ensureHistoryArray(customer);
    customer.history.push({
      action: 'login',
      details: `Logged in via ${customer.source}${session ? ' and linked table session' : ''}`,
      addedAt: new Date(),
    });

    await customer.save();

    return res.status(200).json({
      status: 'success',
      message: session ? 'Welcome back! You are now seated.' : 'Logged in successfully',
      existing: true,
      linkedToTable: !!session,
      data: { customer },
    });
  }

  // ————————————————————————
  // NEW CUSTOMER
  // ————————————————————————
  customer = await Customer.create({
    ...customerData,
    source: customerData.source || 'guest',
  });

  if (session) {
    session.customer = customer._id;
    await session.save();
  }

  ensureHistoryArray(customer);
  customer.history.push({
    action: 'signup',
    details: `Created via ${customer.source}${session ? ' and seated at table' : ''}`,
    addedAt: new Date(),
  });

  await customer.save();

  res.status(201).json({
    status: 'success',
    message: session
      ? 'Account created! Welcome, you are now seated.'
      : 'Account created successfully',
    existing: false,
    linkedToTable: !!session,
    data: { customer },
  });
});
exports.protectCustomer = catchAsync(async (req, res, next) => {
  const id = req.customerId;
  if (!id)
    return next(new AppError('Customer id is required (x-customer-id / customerId / params)', 401));

  const customer = await Customer.findById(id);
  if (!customer) return next(new AppError('Customer not found', 404));

  req.customer = customer;
  next();
});

// ====================== 3) CUSTOMER SELF ROUTES ======================
// getMe & updateMe now expect protectCustomer middleware to have set req.customer
exports.getMe = catchAsync(async (req, res) => {
  res.status(200).json({ status: 'success', data: { customer: req.customer } });
});

exports.updateMe = catchAsync(async (req, res, next) => {
  const customer = req.customer;
  const { fullName, phone } = req.body;

  if (fullName) customer.fullName = fullName.trim();
  if (phone) {
    const cleanPhone = phone.replace(/\s/g, '');
    if (!/^\+?251[79]\d{8}$/.test(cleanPhone)) {
      return next(new AppError('Invalid phone number', 400));
    }
    customer.phone = cleanPhone;
  }

  ensureHistoryArray(customer);
  customer.history.push({
    action: 'update_profile',
    details: 'Customer updated profile info',
    addedAt: new Date(),
  });

  await customer.save();
  res.status(200).json({ status: 'success', data: { customer } });
});

exports.getMyOrders = catchAsync(async (req, res) => {
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

// ====================== 4) STAFF / ADMIN ROUTES ======================
// These routes still expect upstream middleware that sets req.user and req.merchant
exports.getCustomer = catchAsync(async (req, res, next) => {
  const customer = await Customer.findById(req.params.id).populate(
    'loyalty.gifts.menuItem',
    'name price image'
  );

  if (!customer || customer.merchant.toString() !== req.merchant._id.toString())
    return next(new AppError('Customer not found', 404));

  // Basic stats via orders (completed)
  const stats = await Order.aggregate([
    { $match: { customer: customer._id, status: 'completed' } },
    { $group: { _id: null, totalSpent: { $sum: '$totalAmount' }, visits: { $sum: 1 } } },
  ]);

  res.status(200).json({
    status: 'success',
    data: { customer, stats: stats[0] || { totalSpent: 0, visits: 0 } },
  });
});

exports.getAllCustomers = catchAsync(async (req, res) => {
  const customers = await Customer.find({ merchant: req.user.merchant._id }).sort('-lastSeen');

  res.status(200).json({ status: 'success', results: customers.length, data: { customers } });
});

exports.updateCustomer = catchAsync(async (req, res, next) => {
  const allowed = [
    'fullName',
    'phone',
    'tags',
    'notes',
    'loyalty.points',
    'loyalty.tier',
    'stats.totalOrders',
    'stats.totalSpent',
  ];
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

  ensureHistoryArray(customer);
  customer.history.push({
    action: 'staff_update',
    details: `Staff ${req.user._id} updated fields: ${Object.keys(updates).join(', ')}`,
    addedAt: new Date(),
    addedBy: req.user._id,
  });
  await customer.save();

  res.status(200).json({ status: 'success', data: { customer } });
});

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

  ensureHistoryArray(customer);
  customer.history.push({
    action: 'gift_given',
    details: `Gift "${name}" given`,
    addedAt: new Date(),
    addedBy: req.user._id,
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

// ====================== 5) AWARD POINTS (INTERNAL) ======================
exports.awardPoints = catchAsync(async (customerId, amount) => {
  const points = Math.floor(amount * POINTS_PER_BIRR);
  const customer = await Customer.findById(customerId);
  if (!customer) return;

  customer.loyalty.points += points;
  customer.loyalty.totalPointsEarned += points;

  const newTier = Object.keys(TIERS)
    .reverse()
    .find(t => customer.loyalty.totalPointsEarned >= TIERS[t]);
  if (newTier && newTier !== customer.loyalty.tier) customer.loyalty.tier = newTier;

  ensureHistoryArray(customer);
  customer.history.push({
    action: 'award_points',
    details: `Awarded ${points} points`,
    addedAt: new Date(),
  });

  await customer.save();
});
