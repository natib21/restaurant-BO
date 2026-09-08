/**
 * Fix Existing Ticket Branch Assignments
 * Updates all tickets to use their station's branch instead of order's branch
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

const KitchenTicket = require('./models/KitchenTicket');
const KitchenStation = require('./models/KitchenStation');

async function fix() {
  try {
    const DB = process.env.DATABASE_LOCAL || process.env.DATABASE;
    await mongoose.connect(DB);
    console.log('✅ Connected to database\n');

    const tickets = await KitchenTicket.find({});
    console.log(`Found ${tickets.length} tickets to check\n`);

    let fixed = 0;

    for (const ticket of tickets) {
      const station = await KitchenStation.findById(ticket.station);
      
      if (!station) {
        console.log(`⚠️  Ticket ${ticket.ticketNumber}: Station not found (${ticket.station})`);
        continue;
      }

      if (ticket.branch.toString() !== station.branch.toString()) {
        console.log(`🔧 Fixing ticket ${ticket.ticketNumber}:`);
        console.log(`   Old branch: ${ticket.branch}`);
        console.log(`   New branch: ${station.branch} (from station)`);
        
        await KitchenTicket.updateOne(
          { _id: ticket._id },
          { $set: { branch: station.branch } }
        );
        
        fixed++;
      } else {
        console.log(`✅ Ticket ${ticket.ticketNumber}: Already correct`);
      }
    }

    console.log(`\n✅ Fixed ${fixed} tickets`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fix();
