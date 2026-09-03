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
exports.logger = exports.morganStream = void 0;
var winston_1 = __importDefault(require("winston"));
var chalk_1 = __importDefault(require("chalk"));
var env_1 = require("../../config/env");
var colorizeLevel = winston_1.default.format(function (info) {
    var level = info.level.toUpperCase();
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
var consoleFormat = winston_1.default.format.combine(colorizeLevel(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.printf(function (_a) {
    var timestamp = _a.timestamp, level = _a.level, message = _a.message, requestId = _a.requestId, userId = _a.userId, merchantId = _a.merchantId;
    var extras = [];
    if (requestId)
        extras.push("reqId:".concat(requestId));
    if (userId)
        extras.push("user:".concat(userId));
    if (merchantId)
        extras.push("merchant:".concat(merchantId));
    var extraStr = extras.length ? chalk_1.default.gray("[".concat(extras.join(' '), "]")) : '';
    return "".concat(chalk_1.default.gray(timestamp), " ").concat(level, " ").concat(extraStr, " ").concat(message);
}));
var isProd = function () { return (0, env_1.loadEnv)().NODE_ENV === 'production'; };
var logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: __spreadArray([
        new winston_1.default.transports.Console({
            format: isProd() ? winston_1.default.format.json() : consoleFormat,
        })
    ], (isProd()
        ? []
        : [
            new winston_1.default.transports.File({ filename: 'logs/error.log', level: 'error' }),
            new winston_1.default.transports.File({ filename: 'logs/combined.log' }),
        ]), true),
});
exports.logger = logger;
exports.morganStream = {
    write: function (message, meta) {
        logger.http(message.trim(), meta);
    },
};
