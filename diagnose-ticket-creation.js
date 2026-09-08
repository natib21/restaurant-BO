// diagnose-ticket-creation.js
// Script to diagnose why tickets aren't being created when orders go to "preparing"

const mongoose = require('mongoose');
const Order = require('./models/orderModel');
const OutboxEvent = require('./models/OutboxEvent');
const KitchenTicket = require('./models/KitchenTicket');
const KitchenStation = require('./models/KitchenStation');
const MenuItem = require('./src/modules/menu/model/MenuItem.model');

async function main() {
  try {
    await mongoose.connect(
      process.env.LOCAL_DATABASE || 'mongodb://localhost:27017/MesobDb',
      { serverSelectionTimeoutMS: 5000 }
    );

    console.log('🔍 DIAGNOSING TICKET CREATION ISSUE\n');
    console.log('=' .repeat(70));

    // 1. Check recent orders
    console.log('\n📦 STEP 1: Recent Orders (last 10)');
    console.log('-'.repeat(70));
    
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('items.menuItem', 'name kitchenStation requiresKitchen')
      .lean();

    if (orders.length === 0) {
      console.log('❌ NO ORDERS FOUND');
      return;
    }

    console.log(`Found ${orders.length} orders:\n`);
    
    for (const order of orders) {
      console.log(`\nOrder: ${order.orderNumber} (${order._id})`);
      console.log(`  Status: ${order.status}`);
      console.log(`  Source: ${order.source}`);
      console.log(`  Created: ${order.createdAt}`);
      console.log(`  Items:`);
      
      for (const item of order.items) {
        const menuItem = item.menuItem;
        if (menuItem) {
          const stationStr = menuItem.kitchenStation ? '✅ Has Station' : '❌ NO STATION';
          const requiresKStr = item.requiresKitchen !== false ? '✅ Requires Kitchen' : '❌ No Kitchen';
          console.log(`    - ${menuItem.name?.en || menuItem.name} (${stationStr}, ${requiresKStr})`);
        } else {
          console.log(`    - MISSING MENU ITEM (item._id: ${item._id})`);
        }
      }
    }

    // 2. Check outbox events
    console.log('\n\n📨 STEP 2: Outbox Events (order:preparing)');
    console.log('-'.repeat(70));
    
    const outboxEvents = await OutboxEvent.find({
      eventType: 'order:preparing'
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    console.log(`Found ${outboxEvents.length} order:preparing events:\n`);

    if (outboxEvents.length === 0) {
      console.log('❌ NO OUTBOX EVENTS FOUND!');
      console.log('   This means orders are NOT creating outbox events when transitioning to "preparing"');
      console.log('\n   Possible causes:');
      console.log('   1. OrderStateMachineService is not creating outbox events');
      console.log('   2. Orders are not transitioning to "preparing" status');
      console.log('   3. Auto-routing is disabled');
    } else {
      const statusCounts = {
        pending: 0,
        processing: 0,
        published: 0,
        failed: 0
      };

      for (const event of outboxEvents) {
        statusCounts[event.status] = (statusCounts[event.status] || 0) + 1;
        
        const order = orders.find(o => o._id.toString() === event.aggregateId.toString());
        const orderInfo = order ? `${order.orderNumber}` : 'Unknown';
        
        console.log(`  Event ${event._id}:`);
        console.log(`    Order: ${orderInfo} (${event.aggregateId})`);
        console.log(`    Status: ${event.status}`);
        console.log(`    Created: ${event.createdAt}`);
        console.log(`    Retry Count: ${event.retryCount}`);
        
        if (event.lastError) {
          console.log(`    ❌ Error: ${event.lastError}`);
        }
        
        if (event.status === 'published') {
          console.log(`    ✅ Published at: ${event.publishedAt}`);
        }
        
        console.log('');
      }

      console.log('\n  Status Summary:');
      console.log(`    Pending: ${statusCounts.pending}`);
      console.log(`    Processing: ${statusCounts.processing}`);
      console.log(`    Published: ${statusCounts.published}`);
      console.log(`    Failed: ${statusCounts.failed}`);

      if (statusCounts.pending > 0) {
        console.log('\n  ⚠️  WARNING: There are PENDING events that haven\'t been processed');
        console.log('     Check if the outbox worker is running!');
        console.log('     Set OUTBOX_WORKER_ENABLED=true in your .env file');
      }

      if (statusCounts.failed > 0) {
        console.log('\n  ❌ ERROR: There are FAILED events!');
        console.log('     Check the lastError field above for details');
      }
    }

    // 3. Check kitchen stations
    console.log('\n\n🏪 STEP 3: Kitchen Stations');
    console.log('-'.repeat(70));
    
    const stations = await KitchenStation.find({ isActive: true })
      .sort({ displayOrder: 1 })
      .lean();

    console.log(`Found ${stations.length} active kitchen stations:\n`);

    if (stations.length === 0) {
      console.log('❌ NO KITCHEN STATIONS FOUND!');
      console.log('   Tickets cannot be created without at least one station');
      console.log('\n   Create a station:');
      console.log('   POST /api/v1/kitchen/stations');
      console.log('   { "name": "Main Kitchen", "code": "MAIN", "branch": "...", "merchant": "..." }');
    } else {
      for (const station of stations) {
        console.log(`  Station: ${station.name} (${station.code})`);
        console.log(`    ID: ${station._id}`);
        console.log(`    Display Order: ${station.displayOrder}`);
        console.log(`    Branch: ${station.branch}`);
        console.log('');
      }
    }

    // 4. Check kitchen tickets
    console.log('\n\n🎫 STEP 4: Kitchen Tickets (recent 10)');
    console.log('-'.repeat(70));
    
    const tickets = await KitchenTicket.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('station', 'name code')
      .lean();

    console.log(`Found ${tickets.length} tickets:\n`);

    if (tickets.length === 0) {
      console.log('❌ NO TICKETS FOUND!');
      console.log('   This is the problem - tickets are not being created');
    } else {
      for (const ticket of tickets) {
        const order = orders.find(o => o._id.toString() === ticket.order.toString());
        const orderInfo = order ? `${order.orderNumber}` : 'Unknown';
        
        console.log(`  Ticket: ${ticket.ticketNumber}`);
        console.log(`    Order: ${orderInfo}`);
        console.log(`    Station: ${ticket.station?.name || 'Unknown'} (${ticket.station?.code || 'N/A'})`);
        console.log(`    Status: ${ticket.status}`);
        console.log(`    Items: ${ticket.items.length}`);
        console.log(`    Created: ${ticket.createdAt}`);
        console.log('');
      }
    }

    // 5. Check menu items
    console.log('\n\n📋 STEP 5: Menu Items with Kitchen Stations');
    console.log('-'.repeat(70));
    
    const menuItems = await MenuItem.find({ isActive: true })
      .select('name kitchenStation requiresKitchen')
      .limit(20)
      .lean();

    const withStation = menuItems.filter(m => m.kitchenStation);
    const withoutStation = menuItems.filter(m => !m.kitchenStation);

    console.log(`Total active menu items: ${menuItems.length}`);
    console.log(`  With station assigned: ${withStation.length}`);
    console.log(`  Without station: ${withoutStation.length}\n`);

    if (withoutStation.length > 0) {
      console.log('  Items without stations (first 5):');
      for (const item of withoutStation.slice(0, 5)) {
        const name = item.name?.en || item.name || 'Unknown';
        const requiresK = item.requiresKitchen !== false ? '✅ Requires Kitchen' : '❌ No Kitchen';
        console.log(`    - ${name} (${requiresK})`);
      }
    }

    // 6. Summary and recommendations
    console.log('\n\n' + '='.repeat(70));
    console.log('📊 DIAGNOSIS SUMMARY');
    console.log('='.repeat(70));

    const issues = [];
    const solutions = [];

    if (orders.length === 0) {
      issues.push('No orders in database');
      solutions.push('Create test orders to verify ticket creation');
    }

    if (outboxEvents.length === 0) {
      issues.push('No outbox events being created');
      solutions.push('Check OrderStateMachineService.transitionOrderStatus()');
      solutions.push('Verify orders are actually transitioning to "preparing" status');
    } else {
      const pending = outboxEvents.filter(e => e.status === 'pending').length;
      const failed = outboxEvents.filter(e => e.status === 'failed').length;

      if (pending > 0) {
        issues.push(`${pending} outbox events stuck in "pending" status`);
        solutions.push('Check if outbox worker is running (OUTBOX_WORKER_ENABLED=true)');
        solutions.push('Restart the server to start the worker');
      }

      if (failed > 0) {
        issues.push(`${failed} outbox events failed to process`);
        solutions.push('Check the lastError field in failed events');
        solutions.push('Review logs for error details');
      }
    }

    if (stations.length === 0) {
      issues.push('No kitchen stations exist');
      solutions.push('Create at least one kitchen station via API or database');
    }

    if (tickets.length === 0 && outboxEvents.length > 0) {
      issues.push('Outbox events exist but no tickets created');
      solutions.push('Check KitchenTicketService.createTicketsForOrder() for errors');
      solutions.push('Review outbox worker logs for processing failures');
    }

    if (issues.length > 0) {
      console.log('\n❌ ISSUES FOUND:\n');
      issues.forEach((issue, i) => {
        console.log(`  ${i + 1}. ${issue}`);
      });

      console.log('\n💡 RECOMMENDED SOLUTIONS:\n');
      solutions.forEach((solution, i) => {
        console.log(`  ${i + 1}. ${solution}`);
      });
    } else {
      console.log('\n✅ System appears to be working correctly!');
      console.log('   If you\'re still experiencing issues, check:');
      console.log('   1. Server logs for errors');
      console.log('   2. Socket.IO client connection');
      console.log('   3. Frontend event listeners');
    }

    console.log('\n' + '='.repeat(70));
    console.log('');

  } catch (error) {
    console.error('❌ Error during diagnosis:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

main();
