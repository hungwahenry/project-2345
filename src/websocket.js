// src/websocket.js
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('./config/config');
const User = require('./models/userModel');
const Notification = require('./models/notificationModel');
const { verifyToken } = require('./utils/authUtils');

/**
 * Initialize WebSocket server
 * @param {Object} server - HTTP server
 * @returns {Object} Socket.io instance
 */
const initializeWebSocket = (server) => {
  const io = socketIO(server, {
    cors: {
      origin: config.clientOrigin || '*',
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }
      
      // Verify JWT token
      const decoded = verifyToken(token);
      
      // Get user
      const user = await User.findById(decoded.userId);
      
      if (!user || !user.isActive) {
        return next(new Error('Authentication error: User not found or inactive'));
      }
      
      // Attach user to socket
      socket.user = {
        id: user._id.toString(),
        username: user.username
      };
      
      next();
    } catch (error) {
      return next(new Error('Authentication error: ' + error.message));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.username} (${socket.id})`);
    
    // Join user's personal channel for notifications
    socket.join(`user:${socket.user.id}`);
    
    // Update user's last active timestamp
    User.findByIdAndUpdate(
      socket.user.id,
      { lastActive: new Date() }
    ).catch(err => console.error('Error updating last active:', err));
    
    // Handle subscription to channels
    socket.on('subscribe', async (data) => {
      // Validate subscription data
      if (!data || !data.channel) {
        socket.emit('error', { message: 'Invalid subscription data' });
        return;
      }
      
      if (data.channel === 'notifications') {
        // Already subscribed to personal channel, but send confirmation
        socket.emit('subscribed', { channel: 'notifications' });
        
        // Send unread notification count
        try {
          const count = await Notification.countDocuments({
            userId: socket.user.id,
            read: false
          });
          
          socket.emit('notification_count', { count });
        } catch (error) {
          console.error('Error getting notification count:', error);
        }
      } else if (data.channel === 'comments' && data.postId) {
        // Subscribe to comment stream for a specific post
        socket.join(`post:${data.postId}:comments`);
        socket.emit('subscribed', { 
          channel: 'comments', 
          postId: data.postId 
        });
      } else if (data.channel === 'online') {
        // Join online users channel
        socket.join('online_users');
        socket.emit('subscribed', { channel: 'online' });
        
        // Broadcast user online status
        socket.to('online_users').emit('user_status', {
          userId: socket.user.id,
          username: socket.user.username,
          status: 'online'
        });
      } else {
        socket.emit('error', { message: 'Invalid channel' });
      }
    });
    
    // Handle unsubscription from channels
    socket.on('unsubscribe', (data) => {
      if (data.channel === 'comments' && data.postId) {
        socket.leave(`post:${data.postId}:comments`);
        socket.emit('unsubscribed', { 
          channel: 'comments', 
          postId: data.postId 
        });
      } else if (data.channel === 'online') {
        socket.leave('online_users');
        socket.emit('unsubscribed', { channel: 'online' });
        
        // Broadcast user offline status
        io.to('online_users').emit('user_status', {
          userId: socket.user.id,
          username: socket.user.username,
          status: 'offline'
        });
      } else {
        socket.emit('error', { message: 'Invalid channel' });
      }
    });
    
    // Handle typing indicator
    socket.on('typing', (data) => {
      if (data && data.postId) {
        // Broadcast typing indicator to other users in the post's comment channel
        socket.to(`post:${data.postId}:comments`).emit('typing', {
          userId: socket.user.id,
          username: socket.user.username,
          isTyping: data.isTyping || false
        });
      }
    });
    
    // Handle read notifications
    socket.on('read_notification', async (data) => {
      if (data && data.notificationId) {
        try {
          await Notification.findOneAndUpdate(
            {
              _id: data.notificationId,
              userId: socket.user.id
            },
            { read: true }
          );
          
          // Get updated unread count
          const count = await Notification.countDocuments({
            userId: socket.user.id,
            read: false
          });
          
          socket.emit('notification_count', { count });
        } catch (error) {
          console.error('Error marking notification as read:', error);
          socket.emit('error', { message: 'Failed to mark notification as read' });
        }
      }
    });
    
    // Disconnect handler
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.username} (${socket.id})`);
      
      // Broadcast user offline status if they were in online users channel
      if (socket.rooms.has('online_users')) {
        io.to('online_users').emit('user_status', {
          userId: socket.user.id,
          username: socket.user.username,
          status: 'offline'
        });
      }
    });
  });

  return io;
};

/**
 * Emit a notification to a specific user
 * @param {Object} io - Socket.io instance
 * @param {String} userId - User ID
 * @param {Object} notification - Notification data
 */
const emitNotification = (io, userId, notification) => {
  if (!io) return;
  
  io.to(`user:${userId}`).emit('notification', {
    type: notification.type,
    data: notification
  });
  
  // Also send updated unread count
  Notification.countDocuments({
    userId,
    read: false
  }).then(count => {
    io.to(`user:${userId}`).emit('notification_count', { count });
  }).catch(err => {
    console.error('Error getting notification count:', err);
  });
};

/**
 * Emit a new comment to subscribers of a post
 * @param {Object} io - Socket.io instance
 * @param {String} postId - Post ID
 * @param {Object} comment - Comment data
 */
const emitNewComment = (io, postId, comment) => {
  if (!io) return;
  
  io.to(`post:${postId}:comments`).emit('comment', {
    action: 'created',
    data: comment
  });
};

/**
 * Emit a comment update to subscribers of a post
 * @param {Object} io - Socket.io instance
 * @param {String} postId - Post ID
 * @param {Object} comment - Updated comment data
 */
const emitCommentUpdate = (io, postId, comment) => {
  if (!io) return;
  
  io.to(`post:${postId}:comments`).emit('comment', {
    action: 'updated',
    data: comment
  });
};

/**
 * Emit a comment deletion to subscribers of a post
 * @param {Object} io - Socket.io instance
 * @param {String} postId - Post ID
 * @param {String} commentId - Comment ID
 */
const emitCommentDeletion = (io, postId, commentId) => {
  if (!io) return;
  
  io.to(`post:${postId}:comments`).emit('comment', {
    action: 'deleted',
    data: { _id: commentId }
  });
};

/**
 * Broadcast an announcement to all connected users
 * @param {Object} io - Socket.io instance
 * @param {Object} announcement - Announcement data
 */
const broadcastAnnouncement = (io, announcement) => {
  if (!io) return;
  
  io.emit('announcement', announcement);
};

module.exports = {
  initializeWebSocket,
  emitNotification,
  emitNewComment,
  emitCommentUpdate,
  emitCommentDeletion,
  broadcastAnnouncement
};