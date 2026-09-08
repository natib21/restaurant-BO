// test-ticket-creation-fix.js
// Test if the ticket creation fix works

const mongoose = require('mongoose');
const { OrderService } = require('./src/modules/order/service/OrderService');
const OutboxEvent = require('./models/OutboxEvent');
const KitchenTicket = require('./models/KitchenTicket');
const MenuItem = require('./src/modules/menu/model/MenuItem.model');

async function main() {
  try {
    await mongoose.connect(
      process.env.LOCAL_DATABASE || 'mongodb://localhost:27017/MesobDb',
      { serverSelectionTimeoutMS: 5000 }
    );

    console.log('🧪 TESTING TICKET CREATION FIX\n');
    console.log('='.repeat(70));

    // Get a menu item with a kitchen station
    const menuItem = await MenuItem.findOne({
      kitchenStation: { $ne: null },
      isActive: true
    }).lean();

    if (!menuItem) {
      console.log('❌ No menu items with kitchen stations found');
      console.log('   Create a menu item first');
      return;
    }

    console.log(`✅ Using menu item: ${menuItem.name?.en || menuItem.name}`);
    console.log(`   Station assigned: ${!!menuItem.kitchenStation}`);

    // Create a test order
    console.log('\n📦 Creating test order...');
    
    const order = await OrderService.staffPlaceOrder({
      items: [{ menuItemId: menuItem._id.toString(), quantity: 1 }],
      orderType: 'takeaway',
      customerName: 'Test Customer',
      branchId: menuItem.branch || '6a8ec73063250432ef9646dd',  // Use menu item's branch
      merchantId: menuItem.merchant || '6a8ec6f963250432ef96468c',  // Use menu item's merchant
      source: 'admin',
      performedBy: null,
      performedByName: 'Test',
    });

    console.log(`✅ Order created: ${order.orderNumber}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   ID: ${order._id}`);

    // Wait for outbox worker to process
    console.log('\n⏳ Waiting 3 seconds for outbox worker...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check outbox events
    console.log('\n📨 Checking outbox events...');
    const events = await OutboxEvent.find({
      aggregateId: order._id,
      eventType: 'order:preparing'
    }).lean();

    if (events.length === 0) {
      console.log('❌ NO order:preparing EVENT CREATED!');
      console.log('   The fix did not work');
    } else {
      console.log(`✅ Found ${events.length} order:preparing event(s):`);
      for (const event of events) {
        console.log(`   - Status: ${event.status}`);
        console.log(`   - Created: ${event.createdAt}`);
        if (event.publishedAt) {
          console.log(`   - Published: ${event.publishedAt}`);
        }
        if (event.lastError) {
          console.log(`   - Error: ${event.lastError}`);
        }
      }
    }

    // Check kitchen tickets
    console.log('\n🎫 Checking kitchen tickets...');
    const tickets = await KitchenTicket.find({
      order: order._id
    }).populate('station', 'name code').lean();

    if (tickets.length === 0) {
      console.log('❌ NO TICKETS CREATED!');
      console.log('   Check outbox worker logs for errors');
    } else {
      console.log(`✅ Found ${tickets.length} ticket(s):`);
      for (const ticket of tickets) {
        console.log(`   - Ticket: ${ticket.ticketNumber}`);
        console.log(`   - Station: ${ticket.station?.name || 'Unknown'}`);
        console.log(`   - Status: ${ticket.status}`);
        console.log(`   - Items: ${ticket.items.length}`);
        ticket.items.forEach(item => {
          console.log(`     * ${item.menuItemName} (qty: ${item.quantity})`);
        });
      }
    }

    console.log('\n' + '='.repeat(70));
    
    if (events.length > 0 && tickets.length > 0) {
      console.log('✅ SUCCESS! Ticket creation is working!');
    } else if (events.length > 0 && tickets.length === 0) {
      console.log('⚠️  Event created but no ticket - check outbox worker');
    } else {
      console.log('❌ FAILED! Tickets still not being created');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

main();
