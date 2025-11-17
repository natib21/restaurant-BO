// controllers/customerController.js
const Customer = require('../models/Customer');
const Merchant = require('../models/Merchant');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const axios = require('axios');

// ────── 1. Customer Login / Register (Guest + All Social) ──────
exports.loginOrCreate = catchAsync(async (req, res, next) => {
  const { merchantId, fullName, source = 'guest', phone, tableNumber, token } = req.body;

  if (!merchantId || !fullName?.trim()) {
    return next(new AppError('Merchant ID and name are required', 400));
  }

  const merchant = await Merchant.findById(merchantId);
  if (!merchant) return next(new AppError('Restaurant not found', 404));

  let customerData = {
    merchant: merchantId,
    fullName: fullName.trim(),
    phone: phone?.trim() || undefined,
    tableNumber,
    source,
  };

  // ─── Handle Social Logins ───
  if (source === 'facebook' && token) {
    try {
      const fbRes = await axios.get(`https://graph.facebook.com/v20.0/me`, {
        params: { fields: 'id,name,username,picture.type(large)', access_token: token },
      });
      const fb = fbRes.data;
      customerData.source = 'facebook';
      customerData.facebook = {
        id: fb.id,
        username: fb.username || fb.name,
        profilePic: fb.picture?.data?.url,
      };
      customerData.fullName = fb.name;
    } catch (err) {
      return next(new AppError('Invalid Facebook token', 401));
    }
  }

  else if (source === 'tiktok' && token) {
    try {
      const ttRes = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
        headers: { Authorization: `Bearer ${token}` },
        params: { fields: 'open_id,username,avatar_url,display_name' },
      });
      const user = ttRes.data.data.user;
      customerData.source = 'tiktok';
      customerData.tiktok = {
        id: user.open_id,
        username: user.username,
        profilePic: user.avatar_url,
      };
      customerData.fullName = user.display_name || user.username;
    } catch (err) {
      return next(new AppError('Invalid TikTok token', 401));
    }
  }

  else if (source === 'telegram' && req.body.telegramUser) {
    const tg = req.body.telegramUser; // { id, username, first_name, photo_url }
    customerData.source = 'telegram';
    customerData.telegram = {
      id: String(tg.id),
      username: tg.username || null,
      firstName: tg.first_name,
      profilePic: tg.photo_url || null,
    };
    customerData.fullName = tg.first_name + (tg.last_name ? ` ${tg.last_name}` : '');
  }

  // ─── Upsert Customer (never duplicate social accounts) ───
  let query;
  if (customerData.source === 'facebook') query = { merchant: merchantId, 'facebook.id': customerData.facebook.id };
  else if (customerData.source === 'tiktok') query = { merchant: merchantId, 'tiktok.id': customerData.tiktok.id };
  else if (customerData.source === 'telegram') query = { merchant: merchantId, 'telegram.id': customerData.telegram.id };
  else query = { merchant: merchantId, fullName: customerData.fullName, source: 'guest' }; // guest

  const customer = await Customer.findOneAndUpdate(query, customerData, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  res.status(200).json({
    status: 'success',
    data: {
      customer: {
        id: customer._id,
        fullName: customer.fullName,
        profileImage: customer.profileImage,
        source: customer.source,
        tableNumber: customer.tableNumber,
      },
    },
  });
});

// ────── 2. Get All Customers for Merchant Dashboard ──────
exports.getAllCustomers = catchAsync(async (req, res, next) => {
  const merchantId = req.merchant._id; // from protect middleware

  const customers = await Customer.find({ merchant: merchantId })
    .select('fullName phone source facebook tiktok telegram tableNumber lastSeen profileImage')
    .sort('-lastSeen')
    .limit(100);

  res.status(200).json({
    status: 'success',
    results: customers.length,
    data: { customers },
  });
});

// ────── 3. Get Single Customer (for chat view) ──────
exports.getCustomer = catchAsync(async (req, res, next) => {
  const customer = await Customer.findById(req.params.id)
    .populate('merchant', 'businessName')
    .select('+phone');

  if (!customer || customer.merchant._id.toString() !== req.merchant._id.toString()) {
    return next(new AppError('Customer not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { customer },
  });
});