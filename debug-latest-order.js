// debug-latest-order.js
// Debug the absolute latest order to see what's happening

const mongoose = require('mongoose');
const Order = require('./models/orderModel');
const OutboxEvent = require('./models/OutboxEvent');
const KitchenTicket = require('./models/KitchenTicket');

async function main() {
  try {
    await mongoose.connect(
      process.env.LOCAL_DATABASE || 'mongodb://localhost:27017/MesobDb',
      { serverSelectionTimeoutMS: 5000 }
    );

    console.log('🔍 DEBUGGING LATEST ORDER\n');

    // Get the absolute latest order
    const order = await Order.findOne()
      .sort({ createdAt: -1 })
      .lean();

    if (!order) {
      console.log('❌ No orders found');
      return;
    }

    console.log('📦 LATEST ORDER:');
    console.log('  Order Number:', order.orderNumber);
    console.log('  Order ID:', order._id);
    console.log('  Status:', order.status);
    console.log('  Source:', order.source);
    console.log('  Created:', order.createdAt);
    console.log('  Items:');
    
    for (const item of order.items) {
      console.log(`    - ${item.name}`);
      console.log(`      Requires Kitchen: ${item.requiresKitchen !== false ? 'YES' : 'NO'}`);
    }

    // Check ALL outbox events for this order
    console.log('\n📨 ALL OUTBOX EVENTS FOR THIS ORDER:');
    const allEvents = await OutboxEvent.find({ aggregateId: order._id })
      .sort({ createdAt: 1 })
      .lean();

    console.log(`  Total events: ${allEvents.length}\n`);
    
    const eventTypes = {};
    for (const event of allEvents) {
      eventTypes[event.eventType] = (eventTypes[event.eventType] || 0) + 1;
      
      console.log(`  Event: ${event.eventType}`);
      console.log(`    ID: ${event._id}`);
      console.log(`    Status: ${event.status}`);
      console.log(`    Created: ${event.createdAt}`);
      console.log(`    Retry Count: ${event.retryCount}`);
      
      if (event.status === 'published' && event.publishedAt) {
        console.log(`    Published: ${event.publishedAt}`);
      }
      
      if (event.lastError) {
        console.log(`    ❌ ERROR: ${event.lastError}`);
      }
      console.log('');
    }

    console.log('  Event Type Summary:');
    for (const [type, count] of Object.entries(eventTypes)) {
      console.log(`    ${type}: ${count}`);
    }

    // Check if order:preparing event exists
    const preparingEvent = allEvents.find(e => e.eventType === 'order:preparing');
    
    if (!preparingEvent) {
      console.log('\n❌ CRITICAL: NO order:preparing EVENT!');
      console.log('   This is why tickets are not being created');
      console.log('\n   Possible causes:');
      console.log('   1. OrderStateMachineService not reaching the if (toStatus === "preparing") block');
      console.log('   2. Error thrown before event creation');
      console.log('   3. Transaction rollback');
      console.log('   4. Code not deployed/server not restarted');
    } else {
      console.log('\n✅ order:preparing event EXISTS');
      console.log(`   Status: ${preparingEvent.status}`);
      
      if (preparingEvent.status === 'pending') {
        console.log('   ⚠️  Event is PENDING - outbox worker not processing it');
        console.log('   Check if OUTBOX_WORKER_ENABLED=true');
      } else if (preparingEvent.status === 'failed') {
        console.log(`   ❌ Event FAILED: ${preparingEvent.lastError}`);
      } else if (preparingEvent.status === 'published') {
        console.log('   ✅ Event was processed successfully');
      }
    }

    // Check kitchen tickets
    console.log('\n🎫 KITCHEN TICKETS FOR THIS ORDER:');
    const tickets = await KitchenTicket.find({ order: order._id })
      .populate('station', 'name code')
      .lean();

    if (tickets.length === 0) {
      console.log('  ❌ NO TICKETS FOUND');
      
      if (preparingEvent) {
        console.log('\n  Event exists but no ticket → Check:');
        console.log('  1. KitchenTicketService.createTicketsForOrder() logs');
        console.log('  2. Outbox worker execution');
        console.log('  3. Menu items have requiresKitchen=true');
        console.log('  4. Kitchen stations exist');
      }
    } else {
      console.log(`  ✅ Found ${tickets.length} ticket(s):\n`);
      for (const ticket of tickets) {
        console.log(`  Ticket: ${ticket.ticketNumber}`);
        console.log(`    Station: ${ticket.station?.name || 'Unknown'}`);
        console.log(`    Status: ${ticket.status}`);
        console.log(`    Items: ${ticket.items.length}`);
        console.log('');
      }
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 DIAGNOSIS:');
    console.log('='.repeat(70));
    
    if (!preparingEvent) {
      console.log('❌ ROOT CAUSE: order:preparing event not being created');
      console.log('\nNEXT STEPS:');
      console.log('1. Check if server was restarted after code changes');
      console.log('2. Check server logs for errors during order creation');
      console.log('3. Add console.log in OrderStateMachineService to confirm code path');
      console.log('4. Verify the fix was actually deployed');
    } else if (preparingEvent.status === 'pending') {
      console.log('❌ ROOT CAUSE: Outbox worker not running');
      console.log('\nNEXT STEPS:');
      console.log('1. Check OUTBOX_WORKER_ENABLED environment variable');
      console.log('2. Restart server to start the worker');
      console.log('3. Check server logs for outbox worker startup message');
    } else if (preparingEvent.status === 'failed') {
      console.log(`❌ ROOT CAUSE: Event processing failed: ${preparingEvent.lastError}`);
      console.log('\nNEXT STEPS:');
      console.log('1. Check the error message above');
      console.log('2. Fix the underlying issue');
      console.log('3. Reset event status to pending to retry');
    } else if (tickets.length === 0) {
      console.log('❌ ROOT CAUSE: Event processed but ticket not created');
      console.log('\nNEXT STEPS:');
      console.log('1. Check KitchenTicketService logs');
      console.log('2. Verify menu items have stations or fallback works');
      console.log('3. Check if kitchen stations exist');
    } else {
      console.log('✅ EVERYTHING WORKING! Tickets created successfully');
    }

    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

main();
