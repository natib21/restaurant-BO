const logger = require('./utils/logger');
const http = require('http');
const socketIo = require('socket.io');

let io;

const createSocketServer = (app) => {
  const server = http.createServer(app);
  io = socketIo(server, {
    cors: {
      origin: '*', // Replace '*' with the allowed origin(s) if necessary
      methods: ['GET', 'POST'], // Specify allowed HTTP methods
    },
  });

  io.on('connection', (socket) => {
    logger.info(`Socket.Io connected: ${socket.id}`);

    socket.on('new-order', (order) => {
      logger.info(`New order received: ${JSON.stringify(order)}`);

      // Broadcast to all clients
      io.emit('order-update', order);
    });
    socket.on('update-order', (updatedOrder) => {
      logger.info(`Order updated: ${JSON.stringify(updatedOrder)}`);

      // Notify clients (waiters, admin) about the updated order
      io.emit('order-updated', updatedOrder);
    });

    // Listen for order acceptance by waiter
    socket.on('accept-order', (orderId) => {
      logger.info(`Order accepted: ${orderId}`);

      // Notify the waiter and kitchen that the order was accepted
      io.emit('order-accepted', orderId);
    });
    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`Socket.IO disconnected: ${socket.id}`);
    });
  });

  return server;
};
const getIo = () => {
  console.log(io);
  if (!io) {
    throw new Error(
      'Socket.IO has not been initialized. Please initialize it first.'
    );
  }
  return io; // Return io to be used in other modules
};
module.exports = { createSocketServer, getIo };
