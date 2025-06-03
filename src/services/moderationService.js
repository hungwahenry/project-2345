// src/services/moderationService.js
const Report = require('../models/reportModel');
const Post = require('../models/postModel');
const Comment = require('../models/commentModel');
const User = require('../models/userModel');
const notificationService = require('./notificationService');

/**
 * Check content against prohibited keywords
 * @param {String} content - Content to check
 * @returns {Object} Result with detection information
 */
exports.checkProhibitedContent = (content) => {
  // This is a very simplified implementation
  // In production, you would use more sophisticated detection
  // such as Perspective API or other content moderation services
  
  const prohibitedKeywords = [
    'offensive', 'inappropriate', 'obscene', 'illegal'
  ];
  
  const detections = [];
  
  prohibitedKeywords.forEach(keyword => {
    if (content.toLowerCase().includes(keyword)) {
      detections.push({
        keyword,
        severity: 'medium'
      });
    }
  });
  
  const result = {
    detected: detections.length > 0,
    detections,
    severity: detections.length > 0 ? 'medium' : 'low'
  };
  
  return result;
};

/**
 * Moderate a post
 * @param {Object} post - Post to moderate
 * @param {String} action - Action to take ('flag', 'remove', 'restore')
 * @param {String} reason - Reason for moderation
 * @param {Object} moderator - User performing moderation
 * @param {Object} io - Socket.io instance
 * @returns {Promise<Object>} Updated post
 */
exports.moderatePost = async (post, action, reason, moderator, io) => {
  // Validate action
  if (!['flag', 'remove', 'restore'].includes(action)) {
    throw new Error('Invalid moderation action');
  }
  
  // Apply moderation action
  if (action === 'flag') {
    post.contentWarning = reason;
    post.isModerated = true;
    post.moderationReason = reason;
  } else if (action === 'remove') {
    post.visibility = 'moderated';
    post.isModerated = true;
    post.moderationReason = reason;
    
    // Add edit history
    post.edits.push({
      timestamp: new Date(),
      reason: 'moderation'
    });
  } else if (action === 'restore') {
    post.visibility = 'public';
    post.isModerated = false;
    post.moderationReason = null;
    post.contentWarning = null;
    
    // Add edit history
    post.edits.push({
      timestamp: new Date(),
      reason: 'moderation'
    });
  }
  
  // Save updated post
  await post.save();
  
  // Notify the user of moderation action
  if (action !== 'restore') {
    await notificationService.createSystemNotification({
      userId: post.userId,
      message: `Your post has been ${action === 'flag' ? 'flagged' : 'removed'} for ${reason}`,
      actionable: true,
      actionLink: `/posts/${post._id}`,
      actionLabel: 'View Post',
      contentRef: {
        type: 'post',
        id: post._id
      }
    }, io);
  }
  
  return post;
};

/**
 * Moderate a comment
 * @param {Object} comment - Comment to moderate
 * @param {String} action - Action to take ('remove', 'restore')
 * @param {String} reason - Reason for moderation
 * @param {Object} moderator - User performing moderation
 * @param {Object} io - Socket.io instance
 * @returns {Promise<Object>} Updated comment
 */
exports.moderateComment = async (comment, action, reason, moderator, io) => {
  // Validate action
  if (!['remove', 'restore'].includes(action)) {
    throw new Error('Invalid moderation action');
  }
  
  // Apply moderation action
  if (action === 'remove') {
    comment.visibility = 'moderated';
    comment.isModerated = true;
    comment.moderationReason = reason;
  } else if (action === 'restore') {
    comment.visibility = 'public';
    comment.isModerated = false;
    comment.moderationReason = null;
  }
  
  // Save updated comment
  await comment.save();
  
  // Notify the user of moderation action
  if (action === 'remove') {
    await notificationService.createSystemNotification({
      userId: comment.userId,
      message: `Your comment has been removed for ${reason}`,
      actionable: true,
      actionLink: `/posts/${comment.postId}`,
      actionLabel: 'View Post',
      contentRef: {
        type: 'comment',
        id: comment._id
      }
    }, io);
  }
  
  return comment;
};

/**
 * Auto-moderate content
 * @param {String} content - Content to moderate
 * @param {Object} user - Content author
 * @returns {Object} Moderation result
 */
exports.autoModerateContent = (content, user) => {
  // Skip moderation if user has it disabled
  if (user && !user.contentSettings.autoModeration) {
    return {
      shouldModerate: false
    };
  }
  
  // Check content against prohibited keywords
  const checkResult = this.checkProhibitedContent(content);
  
  // Determine if content should be moderated
  let shouldModerate = false;
  let moderationReason = null;
  
  if (checkResult.detected) {
    if (checkResult.severity === 'high') {
      shouldModerate = true;
      moderationReason = 'Content contains prohibited material';
    } else if (checkResult.severity === 'medium') {
      shouldModerate = true;
      moderationReason = 'Content may be inappropriate';
    }
  }
  
  return {
    shouldModerate,
    moderationReason,
    severity: checkResult.severity,
    detections: checkResult.detections
  };
};