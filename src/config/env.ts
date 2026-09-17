import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment-specific .env file (e.g., .env.development, .env.production)
// Falls back to .env if no environment-specific file exists
const envFile = process.env.NODE_ENV 
  ? `.env.${process.env.NODE_ENV}` 
  : '.env';

dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),

  DATABASE_LOCAL: z.string().optional(),
  LOCAL_DATABASE: z.string().optional(),
  DATABASE: z.string().optional(),
  DATABASE_SECOND: z.string().optional(),
  DATABASE_PASSWORD: z.string().optional(),
  DATABASE_PASSWORD_SECOND: z.string().optional(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRE_IN: z.string().default('7d'),
  JWT_COOKIE_EXPIRES_IN: z.coerce.number().default(7),

  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.coerce.number().optional(),
  EMAIL_USERNAME: z.string().optional(),
  EMAIL_PASSWORD: z.string().optional(),

  CUSTOMER_APP_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().optional(),
  APP_URL: z.string().url().optional(),
  PUBLIC_API_BASE_URL: z.string().url().optional(),

  // ❌ DISABLED: Chapa payment integration removed (manual payment only)
  // Only 'manual' and 'telebirr' (future) providers supported
  PAYMENT_PROVIDER: z.enum(['manual', 'telebirr']).default('manual'),
  // CHAPA_API_KEY: z.string().optional(),  // Removed
  // CHAPA_API_BASE_URL: z.string().url().default('https://api.chapa.co'),  // Removed
  // CHAPA_WEBHOOK_SECRET: z.string().optional(),  // Removed
  // CHAPA_WEBHOOK_URL: z.string().url().optional(),  // Removed

  SESSION_DURATION_HOURS: z.coerce.number().default(4),
  CORS_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.coerce.boolean().default(false),
  REDIS_URL: z.string().optional(),

  // Feature flags and capability enforcement
  CAPABILITY_ENFORCEMENT: z.string().optional(),
  BRANCH_ACCESS_ENFORCEMENT: z.coerce.boolean().default(false),
  
  // System integrity audit
  INTEGRITY_CRON_ENABLED: z.string().optional(),
  INTEGRITY_CRON_INTERVAL_MS: z.coerce.number().optional(),
  INTEGRITY_SAMPLE_LIMIT: z.coerce.number().optional(),
  INTEGRITY_MAX_ISSUES_PER_AUDITOR: z.coerce.number().optional(),
  
  // Subscription trial scheduler
  SUBSCRIPTION_TRIAL_CRON_ENABLED: z.string().optional(),
  SUBSCRIPTION_TRIAL_CRON_INTERVAL_MS: z.coerce.number().optional(),
  
  // Transactional outbox worker
  OUTBOX_WORKER_ENABLED: z.string().optional(),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().optional(),
  OUTBOX_BATCH_SIZE: z.coerce.number().optional(),
  OUTBOX_MAX_RETRIES: z.coerce.number().optional(),
  OUTBOX_LOCK_TIMEOUT_MS: z.coerce.number().optional(),
  
  // Order idempotency
  ORDER_IDEMPOTENCY_PROCESSING_TTL_MINUTES: z.coerce.number().optional(),
  ORDER_IDEMPOTENCY_RETENTION_HOURS: z.coerce.number().optional(),
  ORDER_IDEMPOTENCY_WAIT_TIMEOUT_SEC: z.coerce.number().optional(),
  
  // Payment verification flags
  TELEBIRR_AUTO_LOOKUP_ENABLED: z.coerce.boolean().default(false),
  CHAPA_API_KEY: z.string().optional(),
  CHAPA_API_BASE_URL: z.string().url().optional(),
  CHAPA_WEBHOOK_SECRET: z.string().optional(),
  CHAPA_WEBHOOK_URL: z.string().url().optional(),
  
  // Sentry error tracking
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  
  // Seeder
  SUPER_ADMIN_EMAIL: z.string().optional(),
  SUPER_ADMIN_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.flatten().fieldErrors;
    console.error('Invalid environment configuration:', formatted);
    throw new Error('Environment validation failed');
  }
  cached = parsed.data;
  return cached;
}

export function getMongoUri(): string {
  const env = loadEnv();
  const isProd = env.NODE_ENV === 'production';
  console.log('Loading MongoDB URI for env', env.NODE_ENV);
  
  // Priority 1: DATABASE_SECOND (production failover with password)
  if (isProd && env.DATABASE_SECOND && env.DATABASE_PASSWORD_SECOND) {
    console.log(process.env.MONGO_URI);
    return env.DATABASE_SECOND.replace('<PASSWORD>', env.DATABASE_PASSWORD_SECOND);
  }
  
  // Priority 2: DATABASE (production primary)
  // If DATABASE_PASSWORD is set, replace placeholder; otherwise use DATABASE as-is
  if (isProd && env.DATABASE) {
    if (env.DATABASE_PASSWORD) {
      return env.DATABASE.replace('<PASSWORD>', env.DATABASE_PASSWORD);
    }
    return env.DATABASE;
  }

  // Priority 3: Development/test fallback
  return env.DATABASE_LOCAL || env.LOCAL_DATABASE || 'mongodb://127.0.0.1:27017/restaurant-bo';
}

export function getCorsOrigins(): string[] {
  const env = loadEnv();
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  if (!env.CORS_ORIGINS) return defaults;
  return [
    ...defaults,
    ...env.CORS_ORIGINS.split(',')
      .map(s => s.trim())
      .filter(Boolean),
  ];
}
