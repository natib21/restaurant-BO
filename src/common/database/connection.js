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
  await mongoose.connect(getMongoUri(), mongooseOptions);
  isConnected = true;
  return mongoose;
}

async function disconnectDatabase() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
}

function getConnectionState() {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}

module.exports = { connectDatabase, disconnectDatabase, getConnectionState };
