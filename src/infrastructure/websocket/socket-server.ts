import http from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import type { Express } from 'express';
import { logger } from '../../common/logger';
import { loadEnv, getCorsOrigins } from '../../config/env';
const User = require('../../../models/userModel');
const verifyJwt = promisify(jwt.verify) as unknown as (
  token: string,
  secret: string
) => Promise<{ id: string; merchant?: string; branch?: string }>;

let io: SocketServer | null = null;

async function authenticateSocket(socket: import('socket.io').Socket, next: (err?: Error) => void) {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization as string | undefined)?.split(' ')?.[1];

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const env = loadEnv();
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
    socket.data.permissions = (user.role?.tasks || [])
      .map((t: { name?: string }) => t.name)
      .filter(Boolean);
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
}

export function createSocketServer(app: Express) {
  const server = http.createServer(app);
  const origins = getCorsOrigins();

  io = new SocketServer(server, {
    cors: {
      origin: origins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
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
        ? user.branch.map((b: { _id?: unknown }) => String(b._id ?? b))
        : user.branch
          ? [String((user.branch as { _id?: unknown })._id ?? user.branch)]
          : [];

      if (userBranchIds.length && !userBranchIds.includes(String(branchId))) {
        logger.warn(`Socket ${socket.id} denied branch ${branchId}`);
        return;
      }

      socket.join(`branch:${branchId}`);
      const permissions: string[] = socket.data.permissions || [];
      permissions.forEach(perm => socket.join(`branch:${branchId}:perm:${perm}`));
      socket.join(`user:${user._id}`);
      logger.info(`User ${user._id} joined branch ${branchId}`);
    });

    socket.on('order:create', order => {
      const { branchId } = order || {};
      if (!branchId || !io) return;
      io.to(`branch:${branchId}:perm:ORDER_VIEW`).emit('order:new', order);
      io.to(`branch:${branchId}:perm:ORDER_MANAGE`).emit('order:new', order);
    });

    socket.on('table:sync', ({ branchId, tableId, status }) => {
      if (!branchId || !io) return;
      io.to(`branch:${branchId}`).emit('table:updated', { tableId, status });
    });

    socket.on('notification:broadcast', ({ branchId, targetPermission, data }) => {
      if (!branchId || !io) return;
      const room = targetPermission
        ? `branch:${branchId}:perm:${targetPermission}`
        : `branch:${branchId}`;
      io.to(room).emit('notification', data);
    });

    socket.on('inventory:subscribe', ({ merchantId }) => {
      if (!merchantId || !user?.merchant) return;
      const userMerchantId = String(user.merchant._id ?? user.merchant);
      if (String(merchantId) !== userMerchantId) {
        logger.warn(`Socket ${socket.id} denied inventory merchant ${merchantId}`);
        return;
      }
      socket.join(`merchant:${merchantId}`);
    });

    socket.on('disconnect', reason => {
      logger.info(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return server;
}

export function getIo(): SocketServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

// CommonJS bridge for legacy requires
module.exports = { createSocketServer, getIo };
