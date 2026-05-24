import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'config.env') });

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

  KISPAY_API_KEY: z.string().optional(),
  KISPAY_CLIENT_ID: z.string().optional(),
  KISPAY_API_BASE_URL: z.string().url().default('https://api.kispay.et'),
  KISPAY_WEBHOOK_SECRET: z.string().optional(),
  KISPAY_WEBHOOK_URL: z.string().url().optional(),

  SESSION_DURATION_HOURS: z.coerce.number().default(4),
  CORS_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.coerce.boolean().default(false),
  REDIS_URL: z.string().optional(),
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
  return cached.data;
}

export function getMongoUri(): string {
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

export function getCorsOrigins(): string[] {
  const env = loadEnv();
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
  ];
  if (!env.CORS_ORIGINS) return defaults;
  return [...defaults, ...env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)];
}
