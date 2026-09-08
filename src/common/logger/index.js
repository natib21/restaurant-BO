"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.morganStream = void 0;
const winston_1 = __importDefault(require("winston"));
const chalk_1 = __importDefault(require("chalk"));
const env_1 = require("../../config/env");
const colorizeLevel = winston_1.default.format(info => {
    const level = info.level.toUpperCase();
    switch (info.level) {
        case 'error':
            info.level = chalk_1.default.red(level);
            break;
        case 'warn':
            info.level = chalk_1.default.yellow(level);
            break;
        case 'info':
            info.level = chalk_1.default.cyan(level);
            break;
        case 'http':
            info.level = chalk_1.default.magenta(level);
            break;
        default:
            break;
    }
    return info;
});
const consoleFormat = winston_1.default.format.combine(colorizeLevel(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.printf(({ timestamp, level, message, requestId, userId, merchantId }) => {
    const extras = [];
    if (requestId)
        extras.push(`reqId:${requestId}`);
    if (userId)
        extras.push(`user:${userId}`);
    if (merchantId)
        extras.push(`merchant:${merchantId}`);
    const extraStr = extras.length ? chalk_1.default.gray(`[${extras.join(' ')}]`) : '';
    return `${chalk_1.default.gray(timestamp)} ${level} ${extraStr} ${message}`;
}));
const isProd = () => (0, env_1.loadEnv)().NODE_ENV === 'production';
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.Console({
            format: isProd() ? winston_1.default.format.json() : consoleFormat,
        }),
        ...(isProd()
            ? []
            : [
                new winston_1.default.transports.File({ filename: 'logs/error.log', level: 'error' }),
                new winston_1.default.transports.File({ filename: 'logs/combined.log' }),
            ]),
    ],
});
exports.logger = logger;
exports.morganStream = {
    write: (message, meta) => {
        logger.http(message.trim(), meta);
    },
};
