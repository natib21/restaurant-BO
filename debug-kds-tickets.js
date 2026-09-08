/**
 * Debug KDS Ticket Creation
 * 
 * Run this script to diagnose why KDS tickets aren't being created
 * Usage: node debug-kds-tickets.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

const OutboxEvent = require('./models/OutboxEvent');
const Order = require('./models/orderModel');
const MenuItem = require('./src/modules/menu/model/MenuItem.model');
const KitchenStation = require('./models/KitchenStation');
const KitchenTicket = require('./models/KitchenTicket');

async function debug() {
  try {
    // Connect to database
    const DB = process.env.DATABASE_LOCAL || process.env.DATABASE;
    await mongoose.connect(DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to database');

    // 1. Check Kitchen Stations
    console.log('\n📍 STEP 1: Checking Kitchen Stations...');
    const stations = await KitchenStation.find({ isActive: true }).select('_id name code merchant branch');
    console.log(`Found ${stations.length} active kitchen stations:`);
    stations.forEach(s => {
      console.log(`  - ${s.name} (${s.code}) - ID: ${s._id}`);
    });

    if (stations.length === 0) {
      console.log('❌ NO KITCHEN STATIONS FOUND! Create stations first.');
      process.exit(1);
    }

    // 2. Check Menu Items with Stations
    console.log('\n📍 STEP 2: Checking Menu Items with Kitchen Stations...');
    const menuItems = await MenuItem.find({ 
      kitchenStation: { $ne: null },
      isActive: true 
    }).select('_id name kitchenStation').limit(10);
    
    console.log(`Found ${menuItems.length} menu items with kitchen stations:`);
    menuItems.forEach(m => {
      console.log(`  - ${m.name?.en || m.name} → Station: ${m.kitchenStation}`);
    });

    if (menuItems.length === 0) {
      console.log('❌ NO MENU ITEMS HAVE KITCHEN STATIONS ASSIGNED!');
      console.log('   Assign stations to menu items first.');
      process.exit(1);
    }

    // 3. Check Recent Orders
    console.log('\n📍 STEP 3: Checking Recent Orders...');
    const orders = await Order.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select('_id orderNumber status items createdAt')
      .populate('items.menuItem', 'name kitchenStation');

    console.log(`Found ${orders.length} recent orders:`);
    orders.forEach(o => {
      console.log(`\n  Order ${o.orderNumber} (${o.status}):`);
      console.log(`  - Created: ${o.createdAt}`);
      console.log(`  - Items:`);
      o.items.forEach(item => {
        const menuItem = item.menuItem;
        if (menuItem) {
          console.log(`    * ${menuItem.name?.en || menuItem.name} (Station: ${menuItem.kitchenStation || 'NONE'})`);
        } else {
          console.log(`    * [Menu item not found]`);
        }
      });
    });

    // 4. Check Outbox Events for order:preparing
    console.log('\n📍 STEP 4: Checking Outbox Events (order:preparing)...');
    const outboxEvents = await OutboxEvent.find({ 
      eventType: 'order:preparing' 
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    console.log(`Found ${outboxEvents.length} order:preparing events:`);
    outboxEvents.forEach(e => {
      console.log(`\n  Event ${e._id}:`);
      console.log(`  - Status: ${e.status}`);
      console.log(`  - Order ID: ${e.payload?.data?.orderId || e.aggregateId}`);
      console.log(`  - Created: ${e.createdAt}`);
      console.log(`  - Published: ${e.publishedAt || 'NOT PUBLISHED'}`);
      console.log(`  - Retry Count: ${e.retryCount || 0}`);
      if (e.lastError) {
        console.log(`  - Last Error: ${e.lastError}`);
      }
    });

    if (outboxEvents.length === 0) {
      console.log('❌ NO order:preparing EVENTS FOUND!');
      console.log('   Orders might not be reaching "preparing" status.');
    } else {
      const pendingEvents = outboxEvents.filter(e => e.status === 'pending');
      const failedEvents = outboxEvents.filter(e => e.status === 'failed');
      
      if (pendingEvents.length > 0) {
        console.log(`\n⚠️  ${pendingEvents.length} events stuck in PENDING status!`);
        console.log('   Outbox worker might not be running.');
      }
      
      if (failedEvents.length > 0) {
        console.log(`\n❌ ${failedEvents.length} events FAILED!`);
        console.log('   Check the lastError field above for details.');
      }
    }

    // 5. Check KDS Tickets
    console.log('\n📍 STEP 5: Checking KDS Tickets...');
    const tickets = await KitchenTicket.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('order', 'orderNumber')
      .populate('station', 'name code');

    console.log(`Found ${tickets.length} KDS tickets:`);
    tickets.forEach(t => {
      console.log(`\n  Ticket ${t.ticketNumber}:`);
      console.log(`  - Order: ${t.order?.orderNumber || t.order}`);
      console.log(`  - Station: ${t.station?.name || t.station}`);
      console.log(`  - Status: ${t.status}`);
      console.log(`  - Items: ${t.items?.length || 0}`);
      console.log(`  - Created: ${t.createdAt}`);
    });

    if (tickets.length === 0) {
      console.log('❌ NO KDS TICKETS FOUND!');
      console.log('   This confirms tickets are not being created.');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY:');
    console.log('='.repeat(60));
    console.log(`Kitchen Stations: ${stations.length > 0 ? '✅' : '❌'}`);
    console.log(`Menu Items with Stations: ${menuItems.length > 0 ? '✅' : '❌'}`);
    console.log(`Recent Orders: ${orders.length}`);
    console.log(`Outbox Events (order:preparing): ${outboxEvents.length}`);
    console.log(`KDS Tickets: ${tickets.length}`);
    
    const pendingEvents = outboxEvents.filter(e => e.status === 'pending').length;
    const failedEvents = outboxEvents.filter(e => e.status === 'failed').length;
    
    if (pendingEvents > 0) {
      console.log(`\n⚠️  ISSUE: ${pendingEvents} events stuck in PENDING`);
      console.log('   → Check if outbox worker is running');
      console.log('   → Check server logs for errors');
    }
    
    if (failedEvents > 0) {
      console.log(`\n❌ ISSUE: ${failedEvents} events FAILED`);
      console.log('   → Check lastError field in outbox events');
      console.log('   → Look for errors in server logs');
    }

    if (outboxEvents.length === 0) {
      console.log(`\n❌ ISSUE: No order:preparing events found`);
      console.log('   → Orders might not be transitioning to "preparing" status');
      console.log('   → Try: PATCH /api/v1/orders/:id/status { "status": "preparing" }');
    }

    if (stations.length > 0 && menuItems.length > 0 && outboxEvents.length > 0 && tickets.length === 0) {
      console.log(`\n❌ ISSUE: Events exist but no tickets created`);
      console.log('   → KDS handler might be failing');
      console.log('   → Check server logs for handler errors');
    }

    console.log('\n✅ Diagnostic complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debug();
