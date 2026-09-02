"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSocketServer = createSocketServer;
exports.getIo = getIo;
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const util_1 = require("util");
const logger_1 = require("../../common/logger");
const env_1 = require("../../config/env");
const User = require('../../../models/userModel');
const CustomerSession = require('../../../models/customerSessionModule');
const Order = require('../../../models/orderModel');
const verifyJwt = (0, util_1.promisify)(jsonwebtoken_1.default.verify);
let io = null;
/**
 * Authenticate staff socket connection via JWT token
 */
async function authenticateStaffSocket(socket, next) {
    try {
        const token = socket.handshake.auth?.token ||
            socket.handshake.headers.authorization?.split(' ')?.[1];
        if (!token) {
            return next(new Error('Authentication required'));
        }
        const env = (0, env_1.loadEnv)();
        const decoded = await verifyJwt(token, env.JWT_SECRET);
        const user = await User.findById(decoded.id)
            .populate({
            path: 'role',
            select: 'name tasks',
            populate: { path: 'tasks', select: 'name endpoint method' },
        })
            .populate('merchant', '_id businessName');
        if (!user || !user.isActive) {
            return next(new Error('User not found or inactive'));
        }
        socket.data.user = user;
        socket.data.userType = 'staff';
        socket.data.permissions = (user.role?.tasks || [])
            .map((t) => t.name)
            .filter(Boolean);
        next();
    }
    catch {
        next(new Error('Invalid or expired token'));
    }
}
/**
 * Authenticate customer socket connection via session token
 */
async function authenticateCustomerSocket(socket, next) {
    try {
        const sessionToken = socket.handshake.auth?.sessionToken;
        if (!sessionToken) {
            return next(new Error('Session token required'));
        }
        const session = await CustomerSession.findOne({
            token: sessionToken,
            isActive: true,
            expiresAt: { $gt: new Date() },
        }).lean();
        if (!session) {
            return next(new Error('Invalid or expired session'));
        }
        socket.data.session = session;
        socket.data.userType = 'customer';
        socket.data.merchantId = session.merchant;
        socket.data.branchId = session.branch;
        socket.data.tableId = session.table;
        socket.data.customerId = session.customer;
        next();
    }
    catch (error) {
        logger_1.logger.error('Customer socket auth error:', error);
        next(new Error('Authentication failed'));
    }
}
/**
 * Combined authentication that routes to staff or customer auth
 */
async function authenticateSocket(socket, next) {
    // Check if this is a customer session token
    if (socket.handshake.auth?.sessionToken) {
        return authenticateCustomerSocket(socket, next);
    }
    // Otherwise treat as staff JWT token
    return authenticateStaffSocket(socket, next);
}
function createSocketServer(app) {
    const server = http_1.default.createServer(app);
    const origins = (0, env_1.getCorsOrigins)();
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
    io.on('connection', async (socket) => {
        const userType = socket.data.userType;
        if (userType === 'staff') {
            // Staff connection handler
            const user = socket.data.user;
            logger_1.logger.info(`Staff socket connected: ${socket.id} user=${user?._id}`);
            socket.on('setup:session', ({ branchId }) => {
                if (!branchId || !user)
                    return;
                const userBranchIds = Array.isArray(user.branch)
                    ? user.branch.map((b) => String(b._id ?? b))
                    : user.branch
                        ? [String(user.branch._id ?? user.branch)]
                        : [];
                if (userBranchIds.length && !userBranchIds.includes(String(branchId))) {
                    logger_1.logger.warn(`Socket ${socket.id} denied branch ${branchId}`);
                    return;
                }
                socket.join(`branch:${branchId}`);
                const permissions = socket.data.permissions || [];
                permissions.forEach(perm => socket.join(`branch:${branchId}:perm:${perm}`));
                socket.join(`user:${user._id}`);
                logger_1.logger.info(`User ${user._id} joined branch ${branchId}`);
            });
            socket.on('order:create', order => {
                const { branchId } = order || {};
                if (!branchId || !io)
                    return;
                io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:new', order);
                io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('order:new', order);
            });
            socket.on('table:sync', ({ branchId, tableId, status }) => {
                if (!branchId || !io)
                    return;
                io.to(`branch:${branchId}`).emit('table:updated', { tableId, status });
            });
            socket.on('notification:broadcast', ({ branchId, targetPermission, data }) => {
                if (!branchId || !io)
                    return;
                const room = targetPermission
                    ? `branch:${branchId}:perm:${targetPermission}`
                    : `branch:${branchId}`;
                io.to(room).emit('notification', data);
            });
            socket.on('inventory:subscribe', ({ merchantId }) => {
                if (!merchantId || !user?.merchant)
                    return;
                const userMerchantId = String(user.merchant._id ?? user.merchant);
                if (String(merchantId) !== userMerchantId) {
                    logger_1.logger.warn(`Socket ${socket.id} denied inventory merchant ${merchantId}`);
                    return;
                }
                socket.join(`merchant:${merchantId}`);
            });
        }
        else if (userType === 'customer') {
            // Customer connection handler
            const session = socket.data.session;
            logger_1.logger.info(`Customer socket connected: ${socket.id} session=${session?.token?.substring(0, 8)}... table=${session?.table}`);
            // Join session-specific room for direct communication
            socket.join(`session:${session.token}`);
            // Find all active orders for this session's table and join their rooms
            try {
                const activeOrders = await Order.find({
                    table: session.table,
                    merchant: session.merchant,
                    status: { $nin: ['completed', 'canceled'] },
                }).select('_id').lean();
                activeOrders.forEach((order) => {
                    const orderId = String(order._id);
                    socket.join(`order:${orderId}`);
                    logger_1.logger.info(`Customer socket ${socket.id} joined order room: order:${orderId}`);
                });
                logger_1.logger.info(`Customer joined ${activeOrders.length} active order rooms`);
            }
            catch (error) {
                logger_1.logger.error('Error joining customer to order rooms:', error);
            }
            // Allow customer to explicitly join order rooms
            socket.on('order:join', ({ orderId }) => {
                if (!orderId)
                    return;
                socket.join(`order:${orderId}`);
                logger_1.logger.info(`Customer socket ${socket.id} manually joined order:${orderId}`);
            });
        }
        socket.on('disconnect', reason => {
            logger_1.logger.info(`Socket disconnected: ${socket.id} type=${userType} (${reason})`);
        });
    });
    return server;
}
function getIo() {
    if (!io)
        throw new Error('Socket.io not initialized');
    return io;
}
// CommonJS bridge for legacy requires
module.exports = { createSocketServer, getIo };
