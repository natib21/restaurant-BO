/**
 * Debug Ticket Branch Mismatch
 * Check if tickets have correct branch assignments
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

const KitchenTicket = require('./models/KitchenTicket');
const KitchenStation = require('./models/KitchenStation');

async function debug() {
  try {
    const DB = process.env.DATABASE_LOCAL || process.env.DATABASE;
    await mongoose.connect(DB);
    console.log('✅ Connected to database\n');

    // Get all tickets
    const tickets = await KitchenTicket.find({})
      .populate('station', 'name code branch')
      .lean();

    console.log(`📍 Found ${tickets.length} tickets:\n`);
    
    tickets.forEach(t => {
      console.log(`Ticket: ${t.ticketNumber}`);
      console.log(`  Order ID: ${t.order}`);
      console.log(`  Station: ${t.station?.name} (${t.station?._id})`);
      console.log(`  Station Branch: ${t.station?.branch}`);
      console.log(`  Ticket Branch: ${t.branch}`);
      console.log(`  Ticket Merchant: ${t.merchant}`);
      console.log(`  Status: ${t.status}`);
      console.log('');
    });

    // Get station details
    console.log('📍 Kitchen Station Details:\n');
    const stations = await KitchenStation.find({}).lean();
    stations.forEach(s => {
      console.log(`Station: ${s.name} (${s.code})`);
      console.log(`  ID: ${s._id}`);
      console.log(`  Branch: ${s.branch}`);
      console.log(`  Merchant: ${s.merchant}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debug();
