"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEnv = loadEnv;
exports.getMongoUri = getMongoUri;
exports.getCorsOrigins = getCorsOrigins;
var zod_1 = require("zod");
var dotenv_1 = __importDefault(require("dotenv"));
var path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), 'config.env') });
var envSchema = zod_1.z.object({
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
    PAYMENT_PROVIDER: zod_1.z.enum(['manual', 'chapa', 'telebirr']).default('manual'),
    CHAPA_API_KEY: zod_1.z.string().optional(),
    CHAPA_API_BASE_URL: zod_1.z.string().url().default('https://api.chapa.co'),
    CHAPA_WEBHOOK_SECRET: zod_1.z.string().optional(),
    CHAPA_WEBHOOK_URL: zod_1.z.string().url().optional(),
    SESSION_DURATION_HOURS: zod_1.z.coerce.number().default(4),
    CORS_ORIGINS: zod_1.z.string().optional(),
    TRUST_PROXY: zod_1.z.coerce.boolean().default(false),
    REDIS_URL: zod_1.z.string().optional(),
});
var cached = null;
function loadEnv() {
    if (cached)
        return cached;
    var parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
        var formatted = parsed.error.flatten().fieldErrors;
        console.error('Invalid environment configuration:', formatted);
        throw new Error('Environment validation failed');
    }
    cached = parsed.data;
    return cached;
}
function getMongoUri() {
    var env = loadEnv();
    var isProd = env.NODE_ENV === 'production';
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
    var env = loadEnv();
    var defaults = [
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
    return __spreadArray(__spreadArray([], defaults, true), env.CORS_ORIGINS.split(',')
        .map(function (s) { return s.trim(); })
        .filter(Boolean), true);
}
