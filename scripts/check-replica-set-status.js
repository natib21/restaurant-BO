/**
 * Script to verify MongoDB replica set configuration
 * Required for transaction support in Route 3 publish migration
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

async function checkReplicaSetStatus() {
  try {
    console.log('='.repeat(70));
    console.log('MongoDB Replica Set Status Check');
    console.log('='.repeat(70));
    console.log('');

    // Connect to MongoDB
    const mongoUri = process.env.DATABASE || process.env.MONGO_URI;
    console.log(`Connecting to: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    console.log('');

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    console.log('');

    // Get database connection
    const db = mongoose.connection.db;
    const admin = db.admin();

    // Check replica set status
    console.log('Checking replica set configuration...');
    console.log('');

    try {
      const replSetStatus = await admin.command({ replSetGetStatus: 1 });
      
      console.log('✅ REPLICA SET DETECTED');
      console.log('');
      console.log('Replica Set Name:', replSetStatus.set);
      console.log('Replica Set Members:', replSetStatus.members.length);
      console.log('');
      console.log('Member Details:');
      replSetStatus.members.forEach((member, index) => {
        console.log(`  ${index + 1}. ${member.name}`);
        console.log(`     State: ${member.stateStr}`);
        console.log(`     Health: ${member.health === 1 ? 'Healthy' : 'Unhealthy'}`);
        if (member.stateStr === 'PRIMARY') {
          console.log(`     ⭐ PRIMARY NODE`);
        }
        console.log('');
      });

      console.log('Transaction Support: ✅ AVAILABLE');
      console.log('');
      console.log('Result: MongoDB is configured as a replica set.');
      console.log('Route 3 transaction implementation can proceed.');
      
    } catch (error) {
      if (error.codeName === 'NoReplicationEnabled' || error.code === 76) {
        console.log('❌ STANDALONE INSTANCE DETECTED');
        console.log('');
        console.log('Error:', error.codeName || error.message);
        console.log('');
        console.log('Transaction Support: ❌ NOT AVAILABLE');
        console.log('');
        console.log('⚠️  CRITICAL: Multi-document transactions require a replica set.');
        console.log('');
        console.log('Resolution Options:');
        console.log('1. Convert standalone to replica set (development):');
        console.log('   - Stop MongoDB: mongod --shutdown');
        console.log('   - Start with replica set: mongod --replSet rs0 --port 27017');
        console.log('   - Initialize: mongo --eval "rs.initiate()"');
        console.log('');
        console.log('2. Use MongoDB Atlas (cloud, automatic replica set)');
        console.log('3. Deploy multi-node replica set (production)');
        console.log('');
        console.log('⛔ DO NOT PROCEED TO PHASE C until replica set is configured.');
        
        process.exit(1);
      } else {
        throw error;
      }
    }

  } catch (error) {
    console.error('❌ Error checking MongoDB configuration:');
    console.error(error.message);
    console.error('');
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('');
    console.log('Connection closed.');
    console.log('='.repeat(70));
  }
}

checkReplicaSetStatus();
