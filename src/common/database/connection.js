const mongoose = require('mongoose');
const { getMongoUri } = require('../../config/env');

const mongooseOptions = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4,
};

let isConnected = false;

async function connectDatabase() {
  console.log("connectDb Called");

  if (isConnected) return mongoose;

  const uri = getMongoUri();

  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("URI:", uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));

  try {
    await mongoose.connect(uri, mongooseOptions);
    console.log("MongoDB connected successfully");

    isConnected = true;
    return mongoose;
  } catch (error) {
    console.error("MongoDB connection error:");
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

module.exports = { connectDatabase, disconnectDatabase, getConnectionState };
