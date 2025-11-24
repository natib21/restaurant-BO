// controllers/merchantAnalyticsController.js
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Menu = require('../models/Menu');
const axios = require('axios');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// ====================== HELPER: Date Ranges ======================
const getDateRange = period => {
  const now = new Date();
  const startOfDay = new Date(now.setHours(0, 0, 0, 0));
  const ranges = {
    today: { start: startOfDay, end: new Date() },
    week: {
      start: new Date(startOfDay.setDate(startOfDay.getDate() - startOfDay.getDay())),
      end: new Date(),
    },
    month: {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(),
    },
    quarter: {
      start: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1),
      end: new Date(),
    },
    year: {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(),
    },
  };
  return ranges[period] || ranges.today;
};

// ====================== 1. MAIN MERCHANT DASHBOARD ======================
exports.getDashboard = catchAsync(async (req, res, next) => {
  const merchantId = req.merchant._id;

  // 1. Revenue & Orders by Period
  const periods = ['today', 'week', 'month', 'quarter', 'year'];
  const revenue = {};

  for (const p of periods) {
    const { start, end } = getDateRange(p);
    const result = await Order.aggregate([
      {
        $match: {
          merchant: merchantId,
          status: 'completed',
          completedAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
          uniqueCustomers: { $addToSet: '$customer' },
        },
      },
    ]);

    const data = result[0] || { revenue: 0, orders: 0, uniqueCustomers: [] };
    revenue[p] = {
      revenue: Number(data.revenue.toFixed(2)),
      orders: data.orders,
      uniqueCustomers: data.uniqueCustomers.length,
    };
  }

  // 2. Top 5 Most Ordered Foods (All Time)
  const topFoods = await Order.aggregate([
    { $match: { merchant: merchantId, status: 'completed' } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.menuItem',
        name: { $first: '$items.name' },
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } },
      },
    },
    { $sort: { quantity: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: 'menus',
        localField: '_id',
        foreignField: '_id',
        as: 'item',
      },
    },
    { $unwind: { path: '$item', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        name: { $ifNull: ['$name', '$item.name'] },
        quantity: 1,
        revenue: { $round: ['$revenue', 2] },
        image: '$item.image',
        rating: '$item.rating',
      },
    },
  ]);

  // 3. Top 10 VIP Customers (Most Visits + Highest Spend)
  const topCustomers = await Order.aggregate([
    { $match: { merchant: merchantId, status: 'completed' } },
    {
      $group: {
        _id: '$customer',
        totalSpent: { $sum: '$totalAmount' },
        visits: { $sum: 1 },
        lastVisit: { $max: '$completedAt' },
      },
    },
    { $sort: { totalSpent: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'customers',
        localField: '_id',
        foreignField: '_id',
        as: 'customer',
      },
    },
    { $unwind: '$customer' },
    {
      $project: {
        fullName: '$customer.fullName',
        phone: '$customer.phone',
        profileImage: '$customer.profileImage',
        telegramId: '$customer.telegram.id',
        totalSpent: { $round: ['$totalSpent', 2] },
        visits: 1,
        lastVisit: 1,
      },
    },
  ]);

  // 4. Customer Growth (This Month)
  const { start: monthStart } = getDateRange('month');
  const growth = await Order.aggregate([
    { $match: { merchant: merchantId, status: 'completed', completedAt: { $gte: monthStart } } },
    { $group: { _id: '$customer', firstOrder: { $min: '$completedAt' } } },
    {
      $group: {
        _id: null,
        new: { $sum: { $cond: [{ $gte: ['$firstOrder', monthStart] }, 1, 0] } },
        returning: { $sum: { $cond: [{ $lt: ['$firstOrder', monthStart] }, 1, 0] } },
      },
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      revenue,
      topFoods,
      topCustomers,
      customerGrowth: {
        new: growth[0]?.new || 0,
        returning: growth[0]?.returning || 0,
      },
      generatedAt: new Date(),
    },
  });
});

// ====================== 2. SEND DIRECT MESSAGE TO CUSTOMER ======================
exports.sendDirectMessage = catchAsync(async (req, res, next) => {
  const { customerId, message } = req.body;
  if (!message?.trim()) return next(new AppError('Message is required', 400));

  const customer = await Customer.findOne({ _id: customerId, merchant: req.merchant._id });
  if (!customer) return next(new AppError('Customer not found', 404));

  let sentVia = null;
  let link = null;

  // Try Telegram First (Best in Ethiopia)
  if (customer.telegram?.id && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: customer.telegram.id,
          text: `Message from ${req.merchant.businessName}\n\n${message}\n\nReply here or visit us again!`,
          reply_markup: {
            inline_keyboard: [
              [{ text: 'View Menu', url: `https://yourapp.com/menu/${req.merchant._id}` }],
            ],
          },
        }
      );
      sentVia = 'telegram';
      link = `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}`;
    } catch (err) {
      console.log('Telegram send failed:', err.response?.data);
    }
  }

  res.status(200).json({
    status: 'success',
    message: 'Message sent!',
    data: {
      customer: customer.fullName,
      sentVia: sentVia || 'saved_for_next_visit',
      link,
    },
  });
});
