import mongoose from 'mongoose';
import { getMongoUri } from '../../config/env';

const mongooseOptions = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4 as const,
};

let isConnected = false;

export async function connectDatabase(): Promise<typeof mongoose> {
  console.log('connectDatabase called');
  if (isConnected) return mongoose;

  const uri = getMongoUri();
  await mongoose.connect(uri, mongooseOptions);
  isConnected = true;
  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
}

export function getConnectionState(): string {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}
