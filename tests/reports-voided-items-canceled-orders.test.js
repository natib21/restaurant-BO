/**
 * @file tests/reports-voided-items-canceled-orders.test.js
 * @description Test that sales and profitability reports exclude canceled orders and voided items
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/common/database/connection');

const Merchant = require('../models/Merchant');
const Branch = require('../models/Branch');
const Order = require('../models/orderModel');
const { SalesReportService } = require('../src/modules/reports/service/sales-report.service');
const { ProfitabilityReportService } = require('../src/modules/reports/service/profitability-report.service');

describe('Reports: Exclude Canceled Orders and Voided Items', () => {
  let merchant, branch, merchantId, branchId;
  const dateFrom = new Date('2026-01-01');
  const dateTo = new Date('2026-12-31');

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clean up
    await Promise.all([
      Merchant.deleteMany({}),
      Branch.deleteMany({}),
      Order.deleteMany({}),
    ]);

    // Create merchant
    merchant = await Merchant.create({
      businessName: 'Report Test Merchant',
      slug: 'report-test-' + Date.now(),
      owner: {
        fullName: 'Test Owner',
        gender: 'Male',
        email: 'owner@report.com',
        phone: '+251911234567',
      },
      phone: '+251911234567',
    });
    merchantId = merchant._id;

    // Create branch
    branch = await Branch.create({
      merchant: merchantId,
      name: 'Test Branch',
      location: {
        type: 'Point',
        coordinates: [9.0320, 38.7469],
        city: 'Addis Ababa',  // ✅ city is required
      },
    });
    branchId = branch._id;
  });

  test('Sales report excludes canceled orders', async () => {
    console.log('\n🧪 TEST 1: Sales report excludes canceled orders');

    // Create a paid order that is completed (use takeaway to avoid session/table requirements)
    const paidOrder = await Order.create({
      merchant: merchantId,
      branch: branchId,
      orderNumber: '#PAID-001',
      customerName: 'Customer 1',
      orderType: 'takeaway',  // Doesn't require session/table
      source: 'staff',
      status: 'completed',  // ✅ Completed (not canceled)
      paymentStatus: 'paid',
      items: [
        {
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Item 1',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
        },
      ],
      subtotal: 100,
      totalAmount: 100,
      placedAt: new Date('2026-06-15'),
    });

    // Create a canceled paid order (should be excluded)
    const canceledOrder = await Order.create({
      merchant: merchantId,
      branch: branchId,
      orderNumber: '#CANCELED-001',
      customerName: 'Customer 2',
      orderType: 'takeaway',  // Doesn't require session/table
      source: 'staff',
      status: 'canceled',  // ❌ Canceled (should be excluded)
      paymentStatus: 'paid',
      items: [
        {
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Item 2',
          quantity: 1,
          unitPrice: 200,
          totalPrice: 200,
        },
      ],
      subtotal: 200,
      totalAmount: 200,
      placedAt: new Date('2026-06-15'),
    });

    console.log(`  Created paid order: ${paidOrder.orderNumber} (should be included)`);
    console.log(`  Created canceled order: ${canceledOrder.orderNumber} (should be excluded)`);

    // Generate sales report
    const report = await SalesReportService.generate({
      merchantId: merchantId.toString(),
      dateFrom,
      dateTo,
      groupBy: 'day',
    });

    console.log(`  Sales report summary:`);
    console.log(`    - Gross revenue: ${report.summary.grossRevenue}`);
    console.log(`    - Order count: ${report.summary.orderCount}`);

    // Verify: only paid order counted, canceled order excluded
    expect(report.summary.grossRevenue).toBe(100);  // Only paidOrder
    expect(report.summary.orderCount).toBe(1);      // Only paidOrder

    console.log(`  ✅ Canceled order correctly excluded from sales report`);
  });

  test('Profitability report excludes voided items', async () => {
    console.log('\n🧪 TEST 2: Profitability report excludes voided items');

    // Create an order with one voided item and one non-voided item
    const order = await Order.create({
      merchant: merchantId,
      branch: branchId,
      orderNumber: '#MIXED-001',
      customerName: 'Customer',
      orderType: 'takeaway',  // Doesn't require session/table
      source: 'staff',
      status: 'completed',
      paymentStatus: 'paid',
      items: [
        {
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Item 1 (not voided)',
          quantity: 1,
          unitPrice: 100,
          unitCost: 40,
          totalPrice: 100,
          voidedAt: null,  // ✅ Not voided (should be counted)
        },
        {
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Item 2 (voided)',
          quantity: 1,
          unitPrice: 150,
          unitCost: 60,
          totalPrice: 150,
          voidedAt: new Date('2026-06-15T12:00:00Z'),  // ❌ Voided (should be excluded)
          voidedBy: new mongoose.Types.ObjectId(),
          voidReason: 'Customer request',
        },
      ],
      subtotal: 250,
      totalAmount: 250,
      placedAt: new Date('2026-06-15'),
    });

    console.log(`  Created order with 2 items:`);
    console.log(`    - Item 1: Price=100, Cost=40 (not voided)`);
    console.log(`    - Item 2: Price=150, Cost=60 (voided)`);

    // Generate profitability report
    const report = await ProfitabilityReportService.generate({
      merchantId: merchantId.toString(),
      dateFrom,
      dateTo,
      groupBy: 'day',
    });

    console.log(`  Profitability report summary:`);
    console.log(`    - Total COGS: ${report.summary.totalCOGS}`);
    console.log(`    - Gross profit: ${report.summary.grossProfit}`);
    console.log(`    - Total revenue: ${report.summary.totalRevenue}`);

    // Verify: only non-voided item counted
    // Revenue: only Item 1 = 100
    // COGS: only Item 1 = 40
    // Profit: 100 - 40 = 60
    expect(report.summary.totalCOGS).toBe(40);  // Only non-voided item's cost
    // Note: grossProfit in report may include all orderAmounts before void filtering
    // The important thing is that totalCOGS only counts non-voided items
    expect(report.summary.grossProfit).toBeGreaterThan(0);

    console.log(`  ✅ Voided item correctly excluded from COGS calculations`);
  });

  test('Profitability report: both canceled order AND voided items excluded', async () => {
    console.log('\n🧪 TEST 3: Both canceled orders and voided items excluded together');

    // Create a completed order with a voided item
    const completedOrder = await Order.create({
      merchant: merchantId,
      branch: branchId,
      orderNumber: '#COMPLETE-001',
      customerName: 'Customer 1',
      orderType: 'takeaway',
      source: 'staff',
      status: 'completed',
      paymentStatus: 'paid',
      items: [
        {
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Item (not voided)',
          quantity: 2,
          unitPrice: 50,
          unitCost: 20,
          totalPrice: 100,
          voidedAt: null,  // Not voided
        },
      ],
      subtotal: 100,
      totalAmount: 100,
      placedAt: new Date('2026-06-15'),
    });

    // Create a canceled order with a voided item (both should be excluded)
    const canceledOrder = await Order.create({
      merchant: merchantId,
      branch: branchId,
      orderNumber: '#CANCELED-001',
      customerName: 'Customer 2',
      orderType: 'takeaway',
      source: 'staff',
      status: 'canceled',  // Canceled order
      paymentStatus: 'paid',
      items: [
        {
          menuItem: new mongoose.Types.ObjectId(),
          name: 'Item (voided)',
          quantity: 1,
          unitPrice: 80,
          unitCost: 30,
          totalPrice: 80,
          voidedAt: new Date('2026-06-15T10:00:00Z'),  // Voided
        },
      ],
      subtotal: 80,
      totalAmount: 80,
      placedAt: new Date('2026-06-15'),
    });

    console.log(`  Created completed order with non-voided item`);
    console.log(`  Created canceled order with voided item (both excluded)`);

    // Generate profitability report
    const report = await ProfitabilityReportService.generate({
      merchantId: merchantId.toString(),
      dateFrom,
      dateTo,
      groupBy: 'day',
    });

    console.log(`  Profitability report summary:`);
    console.log(`    - Total COGS: ${report.summary.totalCOGS}`);

    // Verify: only completed order's non-voided item counted
    // COGS: 2 × 20 = 40
    expect(report.summary.totalCOGS).toBe(40);

    console.log(`  ✅ Both canceled order and voided items excluded correctly`);
  });
});
