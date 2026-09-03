"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSocketServer = createSocketServer;
exports.getIo = getIo;
var http_1 = __importDefault(require("http"));
var socket_io_1 = require("socket.io");
var jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
var util_1 = require("util");
var logger_1 = require("../../common/logger");
var env_1 = require("../../config/env");
var User = require('../../../models/userModel');
var CustomerSession = require('../../../models/customerSessionModule');
var Order = require('../../../models/orderModel');
var verifyJwt = (0, util_1.promisify)(jsonwebtoken_1.default.verify);
var io = null;
/**
 * Parse cookies from cookie header string
 */
function parseCookies(cookieHeader) {
    var cookies = {};
    if (!cookieHeader)
        return cookies;
    cookieHeader.split(';').forEach(function (cookie) {
        var _a = cookie.split('='), name = _a[0], rest = _a.slice(1);
        if (name && rest.length) {
            cookies[name.trim()] = rest.join('=').trim();
        }
    });
    return cookies;
}
/**
 * Authenticate staff socket connection via JWT token
 * Supports token from:
 * 1. socket.handshake.auth.token (client-provided)
 * 2. Authorization header (Bearer token)
 * 3. HttpOnly cookie (jwt or token)
 */
function authenticateStaffSocket(socket, next) {
    return __awaiter(this, void 0, void 0, function () {
        var token, cookieHeader, cookies, env, decoded, user, _a;
        var _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    _g.trys.push([0, 3, , 4]);
                    token = ((_b = socket.handshake.auth) === null || _b === void 0 ? void 0 : _b.token) ||
                        ((_d = (_c = socket.handshake.headers.authorization) === null || _c === void 0 ? void 0 : _c.split(' ')) === null || _d === void 0 ? void 0 : _d[1]);
                    // If no token in auth or header, check cookies (for HttpOnly cookies)
                    if (!token) {
                        cookieHeader = socket.handshake.headers.cookie;
                        cookies = parseCookies(cookieHeader);
                        token = cookies.jwt || cookies.token; // Try both 'jwt' and 'token' cookie names
                        if (token) {
                            logger_1.logger.info('socket.auth.cookie', {
                                socketId: socket.id,
                                cookieName: cookies.jwt ? 'jwt' : 'token',
                                tokenPreview: token.substring(0, 20) + '...'
                            });
                        }
                    }
                    if (!token) {
                        logger_1.logger.warn('socket.auth.failed', {
                            socketId: socket.id,
                            reason: 'No token found in auth, header, or cookies',
                            hasAuth: !!((_e = socket.handshake.auth) === null || _e === void 0 ? void 0 : _e.token),
                            hasAuthHeader: !!socket.handshake.headers.authorization,
                            hasCookie: !!socket.handshake.headers.cookie,
                        });
                        return [2 /*return*/, next(new Error('Authentication required'))];
                    }
                    env = (0, env_1.loadEnv)();
                    return [4 /*yield*/, verifyJwt(token, env.JWT_SECRET)];
                case 1:
                    decoded = _g.sent();
                    return [4 /*yield*/, User.findById(decoded.id)
                            .populate({
                            path: 'role',
                            select: 'name tasks',
                            populate: { path: 'tasks', select: 'name endpoint method' },
                        })
                            .populate('merchant', '_id businessName')];
                case 2:
                    user = _g.sent();
                    if (!user || !user.isActive) {
                        return [2 /*return*/, next(new Error('User not found or inactive'))];
                    }
                    socket.data.user = user;
                    socket.data.userType = 'staff';
                    socket.data.permissions = (((_f = user.role) === null || _f === void 0 ? void 0 : _f.tasks) || [])
                        .map(function (t) { return t.name; })
                        .filter(Boolean);
                    next();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _g.sent();
                    next(new Error('Invalid or expired token'));
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Authenticate customer socket connection via session token
 */
function authenticateCustomerSocket(socket, next) {
    return __awaiter(this, void 0, void 0, function () {
        var sessionToken, session, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    sessionToken = (_a = socket.handshake.auth) === null || _a === void 0 ? void 0 : _a.sessionToken;
                    if (!sessionToken) {
                        return [2 /*return*/, next(new Error('Session token required'))];
                    }
                    return [4 /*yield*/, CustomerSession.findOne({
                            token: sessionToken,
                            isActive: true,
                            expiresAt: { $gt: new Date() },
                        }).lean()];
                case 1:
                    session = _b.sent();
                    if (!session) {
                        return [2 /*return*/, next(new Error('Invalid or expired session'))];
                    }
                    socket.data.session = session;
                    socket.data.userType = 'customer';
                    socket.data.merchantId = session.merchant;
                    socket.data.branchId = session.branch;
                    socket.data.tableId = session.table;
                    socket.data.customerId = session.customer;
                    next();
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _b.sent();
                    logger_1.logger.error('Customer socket auth error:', error_1);
                    next(new Error('Authentication failed'));
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Combined authentication that routes to staff or customer auth
 */
function authenticateSocket(socket, next) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            // Check if this is a customer session token
            if ((_a = socket.handshake.auth) === null || _a === void 0 ? void 0 : _a.sessionToken) {
                return [2 /*return*/, authenticateCustomerSocket(socket, next)];
            }
            // Otherwise treat as staff JWT token
            return [2 /*return*/, authenticateStaffSocket(socket, next)];
        });
    });
}
function createSocketServer(app) {
    var _this = this;
    var server = http_1.default.createServer(app);
    var origins = (0, env_1.getCorsOrigins)();
    io = new socket_io_1.Server(server, {
        cors: {
            origin: origins,
            methods: ['GET', 'POST'],
            credentials: true,
        },
        pingTimeout: 30000,
        pingInterval: 15000,
    });
    io.use(authenticateSocket);
    io.on('connection', function (socket) { return __awaiter(_this, void 0, void 0, function () {
        var userType, user_1, session, activeOrders, error_2;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    userType = socket.data.userType;
                    if (!(userType === 'staff')) return [3 /*break*/, 1];
                    user_1 = socket.data.user;
                    logger_1.logger.info("Staff socket connected: ".concat(socket.id, " user=").concat(user_1 === null || user_1 === void 0 ? void 0 : user_1._id));
                    socket.on('setup:session', function (_a) {
                        var _b;
                        var branchId = _a.branchId;
                        if (!branchId || !user_1)
                            return;
                        var userBranchIds = Array.isArray(user_1.branch)
                            ? user_1.branch.map(function (b) { var _a; return String((_a = b._id) !== null && _a !== void 0 ? _a : b); })
                            : user_1.branch
                                ? [String((_b = user_1.branch._id) !== null && _b !== void 0 ? _b : user_1.branch)]
                                : [];
                        if (userBranchIds.length && !userBranchIds.includes(String(branchId))) {
                            logger_1.logger.warn("Socket ".concat(socket.id, " denied branch ").concat(branchId));
                            return;
                        }
                        socket.join("branch:".concat(branchId));
                        var permissions = socket.data.permissions || [];
                        permissions.forEach(function (perm) { return socket.join("branch:".concat(branchId, ":perm:").concat(perm)); });
                        socket.join("user:".concat(user_1._id));
                        logger_1.logger.info("User ".concat(user_1._id, " joined branch ").concat(branchId));
                    });
                    socket.on('order:create', function (order) {
                        var branchId = (order || {}).branchId;
                        if (!branchId || !io)
                            return;
                        io.to("branch:".concat(branchId, ":perm:ORDER_VIEW")).emit('order:new', order);
                        io.to("branch:".concat(branchId, ":perm:ORDER_MANAGE")).emit('order:new', order);
                    });
                    socket.on('table:sync', function (_a) {
                        var branchId = _a.branchId, tableId = _a.tableId, status = _a.status;
                        if (!branchId || !io)
                            return;
                        io.to("branch:".concat(branchId)).emit('table:updated', { tableId: tableId, status: status });
                    });
                    socket.on('notification:broadcast', function (_a) {
                        var branchId = _a.branchId, targetPermission = _a.targetPermission, data = _a.data;
                        if (!branchId || !io)
                            return;
                        var room = targetPermission
                            ? "branch:".concat(branchId, ":perm:").concat(targetPermission)
                            : "branch:".concat(branchId);
                        io.to(room).emit('notification', data);
                    });
                    socket.on('inventory:subscribe', function (_a) {
                        var _b;
                        var merchantId = _a.merchantId;
                        if (!merchantId || !(user_1 === null || user_1 === void 0 ? void 0 : user_1.merchant))
                            return;
                        var userMerchantId = String((_b = user_1.merchant._id) !== null && _b !== void 0 ? _b : user_1.merchant);
                        if (String(merchantId) !== userMerchantId) {
                            logger_1.logger.warn("Socket ".concat(socket.id, " denied inventory merchant ").concat(merchantId));
                            return;
                        }
                        socket.join("merchant:".concat(merchantId));
                    });
                    return [3 /*break*/, 6];
                case 1:
                    if (!(userType === 'customer')) return [3 /*break*/, 6];
                    session = socket.data.session;
                    logger_1.logger.info("Customer socket connected: ".concat(socket.id, " session=").concat((_a = session === null || session === void 0 ? void 0 : session.token) === null || _a === void 0 ? void 0 : _a.substring(0, 8), "... table=").concat(session === null || session === void 0 ? void 0 : session.table));
                    // Join session-specific room for direct communication
                    socket.join("session:".concat(session.token));
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, Order.find({
                            table: session.table,
                            merchant: session.merchant,
                            status: { $nin: ['completed', 'canceled'] },
                        }).select('_id').lean()];
                case 3:
                    activeOrders = _b.sent();
                    activeOrders.forEach(function (order) {
                        var orderId = String(order._id);
                        socket.join("order:".concat(orderId));
                        logger_1.logger.info("Customer socket ".concat(socket.id, " joined order room: order:").concat(orderId));
                    });
                    logger_1.logger.info("Customer joined ".concat(activeOrders.length, " active order rooms"));
                    return [3 /*break*/, 5];
                case 4:
                    error_2 = _b.sent();
                    logger_1.logger.error('Error joining customer to order rooms:', error_2);
                    return [3 /*break*/, 5];
                case 5:
                    // Allow customer to explicitly join order rooms
                    socket.on('order:join', function (_a) {
                        var orderId = _a.orderId;
                        if (!orderId)
                            return;
                        socket.join("order:".concat(orderId));
                        logger_1.logger.info("Customer socket ".concat(socket.id, " manually joined order:").concat(orderId));
                    });
                    _b.label = 6;
                case 6:
                    socket.on('disconnect', function (reason) {
                        logger_1.logger.info("Socket disconnected: ".concat(socket.id, " type=").concat(userType, " (").concat(reason, ")"));
                    });
                    return [2 /*return*/];
            }
        });
    }); });
    return server;
}
function getIo() {
    if (!io)
        throw new Error('Socket.io not initialized');
    return io;
}
// CommonJS bridge for legacy requires
module.exports = { createSocketServer: createSocketServer, getIo: getIo };
