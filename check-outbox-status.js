// Quick diagnostic script to check outbox events and tickets
require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const OutboxEvent = require('./models/OutboxEvent');
const KitchenTicket = require('./models/KitchenTicket');
const Order = require('./models/orderModel');

async function checkStatus() {
  try {
    await mongoose.connect(process.env.LOCAL_DATABASE, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connected to database\n');

    // 1. Check orders in preparing status
    const preparingOrders = await Order.find({ status: 'preparing' })
      .select('_id orderNumber status items')
      .limit(5)
      .lean();
    
    console.log('📦 ORDERS IN PREPARING STATUS:');
    console.log(`   Found ${preparingOrders.length} orders\n`);
    preparingOrders.forEach(o => {
      const itemsWithStation = o.items.filter(i => i.requiresKitchen).length;
      console.log(`   - ${o.orderNumber} (${o._id})`);
      console.log(`     Items needing kitchen: ${itemsWithStation}`);
    });

    // 2. Check outbox events
    const pendingEvents = await OutboxEvent.find({ 
      eventType: 'order:preparing',
      status: 'pending'
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

    const processingEvents = await OutboxEvent.find({ 
      eventType: 'order:preparing',
      status: 'processing'
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

    const publishedEvents = await OutboxEvent.find({ 
      eventType: 'order:preparing',
      status: 'published'
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

    const failedEvents = await OutboxEvent.find({ 
      eventType: 'order:preparing',
      status: 'failed'
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

    console.log('\n📨 OUTBOX EVENTS (order:preparing):');
    console.log(`   Pending: ${pendingEvents.length}`);
    console.log(`   Processing: ${processingEvents.length}`);
    console.log(`   Published: ${publishedEvents.length}`);
    console.log(`   Failed: ${failedEvents.length}\n`);

    if (pendingEvents.length > 0) {
      console.log('   Recent PENDING events:');
      pendingEvents.forEach(e => {
        console.log(`   - Event ${e._id}`);
        console.log(`     Order: ${e.aggregateId}`);
        console.log(`     Created: ${e.createdAt}`);
        console.log(`     Retry count: ${e.retryCount}`);
        console.log(`     Next retry: ${e.nextRetryAt}`);
      });
    }

    if (failedEvents.length > 0) {
      console.log('\n   Recent FAILED events:');
      failedEvents.forEach(e => {
        console.log(`   - Event ${e._id}`);
        console.log(`     Order: ${e.aggregateId}`);
        console.log(`     Error: ${e.lastError}`);
        console.log(`     Retries: ${e.retryCount}`);
      });
    }

    // 3. Check kitchen tickets
    const recentTickets = await KitchenTicket.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('order', 'orderNumber')
      .lean();

    console.log('\n🎫 KITCHEN TICKETS:');
    console.log(`   Total recent tickets: ${recentTickets.length}\n`);
    recentTickets.forEach(t => {
      console.log(`   - Ticket ${t.ticketNumber}`);
      console.log(`     Order: ${t.order?.orderNumber || t.order}`);
      console.log(`     Station: ${t.kitchenStation}`);
      console.log(`     Status: ${t.status}`);
      console.log(`     Items: ${t.items.length}`);
    });

    // 4. Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY:');
    console.log('='.repeat(60));
    
    if (preparingOrders.length > 0 && pendingEvents.length > 0) {
      console.log('⚠️  ISSUE: Orders in preparing but events not processed');
      console.log('   → Outbox worker may not be running');
      console.log('   → Check server logs for "outbox.worker.started"');
      console.log('   → Restart the server to start the worker');
    } else if (preparingOrders.length > 0 && publishedEvents.length > 0 && recentTickets.length === 0) {
      console.log('⚠️  ISSUE: Events published but no tickets created');
      console.log('   → Check menu items have kitchenStation assigned');
      console.log('   → Check handler errors in server logs');
    } else if (preparingOrders.length > 0 && recentTickets.length > 0) {
      console.log('✅ System working: Orders → Events → Tickets');
    } else if (preparingOrders.length === 0) {
      console.log('ℹ️  No orders in preparing status to check');
    }

    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkStatus();
