// Check specific orders that should have tickets
require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');
const OutboxEvent = require('./models/OutboxEvent');
const KitchenTicket = require('./models/KitchenTicket');
const Order = require('./models/orderModel');
const MenuItem = require('./src/modules/menu/model/MenuItem.model');

async function checkOrders() {
  try {
    await mongoose.connect(process.env.LOCAL_DATABASE);
    console.log('✅ Connected\n');

    // Check the two specific orders
    const orderIds = [
      '6a8ff15bb8d653289a0bb57b', // #TAKE-8-932
      '6a8ff188b8d653289a0bb6fd', // #TAKE-9-6
    ];

    for (const orderId of orderIds) {
      console.log('='.repeat(70));
      const order = await Order.findById(orderId).lean();
      if (!order) {
        console.log(`Order ${orderId} not found`);
        continue;
      }

      console.log(`\n📦 ORDER: ${order.orderNumber} (${orderId})`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Created: ${order.createdAt}`);
      console.log(`   Items: ${order.items.length}`);
      
      // Check each item
      for (const item of order.items) {
        console.log(`\n   Item: ${item.name}`);
        console.log(`     - requiresKitchen: ${item.requiresKitchen}`);
        console.log(`     - status: ${item.status}`);
        
        // Get the menu item to check if it has a station
        const menuItem = await MenuItem.findById(item.menuItem._id || item.menuItem).lean();
        if (menuItem) {
          console.log(`     - Menu Item kitchenStation: ${menuItem.kitchenStation || 'NONE'}`);
        } else {
          console.log(`     - Menu Item: NOT FOUND`);
        }
      }

      // Check outbox events for this order
      const events = await OutboxEvent.find({
        aggregateId: orderId,
        eventType: 'order:preparing'
      }).sort({ createdAt: -1 }).lean();

      console.log(`\n   📨 Outbox Events: ${events.length}`);
      events.forEach(e => {
        console.log(`     - ${e._id}: ${e.status}`);
        console.log(`       Created: ${e.createdAt}`);
        console.log(`       Published: ${e.publishedAt || 'N/A'}`);
        console.log(`       Retries: ${e.retryCount}`);
        if (e.lastError) {
          console.log(`       Error: ${e.lastError}`);
        }
      });

      // Check tickets for this order
      const tickets = await KitchenTicket.find({ order: orderId }).lean();
      console.log(`\n   🎫 Kitchen Tickets: ${tickets.length}`);
      if (tickets.length === 0) {
        console.log('     ❌ NO TICKETS FOUND');
      } else {
        tickets.forEach(t => {
          console.log(`     - ${t.ticketNumber}: ${t.status}`);
          console.log(`       Station: ${t.kitchenStation}`);
          console.log(`       Items: ${t.items.length}`);
        });
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('\nDIAGNOSTIC SUMMARY:');
    console.log('If items have requiresKitchen=true BUT kitchenStation=NONE:');
    console.log('  → Menu items need kitchenStation assigned');
    console.log('  → Run: seed menu data or update menu items');
    console.log('\nIf events are published BUT no tickets:');
    console.log('  → Handler may have failed silently');
    console.log('  → Check KitchenTicketService.createTicketsForOrder()');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

checkOrders();
