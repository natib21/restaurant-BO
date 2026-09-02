// check-recent-orders.js
// Check if recent orders have outbox events

const mongoose = require('mongoose');
const Order = require('./models/orderModel');
const OutboxEvent = require('./models/OutboxEvent');

async function main() {
  try {
    await mongoose.connect(
      process.env.LOCAL_DATABASE || 'mongodb://localhost:27017/MesobDb',
      { serverSelectionTimeoutMS: 5000 }
    );

    console.log('🔍 CHECKING RECENT ORDERS FOR OUTBOX EVENTS\n');

    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    for (const order of recentOrders) {
      console.log(`\nOrder: ${order.orderNumber} (${order._id})`);
      console.log(`  Status: ${order.status}`);
      console.log(`  Created: ${order.createdAt}`);
      console.log(`  Source: ${order.source}`);

      const events = await OutboxEvent.find({
        aggregateId: order._id
      }).sort({ createdAt: 1 }).lean();

      console.log(`  Outbox Events: ${events.length}`);
      
      if (events.length === 0) {
        console.log(`  ❌ NO EVENTS FOUND FOR THIS ORDER`);
        console.log(`     This order did NOT create an outbox event!`);
      } else {
        for (const event of events) {
          console.log(`    - ${event.eventType}: ${event.status} (created: ${event.createdAt})`);
        }
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

main();
