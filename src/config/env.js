"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEnv = loadEnv;
exports.getMongoUri = getMongoUri;
exports.getCorsOrigins = getCorsOrigins;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment-specific .env file (e.g., .env.development, .env.production)
// Falls back to .env if no environment-specific file exists
const envFile = process.env.NODE_ENV
    ? `.env.${process.env.NODE_ENV}`
    : '.env';
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), envFile) });
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.coerce.number().default(3000),
    LOG_LEVEL: zod_1.z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
    DATABASE_LOCAL: zod_1.z.string().optional(),
    LOCAL_DATABASE: zod_1.z.string().optional(),
    DATABASE: zod_1.z.string().optional(),
    DATABASE_SECOND: zod_1.z.string().optional(),
    DATABASE_PASSWORD: zod_1.z.string().optional(),
    DATABASE_PASSWORD_SECOND: zod_1.z.string().optional(),
    JWT_SECRET: zod_1.z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    JWT_EXPIRE_IN: zod_1.z.string().default('7d'),
    JWT_COOKIE_EXPIRES_IN: zod_1.z.coerce.number().default(7),
    EMAIL_HOST: zod_1.z.string().optional(),
    EMAIL_PORT: zod_1.z.coerce.number().optional(),
    EMAIL_USERNAME: zod_1.z.string().optional(),
    EMAIL_PASSWORD: zod_1.z.string().optional(),
    CUSTOMER_APP_URL: zod_1.z.string().url().optional(),
    FRONTEND_URL: zod_1.z.string().url().optional(),
    APP_URL: zod_1.z.string().url().optional(),
    PUBLIC_API_BASE_URL: zod_1.z.string().url().optional(),
    // ❌ DISABLED: Chapa payment integration removed (manual payment only)
    // Only 'manual' and 'telebirr' (future) providers supported
    PAYMENT_PROVIDER: zod_1.z.enum(['manual', 'telebirr']).default('manual'),
    // CHAPA_API_KEY: z.string().optional(),  // Removed
    // CHAPA_API_BASE_URL: z.string().url().default('https://api.chapa.co'),  // Removed
    // CHAPA_WEBHOOK_SECRET: z.string().optional(),  // Removed
    // CHAPA_WEBHOOK_URL: z.string().url().optional(),  // Removed
    SESSION_DURATION_HOURS: zod_1.z.coerce.number().default(4),
    CORS_ORIGINS: zod_1.z.string().optional(),
    TRUST_PROXY: zod_1.z.coerce.boolean().default(false),
    REDIS_URL: zod_1.z.string().optional(),
    // Feature flags and capability enforcement
    CAPABILITY_ENFORCEMENT: zod_1.z.string().optional(),
    BRANCH_ACCESS_ENFORCEMENT: zod_1.z.coerce.boolean().default(false),
    // System integrity audit
    INTEGRITY_CRON_ENABLED: zod_1.z.string().optional(),
    INTEGRITY_CRON_INTERVAL_MS: zod_1.z.coerce.number().optional(),
    INTEGRITY_SAMPLE_LIMIT: zod_1.z.coerce.number().optional(),
    INTEGRITY_MAX_ISSUES_PER_AUDITOR: zod_1.z.coerce.number().optional(),
    // Subscription trial scheduler
    SUBSCRIPTION_TRIAL_CRON_ENABLED: zod_1.z.string().optional(),
    SUBSCRIPTION_TRIAL_CRON_INTERVAL_MS: zod_1.z.coerce.number().optional(),
    // Transactional outbox worker
    OUTBOX_WORKER_ENABLED: zod_1.z.string().optional(),
    OUTBOX_POLL_INTERVAL_MS: zod_1.z.coerce.number().optional(),
    OUTBOX_BATCH_SIZE: zod_1.z.coerce.number().optional(),
    OUTBOX_MAX_RETRIES: zod_1.z.coerce.number().optional(),
    OUTBOX_LOCK_TIMEOUT_MS: zod_1.z.coerce.number().optional(),
    // Order idempotency
    ORDER_IDEMPOTENCY_PROCESSING_TTL_MINUTES: zod_1.z.coerce.number().optional(),
    ORDER_IDEMPOTENCY_RETENTION_HOURS: zod_1.z.coerce.number().optional(),
    ORDER_IDEMPOTENCY_WAIT_TIMEOUT_SEC: zod_1.z.coerce.number().optional(),
    // Payment verification flags
    TELEBIRR_AUTO_LOOKUP_ENABLED: zod_1.z.coerce.boolean().default(false),
    CHAPA_API_KEY: zod_1.z.string().optional(),
    CHAPA_API_BASE_URL: zod_1.z.string().url().optional(),
    CHAPA_WEBHOOK_SECRET: zod_1.z.string().optional(),
    CHAPA_WEBHOOK_URL: zod_1.z.string().url().optional(),
    // Sentry error tracking
    SENTRY_DSN: zod_1.z.string().optional(),
    SENTRY_ENVIRONMENT: zod_1.z.string().optional(),
    // Seeder
    SUPER_ADMIN_EMAIL: zod_1.z.string().optional(),
    SUPER_ADMIN_PASSWORD: zod_1.z.string().optional(),
});
let cached = null;
function loadEnv() {
    if (cached)
        return cached;
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
        const formatted = parsed.error.flatten().fieldErrors;
        console.error('Invalid environment configuration:', formatted);
        throw new Error('Environment validation failed');
    }
    cached = parsed.data;
    return cached;
}
function getMongoUri() {
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
function getCorsOrigins() {
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
    if (!env.CORS_ORIGINS)
        return defaults;
    return [
        ...defaults,
        ...env.CORS_ORIGINS.split(',')
            .map(s => s.trim())
            .filter(Boolean),
    ];
}
