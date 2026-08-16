const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const { logger } = require('../../../utils/logger');
const { loadEnv, getCorsOrigins } = require('../../config/env');

const verifyJwt = promisify(jwt.verify);

let io;

async function authenticateSocket(socket, next) {
  try {
    let token = socket.handshake.auth?.token;

    // 2. If not in auth, parse from cookies header
    if (!token && socket.handshake.headers.cookie) {
      const cookies = socket.handshake.headers.cookie;
      const match = cookies.match(/jwt=([^;]+)/); // Regex to grab value after 'jwt='
      if (match) token = match[1];
    }

    // 3. Last resort: Auth header
    if (!token && socket.handshake.headers.authorization) {
      token = socket.handshake.headers.authorization.split(' ')[1];
    }

    if (!token) return next(new Error('Authentication required'));

    const env = loadEnv();
    const decoded = await verifyJwt(token, env.JWT_SECRET);

    const User = require('../../../models/userModel');
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
    socket.data.permissions = (user.role?.tasks || []).map(t => t.name).filter(Boolean);
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
}

function createSocketServer(app) {
  const server = http.createServer(app);
  const origins = getCorsOrigins();

  io = socketIo(server, {
    cors: { origin: origins, methods: ['GET', 'POST'], credentials: true },
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  io.use(authenticateSocket);

  io.on('connection', socket => {
    const user = socket.data.user;
    logger.info(`Socket connected: ${socket.id} user=${user?._id}`);

    socket.on('setup:session', ({ branchId }) => {
      if (!branchId || !user) return;

      const userBranchIds = Array.isArray(user.branch)
        ? user.branch.map(b => String(b._id ?? b))
        : user.branch
          ? [String(user.branch._id ?? user.branch)]
          : [];

      if (userBranchIds.length && !userBranchIds.includes(String(branchId))) {
        logger.warn(`Socket ${socket.id} denied branch ${branchId}`);
        return;
      }

      socket.join(`branch:${branchId}`);
      (socket.data.permissions || []).forEach(perm =>
        socket.join(`branch:${branchId}:perm:${perm}`)
      );
      socket.join(`user:${user._id}`);
    });

    socket.on('order:create', order => {
      const { branchId } = order || {};
      if (!branchId) return;
      io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:new', order);
      io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('order:new', order);
    });

    socket.on('table:sync', ({ branchId, tableId, status }) => {
      if (!branchId) return;
      io.to(`branch:${branchId}`).emit('table:updated', { tableId, status });
    });

    socket.on('notification:broadcast', ({ branchId, targetPermission, data }) => {
      if (!branchId) return;
      const room = targetPermission
        ? `branch:${branchId}:perm:${targetPermission}`
        : `branch:${branchId}`;
      io.to(room).emit('notification', data);
    });

    socket.on('inventory:subscribe', ({ merchantId }) => {
      if (!merchantId || !user?.merchant) return;
      const userMerchantId = String(user.merchant._id ?? user.merchant);
      if (String(merchantId) !== userMerchantId) return;
      socket.join(`merchant:${merchantId}`);
    });

    socket.on('disconnect', reason => {
      logger.info(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return server;
}

function getIo() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

module.exports = { createSocketServer, getIo };
