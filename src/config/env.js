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
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), 'config.env') });
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
    // ⚠️ Interim mitigation: shortened from 7d to 24h until proper token revocation on logout implemented
    JWT_EXPIRE_IN: zod_1.z.string().default('24h'),
    JWT_COOKIE_EXPIRES_IN: zod_1.z.coerce.number().default(7),
    EMAIL_HOST: zod_1.z.string().optional(),
    EMAIL_PORT: zod_1.z.coerce.number().optional(),
    EMAIL_USERNAME: zod_1.z.string().optional(),
    EMAIL_PASSWORD: zod_1.z.string().optional(),
    CUSTOMER_APP_URL: zod_1.z.string().url().optional(),
    FRONTEND_URL: zod_1.z.string().url().optional(),
    APP_URL: zod_1.z.string().url().optional(),
    PUBLIC_API_BASE_URL: zod_1.z.string().url().optional(),
    PAYMENT_PROVIDER: zod_1.z.enum(['manual', 'chapa', 'telebirr']).default('manual'),
    CHAPA_API_KEY: zod_1.z.string().optional(),
    CHAPA_API_BASE_URL: zod_1.z.string().url().default('https://api.chapa.co'),
    CHAPA_WEBHOOK_SECRET: zod_1.z.string().optional(),
    CHAPA_WEBHOOK_URL: zod_1.z.string().url().optional(),
    TELEBIRR_AUTO_LOOKUP_ENABLED: zod_1.z.coerce.boolean().default(false),
    TELEBIRR_ALLOWED_DOMAINS: zod_1.z.string().optional(),
    CBE_ALLOWED_DOMAINS: zod_1.z.string().optional(),
    CBE_BIRR_ALLOWED_DOMAINS: zod_1.z.string().optional(),
    PAYMENT_MAX_DOWNLOAD_SIZE_MB: zod_1.z.coerce.number().default(10),
    PAYMENT_MAX_REDIRECTS: zod_1.z.coerce.number().default(3),
    PAYMENT_REQUEST_TIMEOUT_MS: zod_1.z.coerce.number().default(15000),
    PAYMENT_RETRY_MAX: zod_1.z.coerce.number().default(2),
    PAYMENT_RETRY_DELAY_MS: zod_1.z.coerce.number().default(1000),
    SESSION_DURATION_HOURS: zod_1.z.coerce.number().default(4),
    CORS_ORIGINS: zod_1.z.string().optional(),
    TRUST_PROXY: zod_1.z.coerce.boolean().default(false),
    REDIS_URL: zod_1.z.string().optional(),
    // ✅ P0-002: Capability enforcement configuration
    CAPABILITY_ENFORCEMENT: zod_1.z.string().default('true').optional(),
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
    if (isProd && env.DATABASE_SECOND && env.DATABASE_PASSWORD_SECOND) {
        console.log(process.env.MONGO_URI);
        return env.DATABASE_SECOND.replace('<PASSWORD>', env.DATABASE_PASSWORD_SECOND);
    }
    if (isProd && env.DATABASE && env.DATABASE_PASSWORD) {
        console.log(process.env.MONGO_URI);
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
