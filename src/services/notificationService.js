// src/services/notificationService.js
const Notification = require('../models/notificationModel');
const User = require('../models/userModel');
const { emitNotification } = require('../websocket');

/**
 * Create a new notification
 * @param {Object} notificationData - Notification data
 * @param {Object} io - Socket.io instance
 * @returns {Promise<Object>} Created notification
 */
exports.createNotification = async (notificationData, io) => {
  // Check if user has disabled this notification type
  const user = await User.findById(notificationData.userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Check notification preferences
  const preferenceKey = `settings.notificationPreferences.${notificationData.type}s`;
  const notificationsEnabled = user.settings.notificationPreferences[`${notificationData.type}s`];
  
  if (notificationsEnabled === false) {
    // User has disabled this notification type
    return null;
  }
  
  // Create the notification
  const notification = await Notification.create(notificationData);
  
  // Emit real-time notification if socket.io instance provided
  if (io) {
    emitNotification(io, notification.userId, notification);
  }
  
  return notification;
};

/**
 * Create reaction notification
 * @param {Object} data - Reaction data
 * @param {Object} io - Socket.io instance
 * @returns {Promise<Object>} Created notification
 */
exports.createReactionNotification = async (data, io) => {
  const { contentType, contentId, actor, contentOwner, reactionType } = data;
  
  // Don't create notification if user reacts to their own content
  if (actor._id.toString() === contentOwner._id.toString()) {
    return null;
  }
  
  const emoji = reactionType;
  const contentName = contentType === 'post' ? 'post' : 'comment';
  
  return this.createNotification({
    userId: contentOwner._id,
    type: 'reaction',
    actorId: actor._id,
    actorUsername: actor.username,
    contentRef: {
      type: contentType,
      id: contentId
    },
    message: `${actor.username} reacted with ${emoji} to your ${contentName}`,
    actionable: true,
    actionLink: `/${contentType}s/${contentId}`,
    actionLabel: 'View'
  }, io);
};

/**
 * Create comment notification
 * @param {Object} data - Comment data
 * @param {Object} io - Socket.io instance
 * @returns {Promise<Object>} Created notification
 */
exports.createCommentNotification = async (data, io) => {
  const { comment, post, actor } = data;
  
  // Don't create notification if user comments on their own post
  if (actor._id.toString() === post.userId.toString()) {
    return null;
  }
  
  return this.createNotification({
    userId: post.userId,
    type: 'comment',
    actorId: actor._id,
    actorUsername: actor.username,
    contentRef: {
      type: 'post',
      id: post._id
    },
    message: `${actor.username} commented on your post`,
    actionable: true,
    actionLink: `/posts/${post._id}?comment=${comment._id}`,
    actionLabel: 'View'
  }, io);
};

/**
 * Create reply notification
 * @param {Object} data - Reply data
 * @param {Object} io - Socket.io instance
 * @returns {Promise<Object>} Created notification
 */
exports.createReplyNotification = async (data, io) => {
  const { reply, parentComment, actor } = data;
  
  // Don't create notification if user replies to their own comment
  if (actor._id.toString() === parentComment.userId.toString()) {
    return null;
  }
  
  return this.createNotification({
    userId: parentComment.userId,
    type: 'reply',
    actorId: actor._id,
    actorUsername: actor.username,
    contentRef: {
      type: 'comment',
      id: reply._id
    },
    message: `${actor.username} replied to your comment`,
    actionable: true,
    actionLink: `/posts/${parentComment.postId}?comment=${reply._id}`,
    actionLabel: 'View'
  }, io);
};

/**
 * Create mention notification
 * @param {Object} data - Mention data
 * @param {Object} io - Socket.io instance
 * @returns {Promise<Object>} Created notification
 */
exports.createMentionNotification = async (data, io) => {
  const { contentType, contentId, actor, mentionedUser } = data;
  
  // Don't create notification if user mentions themselves
  if (actor._id.toString() === mentionedUser._id.toString()) {
    return null;
  }
  
  const contentName = contentType === 'post' ? 'post' : 'comment';
  
  return this.createNotification({
    userId: mentionedUser._id,
    type: 'mention',
    actorId: actor._id,
    actorUsername: actor.username,
    contentRef: {
      type: contentType,
      id: contentId
    },
    message: `${actor.username} mentioned you in a ${contentName}`,
    actionable: true,
    actionLink: `/${contentType}s/${contentId}`,
    actionLabel: 'View'
  }, io);
};

/**
 * Create system notification
 * @param {Object} data - System notification data
 * @param {Object} io - Socket.io instance
 * @returns {Promise<Object>} Created notification
 */
exports.createSystemNotification = async (data, io) => {
  const { userId, message, actionable, actionLink, actionLabel, contentRef } = data;
  
  return this.createNotification({
    userId,
    type: 'system',
    contentRef: contentRef || {
      type: 'post',
      id: '000000000000000000000000' // Default ObjectId for system notifications
    },
    message,
    actionable: actionable || false,
    actionLink,
    actionLabel
  }, io);
};

/**
 * Process mentions in content
 * @param {String} content - Post or comment content
 * @param {Object} contentInfo - Content information
 * @param {Object} actor - User who created the content
 * @param {Object} io - Socket.io instance
 * @returns {Promise<Array>} Array of created notifications
 */
exports.processMentions = async (content, contentInfo, actor, io) => {
  // Extract usernames from mentions (@username)
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1].toLowerCase());
  }
  
  if (mentions.length === 0) {
    return [];
  }
  
  // Get unique mentions
  const uniqueMentions = [...new Set(mentions)];
  
  // Find mentioned users
  const mentionedUsers = await User.find({ 
    username: { $in: uniqueMentions } 
  });
  
  // Create notifications for each mentioned user
  const notifications = [];
  
  for (const user of mentionedUsers) {
    const notification = await this.createMentionNotification({
      contentType: contentInfo.type,
      contentId: contentInfo.id,
      actor,
      mentionedUser: user
    }, io);
    
    if (notification) {
      notifications.push(notification);
    }
  }
  
  return notifications;
};