const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), 'config.env') });

process.env.NODE_ENV = 'test';
process.env.CAPABILITY_ENFORCEMENT = 'true'; // Required for production-mode code paths
process.env.DATABASE_LOCAL = process.env.DATABASE_LOCAL || process.env.DATABASE || 'mongodb://127.0.0.1:27017/restaurant-bo';
process.env.MONGO_URI_TEST =
  process.env.MONGO_URI_TEST ||
  process.env.TEST_DB_URI ||
  process.env.DATABASE_URI ||
  process.env.DATABASE_LOCAL ||
  'mongodb://127.0.0.1:27017/restaurant-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-min-16-chars';
process.env.LOG_LEVEL = 'error';
