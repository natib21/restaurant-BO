const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), 'config.env') });

function loadEnv() {
  const env = process.env;
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 16) {
    throw new Error('JWT_SECRET must be at least 16 characters (set in config.env)');
  }
  return env;
}

function getMongoUri() {
  const env = loadEnv();
  const isProd = env.NODE_ENV === 'production';

  if (isProd && env.DATABASE_SECOND && env.DATABASE_PASSWORD_SECOND) {
    return env.DATABASE_SECOND.replace('<PASSWORD>', env.DATABASE_PASSWORD_SECOND);
  }
  if (isProd && env.DATABASE && env.DATABASE_PASSWORD) {
    return env.DATABASE.replace('<PASSWORD>', env.DATABASE_PASSWORD);
  }

  return env.DATABASE_LOCAL || env.LOCAL_DATABASE || 'mongodb://127.0.0.1:27017/restaurant-bo';
}

function getCorsOrigins() {
  const env = loadEnv();
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'https://restaurant-bo.onrender.com',
  ];
  if (!env.CORS_ORIGINS) return defaults;
  return [...defaults, ...env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)];
}

module.exports = { loadEnv, getMongoUri, getCorsOrigins };
