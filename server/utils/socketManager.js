const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { config } = require('../config/config');
const { logger } = require('./logger');

let io;

/**
 * Initialize Socket.IO
 */
const initializeSocket = (server) => {
  io = socketIO(server, {
    path: config.socket.path,
    cors: config.socket.cors,
    transports: ['websocket', 'polling']
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication token missing'));
      }

      const decoded = jwt.verify(token, config.jwt.secret);
      socket.user = decoded;
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    logger.info('Client connected:', {
      id: socket.id,
      user: socket.user?.id
    });

    // Join user's room
    if (socket.user) {
      socket.join(`user:${socket.user.id}`);
      
      // Join professional's room if applicable
      if (socket.user.professionalId) {
        socket.join(`professional:${socket.user.professionalId}`);
      }
    }

    // Handle chat messages
    socket.on('chat:message', async (data) => {
      try {
        // Validate message data
        if (!data.recipientId || !data.message) {
          throw new Error('Invalid message data');
        }

        // Create message object
        const message = {
          senderId: socket.user.id,
          recipientId: data.recipientId,
          message: data.message,
          timestamp: new Date()
        };

        // Save message to database
        // await ChatMessage.create(message);

        // Emit to recipient
        io.to(`user:${data.recipientId}`).emit('chat:message', message);

        // Emit confirmation to sender
        socket.emit('chat:sent', { messageId: message.id });

      } catch (error) {
        logger.error('Chat message error:', error);
        socket.emit('chat:error', { message: 'Failed to send message' });
      }
    });

    // Handle appointment notifications
    socket.on('appointment:update', (data) => {
      try {
        const { professionalId, appointmentId, status } = data;
        
        // Emit to professional
        io.to(`professional:${professionalId}`).emit('appointment:updated', {
          appointmentId,
          status
        });

      } catch (error) {
        logger.error('Appointment notification error:', error);
      }
    });

    // Handle typing indicators
    socket.on('chat:typing', (data) => {
      const { recipientId, isTyping } = data;
      io.to(`user:${recipientId}`).emit('chat:typing', {
        userId: socket.user.id,
        isTyping
      });
    });

    // Handle read receipts
    socket.on('chat:read', async (data) => {
      try {
        const { messageIds } = data;
        
        // Update messages in database
        // await ChatMessage.updateMany(
        //   { _id: { $in: messageIds } },
        //   { $set: { read: true, readAt: new Date() } }
        // );

        // Notify sender
        socket.emit('chat:read:confirmed', { messageIds });

      } catch (error) {
        logger.error('Read receipt error:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info('Client disconnected:', {
        id: socket.id,
        user: socket.user?.id
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('Socket error:', error);
    });
  });

  return io;
};

/**
 * Get Socket.IO instance
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

/**
 * Emit event to specific user
 */
const emitToUser = (userId, event, data) => {
  try {
    getIO().to(`user:${userId}`).emit(event, data);
  } catch (error) {
    logger.error('Emit to user error:', error);
  }
};

/**
 * Emit event to specific professional
 */
const emitToProfessional = (professionalId, event, data) => {
  try {
    getIO().to(`professional:${professionalId}`).emit(event, data);
  } catch (error) {
    logger.error('Emit to professional error:', error);
  }
};

/**
 * Emit event to all connected clients
 */
const emitToAll = (event, data) => {
  try {
    getIO().emit(event, data);
  } catch (error) {
    logger.error('Emit to all error:', error);
  }
};

/**
 * Get connected clients count
 */
const getConnectedClients = () => {
  try {
    return getIO().engine.clientsCount;
  } catch (error) {
    logger.error('Get connected clients error:', error);
    return 0;
  }
};

/**
 * Get rooms info
 */
const getRoomsInfo = async () => {
  try {
    const io = getIO();
    const sockets = await io.fetchSockets();
    
    const rooms = {};
    for (const socket of sockets) {
      Object.keys(socket.rooms).forEach(room => {
        if (!rooms[room]) {
          rooms[room] = 0;
        }
        rooms[room]++;
      });
    }

    return rooms;
  } catch (error) {
    logger.error('Get rooms info error:', error);
    return {};
  }
};

module.exports = {
  initializeSocket,
  getIO,
  emitToUser,
  emitToProfessional,
  emitToAll,
  getConnectedClients,
  getRoomsInfo
};
