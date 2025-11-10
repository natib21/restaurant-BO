const logger = require('./utils/logger');
const http = require('http');
const socketIo = require('socket.io');

let io;

const createSocketServer = app => {
  const server = http.createServer(app);
  io = socketIo(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });
  io.on('connection', socket => {
    logger.info(`Socket.Io connected: ${socket.id}`);

    socket.on('new-order', order => {
      logger.info(`New order received: ${JSON.stringify(order)}`);

      io.emit('order-update', order);
    });
    socket.on('update-order', updatedOrder => {
      logger.info(`Order updated: ${JSON.stringify(updatedOrder)}`);

      io.emit('order-updated', updatedOrder);
    });

    socket.on('accept-order', orderId => {
      logger.info(`Order accepted: ${orderId}`);

      io.emit('order-accepted', orderId);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket.IO disconnected: ${socket.id}`);
    });
  });

  return server;
};
const getIo = () => {
  console.log(io);
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Please initialize it first.');
  }
  return io;
};
module.exports = { createSocketServer, getIo };
