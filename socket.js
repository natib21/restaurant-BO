// socket.js
const http = require('http');
const socketIo = require('socket.io');
const logger = require('./utils/logger');

let io;

const createSocketServer = app => {
  const server = http.createServer(app);

  io = socketIo(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', socket => { 
    logger.info(`Socket connected → ${socket.id}`);

    // ==============================
    // JOIN ROOMS
    // ==============================
    socket.on('join-merchant', ({ merchantId }) => {
      socket.join(`merchant:${merchantId}`);
      logger.info(`Socket ${socket.id} joined merchant:${merchantId}`);
    });

    socket.on('join-role', ({ merchantId, role }) => {
      socket.join(`merchant:${merchantId}:${role}`);
      logger.info(`Socket ${socket.id} joined role room: ${role}`);
    });

    socket.on('join-table', ({ tableId }) => {
      socket.join(`table:${tableId}`);
      logger.info(`Socket ${socket.id} joined table:${tableId}`);
    });

    // ==============================
    // ORDER FLOW EVENTS
    // ==============================

    // 1️⃣ NEW ORDER (customer)
    socket.on('order:new', order => {
      logger.info('SOCKET → New order: ' + JSON.stringify(order));

      io.to(`merchant:${order.merchant}`)
        .to(`merchant:${order.merchant}:waiter`)
        .to(`merchant:${order.merchant}:kitchen`)
        .emit('order:new', order);
    });

    // 2️⃣ ACCEPT ORDER (waiter)
    socket.on('order:accept', data => {
      logger.info('SOCKET → Order accepted: ' + JSON.stringify(data));

      io.to(`merchant:${data.merchantId}`).to(`table:${data.tableId}`).emit('order:accepted', data);
    });

    // 3️⃣ PREPARING (kitchen)
    socket.on('order:preparing', data => {
      io.to(`merchant:${data.merchantId}`).emit('order:preparing', data);
    });

    // 4️⃣ READY (kitchen)
    socket.on('order:ready', data => {
      io.to(`merchant:${data.merchantId}:waiter`)
        .to(`table:${data.tableId}`)
        .emit('order:ready', data);
    });

    // 5️⃣ SERVED (waiter)
    socket.on('order:served', data => {
      io.to(`table:${data.tableId}`).emit('order:served', data);
    });

    // 6️⃣ COMPLETED (merchant or auto)
    socket.on('order:completed', data => {
      io.to(`merchant:${data.merchantId}`).emit('order:completed', data);
    });

    socket.on('disconnect', () => logger.info(`Socket disconnected → ${socket.id}`));
  });

  return server;
};

const getIo = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

module.exports = { createSocketServer, getIo };
