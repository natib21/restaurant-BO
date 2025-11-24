// controllers/customerController.js
const Customer = require('../models/customerModule')
const Order = require('../models/orderModel')
const axios = require('axios');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// ====================== LOYALTY CONFIG ======================
const POINTS_PER_BIRR = 1; // 1 point per 1 ETB spent
const TIERS = { bronze: 0, silver: 5000, gold: 20000, platinum: 50000 };

// ====================== 1. SOCIAL + GUEST LOGIN (Public) ======================
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

  if (!merchantId) {
    return next(new AppError('merchantId is required', 400));
  }

  let customerData = {
    merchant: merchantId,
    fullName: (fullName || 'Guest').trim(),
    phone: phone ? phone.replace(/\s/g, '') : undefined,
    currentTable: tableNumber?.trim(),
    source,
    lastSeen: new Date(),
  };

  let filter = { merchant: merchantId };

  // ——————— TELEGRAM LOGIN (Most Popular in Ethiopia) ———————
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
  }

  // ——————— FACEBOOK LOGIN ———————
  else if (source === 'facebook' && facebookToken) {
    try {
      const { data: fb } = await axios.get('https://graph.facebook.com/v20.0/me', {
        params: { fields: 'id,name,picture.type(large)', access_token: facebookToken },
      });

      customerData.source = 'facebook';
      customerData.fullName = fb.name;
      customerData.facebook = {
        id: fb.id,
        username: fb.name,
        profilePic: fb.picture?.data?.url || null,
      };
      filter['facebook.id'] = fb.id;
    } catch (err) {
      return next(new AppError('Invalid Facebook token', 401));
    }
  }

  // ——————— TIKTOK LOGIN ———————
  else if (source === 'tiktok' && tiktokToken) {
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
    } catch (err) {
      return next(new AppError('Invalid TikTok token', 401));
    }
  }

  // ——————— GUEST / PHONE ———————
  else {
    customerData.source = phone ? 'phone' : 'guest';
    if (phone) filter.phone = customerData.phone;
    else filter.fullName = customerData.fullName;
  }

  // Final upsert
  const customer = await Customer.findOneAndUpdate(filter, customerData, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    runValidators: true,
  });

  res.status(200).json({
    status: 'success',
    data: {
      customer: {
        _id: customer._id,
        fullName: customer.fullName,
        profileImage: customer.profileImage,
        source: customer.source,
        currentTable: customer.currentTable,
      },
    },
  });
});

// ====================== 2. FULL CRM PROFILE (Staff View) ======================
exports.getCustomerCRM = catchAsync(async (req, res, next) => {
  const customer = await Customer.findById(req.params.id)
    .select('-__v')
    .populate('loyalty.gifts.menuItem', 'name price image')
    .lean();

  if (!customer || customer.merchant.toString() !== req.merchant._id.toString()) {
    return next(new AppError('Customer not found', 404));
  }

  const stats = await Order.aggregate([
    { $match: { customer: customer._id, status: 'completed' } },
    {
      $group: {
        _id: null,
        totalSpent: { $sum: '$totalAmount' },
        totalOrders: { $sum: 1 },
        avgOrderValue: { $avg: '$totalAmount' },
        firstOrder: { $min: '$completedAt' },
        lastOrder: { $max: '$completedAt' },
        items: { $push: '$items' },
      },
    },
  ]).then(r => r[0] || { totalSpent: 0, totalOrders: 0, avgOrderValue: 0 });

  const itemCount = {};
  stats.items?.flat().forEach(i => {
    const name = i.name.toLowerCase();
    itemCount[name] = (itemCount[name] || 0) + i.quantity;
  });
  const topItems = Object.entries(itemCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), qty }));

  const daysSinceLastVisit = Math.floor((Date.now() - new Date(customer.lastSeen)) / 86400000);

  res.status(200).json({
    status: 'success',
    data: {
      profile: {
        _id: customer._id,
        fullName: customer.fullName,
        phone: customer.phone,
        source: customer.source,
        currentTable: customer.currentTable,
        profileImage: customer.profileImage,
        memberSince: customer.createdAt,
        lastSeen: customer.lastSeen,
        daysSinceLastVisit,
        tags: customer.tags || [],
        notes: customer.notes || [],
      },
      loyalty: {
        tier: customer.loyalty.tier,
        points: customer.loyalty.points,
        totalEarned: customer.loyalty.totalPointsEarned,
        activeGifts: customer.loyalty.gifts.filter(
          g => !g.claimed && (!g.expiresAt || g.expiresAt > new Date())
        ),
      },
      lifetime: {
        totalSpent: Number(stats.totalSpent.toFixed(2)),
        totalVisits: stats.totalOrders,
        avgOrderValue: Number(stats.avgOrderValue?.toFixed(2) || 0),
        firstVisit: stats.firstOrder,
        lastVisit: stats.lastOrder,
        topItems,
      },
      insights: {
        isVIP: stats.totalSpent >= 50000,
        atRisk: daysSinceLastVisit > 60 && stats.totalOrders > 3,
        needsAttention: daysSinceLastVisit > 90,
        suggestedAction:
          daysSinceLastVisit > 90
            ? 'Send 15% off coupon via SMS'
            : stats.totalSpent >= 50000
              ? 'Offer free dessert on next visit'
              : null,
      },
    },
  });
});

// ====================== 3. CRM DASHBOARD LIST ======================
exports.getAllCustomersCRM = catchAsync(async (req, res, next) => {
  const customers = await Customer.find({ merchant: req.merchant._id })
    .select(
      'fullName phone currentTable lastSeen loyalty.tier loyalty.points tags profileImage source createdAt'
    )
    .sort('-lastSeen')
    .limit(200)
    .lean();

  const enriched = await Promise.all(
    customers.map(async c => {
      const stats = await Order.aggregate([
        { $match: { customer: c._id, status: 'completed' } },
        {
          $group: {
            _id: null,
            spent: { $sum: '$totalAmount' },
            visits: { $sum: 1 },
            last: { $max: '$completedAt' },
          },
        },
      ]);
      const s = stats[0] || { spent: 0, visits: 0, last: null };
      const daysAgo = s.last ? Math.floor((Date.now() - new Date(s.last)) / 86400000) : null;

      return {
        ...c,
        stats: {
          totalSpent: Number(s.spent.toFixed(2)),
          visits: s.visits,
          lastVisitDaysAgo: daysAgo,
          isVIP: s.spent >= 50000,
          atRisk: daysAgo > 60 && s.visits > 3,
        },
      };
    })
  );

  res.status(200).json({
    status: 'success',
    results: enriched.length,
    data: { customers: enriched },
  });
});

// ====================== 4. AWARD POINTS (Call after order completed) ======================
exports.awardPoints = catchAsync(async (customerId, amount) => {
  const points = Math.floor(amount * POINTS_PER_BIRR);
  const customer = await Customer.findById(customerId);
  if (!customer) return;

  customer.loyalty.points += points;
  customer.loyalty.totalPointsEarned += points;

  const newTier = Object.keys(TIERS)
    .reverse()
    .find(t => customer.loyalty.totalPointsEarned >= TIERS[t]);
  if (newTier && newTier !== customer.loyalty.tier) {
    customer.loyalty.tier = newTier;
    customer.loyalty.gifts.push({
      name: `${newTier.toUpperCase()} Tier Unlocked!`,
      type: 'free_item',
      value: newTier === 'platinum' ? 1000 : newTier === 'gold' ? 500 : 200,
      reason: `Welcome to ${newTier} tier!`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  }
  await customer.save();
});

// ====================== 5. GIVE MANUAL GIFT (Staff) ======================
exports.giveGift = catchAsync(async (req, res, next) => {
  const {
    name,
    type = 'free_item',
    value,
    menuItemId,
    expiresInDays = 30,
    reason = 'Staff Reward',
  } = req.body;

  const customer = await Customer.findOne({ _id: req.params.id, merchant: req.merchant._id });
  if (!customer) return next(new AppError('Customer not found', 404));

  customer.loyalty.gifts.push({
    name,
    type,
    value,
    menuItem: menuItemId || undefined,
    expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    givenBy: req.user._id,
    reason,
  });

  await customer.save();
  res.status(200).json({
    status: 'success',
    message: `Gift "${name}" sent to ${customer.fullName}!`,
  });
});

// ====================== 6. CLAIM GIFT (Customer) ======================
exports.claimGift = catchAsync(async (req, res, next) => {
  const { giftId } = req.body;
  const gift = req.customer.loyalty.gifts.id(giftId);

  if (!gift || gift.claimed || (gift.expiresAt && gift.expiresAt < new Date())) {
    return next(new AppError('Invalid or expired gift', 400));
  }

  gift.claimed = true;
  gift.claimedAt = new Date();
  await req.customer.save();

  res.status(200).json({
    status: 'success',
    message: `Enjoy your ${gift.name}!`,
    data: { gift },
  });
});

// ====================== 7. ADD TAG / NOTE (Staff) ======================
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
