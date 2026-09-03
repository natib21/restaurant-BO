const mongoose = require('mongoose');
const { getMongoUri } = require('../../config/env');

const mongooseOptions = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4,
};

let isConnected = false;

async function connectDatabase() {
  if (isConnected) return mongoose;

  const uri = getMongoUri();

  try {
    await mongoose.connect(uri, mongooseOptions);
    console.log('MongoDB connected successfully');

    isConnected = true;
    return mongoose;
  } catch (error) {
    console.error('MongoDB connection error:');
    console.error(error);
    throw error;
  }
}

async function disconnectDatabase() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
}

function getConnectionState() {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}

/**
 * Get MongoDB replica set status (if running replica set)
 * Returns replica set info, primary status, etc.
 * Useful for health checks in production where replica set status matters
 */
async function getReplicaSetStatus() {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return { status: 'not_connected' };
    }

    // Try to get replica set status from admin database
    const admin = mongoose.connection.db.admin();
    const status = await admin.replSetGetStatus().catch(() => null);

    if (!status) {
      return { status: 'not_replicated', message: 'Not a replica set' };
    }

    const currentMember = status.members.find(m => m.self === true);
    return {
      status: 'replicated',
      replica_set: status.set,
      current_role: currentMember?.stateStr || 'unknown',
      members_count: status.members.length,
      healthy_members: status.members.filter(m => m.health === 1).length,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message,
    };
  }
}

module.exports = { connectDatabase, disconnectDatabase, getConnectionState, getReplicaSetStatus };
