// socket.js
const http = require('http');
const socketIo = require('socket.io');
const { logger } = require('./utils/logger');

let io;

const createSocketServer = app => {
  const server = http.createServer(app);

  io = socketIo(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  io.on('connection', socket => {
<<<<<<< HEAD
    logger.info(`Socket connected → ${socket.id}`);
=======
    logger.info(`Connection established: ${socket.id}`);
>>>>>>> branch_mgmt

    socket.on('setup:session', ({ branchId, userId, permissions }) => {
      if (!branchId || !userId) return;

      const branchRoom = `branch:${branchId}`;
      socket.join(branchRoom);

      if (Array.isArray(permissions)) {
        permissions.forEach(perm => {
          socket.join(`branch:${branchId}:perm:${perm}`);
        });
      }

      socket.join(`user:${userId}`);

      logger.info(
        `User ${userId} synced with Branch ${branchId} (${permissions?.length || 0} permissions)`
      );
    });

    // ==========================================
    // DYNAMIC ORDER EVENTS
    // ==========================================

    socket.on('order:create', order => {
      const { branchId } = order;
      if (!branchId) return;
      console.log('orders ', order);
      // Broadcast only to users with "ORDER_MANAGEMENT" or "KITCHEN_VIEW" permissions
      // No matter what the Merchant named the role.
      io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:new', order);
      io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('order:new', order);

      logger.info(`[Socket] New Order ${order.orderNumber} broadcasted via permissions.`);
    });

    socket.on('table:sync', ({ branchId, tableId, status }) => {
      if (!branchId) return;
      io.to(`branch:${branchId}`).emit('table:updated', { tableId, status });
    });

    // ==========================================
    // DYNAMIC NOTIFICATIONS
    // ==========================================

    /**
     * Send alerts to specific permission groups
     * Example: "Alert all staff who have 'BILLING_ACCESS'"
     */
    socket.on('notification:broadcast', ({ branchId, targetPermission, data }) => {
      const targetRoom = targetPermission
        ? `branch:${branchId}:perm:${targetPermission}`
        : `branch:${branchId}`;

      io.to(targetRoom).emit('notification', data);
    });

    // ==========================================
    // ERROR & DISCONNECT
    // ==========================================

    socket.on('disconnect', reason => {
      logger.info(`Connection closed: ${socket.id} (${reason})`);
    });

    socket.on('error', err => {
      logger.error(`Socket error for ${socket.id}: ${err.message}`);
    });
  });

  return server;
};

const getIo = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

module.exports = { createSocketServer, getIo };
