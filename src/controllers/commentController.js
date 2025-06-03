//src/controller/commentController.js
const Comment = require('../models/commentModel');
const Post = require('../models/postModel');
const User = require('../models/userModel');
const notificationService = require('../services/notificationService');
const giphyService = require('../services/giphyService');
const moderationService = require('../services/moderationService');
const { containsSensitiveContent } = require('../utils/postUtils');
const { emitNewComment, emitCommentUpdate, emitCommentDeletion } = require('../websocket');

/**
 * Add a comment to a post
 * @route POST /api/posts/:postId/comments
 */
exports.addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, gifUrl, gifId } = req.body;
    const user = req.user;
    
    // Basic validation - either content or gifId must be provided
    if ((!content || content.trim() === '') && !gifId) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Comment requires either text content or a GIF',
        error: {
          code: 'COMMENT_001',
          details: 'Either content or gifId is required for creating a comment'
        },
        meta: {}
      });
    }
    
    // Find the post
    const post = await Post.findById(postId);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Post not found',
        error: {
          code: 'POST_001',
          details: 'The requested post does not exist'
        },
        meta: {}
      });
    }
    
    // Check if post is public
    if (post.visibility !== 'public') {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Cannot comment on a non-public post',
        error: {
          code: 'POST_005',
          details: 'Post is not public'
        },
        meta: {}
      });
    }
    
    // Check for auto-moderation if enabled in user settings
    let visibility = 'public';
    let isModerated = false;
    let moderationReason = null;

    if (user.contentSettings.autoModeration && content) {
      const moderationResult = moderationService.autoModerateContent(content, user);
      
      if (moderationResult.shouldModerate) {
        visibility = 'moderated';
        isModerated = true;
        moderationReason = moderationResult.moderationReason;
      }
    }
    
    // Validate GIF if provided
    let finalGifUrl = gifUrl;
    if (gifId && !gifUrl) {
      try {
        // Get GIF details from Giphy
        const gif = await giphyService.getGifById(gifId);
        finalGifUrl = gif.url;
      } catch (gifError) {
        console.error('Error fetching GIF:', gifError);
        return res.status(400).json({
          success: false,
          data: null,
          message: 'Invalid GIF ID',
          error: {
            code: 'COMMENT_007',
            details: 'The provided GIF ID could not be found'
          },
          meta: {}
        });
      }
    }
    
    // Create the comment
    const comment = await Comment.create({
      postId,
      userId: user._id,
      username: user.username,
      content: content || '',
      gifUrl: finalGifUrl,
      gifId: gifId,
      visibility,
      isModerated,
      moderationReason
    });
    
    // Increment comment count on post
    await Post.findByIdAndUpdate(postId, {
      $inc: { commentCount: 1 }
    });
    
    // Update user's comment count
    await User.findByIdAndUpdate(user._id, {
      $inc: { 'activityMetrics.totalComments': 1 }
    });
    
    // Update post engagement score
    const updatedPost = await Post.findById(postId);
    updatedPost.updateEngagementScore();
    await updatedPost.save();
    
    // Get Socket.io instance
    const io = req.app.get('io');
    
    // Create comment notification
    await notificationService.createCommentNotification({
      comment,
      post,
      actor: user
    }, io);
    
    // Process mentions in content
    if (content) {
      await notificationService.processMentions(content, {
        type: 'comment',
        id: comment._id
      }, user, io);
    }
    
    // Emit new comment event through WebSocket
    emitNewComment(io, postId, comment);
    
    res.status(201).json({
      success: true,
      data: { comment },
      message: 'Comment added successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to add comment',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get comments for a post
 * @route GET /api/posts/:postId/comments
 */
exports.getComments = async (req, res) => {
  try {
    const { postId } = req.params;
    const { cursor, limit = 15 } = req.query;
    const parsedLimit = Math.min(parseInt(limit), 50);
    const user = req.user;
    
    // Check if post exists
    const post = await Post.findById(postId);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Post not found',
        error: {
          code: 'POST_001',
          details: 'The requested post does not exist'
        },
        meta: {}
      });
    }
    
    // Base query for top-level comments
    let query = { 
      postId,
      parentId: null,
      visibility: 'public'
    };
    
    // Apply cursor-based pagination if cursor is provided
    if (cursor) {
      query._id = { $lt: cursor };
    }
    
    // Get comments
    const comments = await Comment.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit + 1) // Get one extra to determine if there are more
      .lean();
    
    // Determine if there are more comments
    const hasMore = comments.length > parsedLimit;
    
    // Remove the extra comment if there are more
    if (hasMore) {
      comments.pop();
    }
    
    // Filter out comments from blocked users if user is authenticated
    let filteredComments = comments;
    if (user && user.blockedUsers && user.blockedUsers.length > 0) {
      filteredComments = comments.filter(comment => 
        !user.blockedUsers.some(id => id.toString() === comment.userId.toString())
      );
    }
    
    // Get the next cursor
    const nextCursor = filteredComments.length > 0 
      ? filteredComments[filteredComments.length - 1]._id 
      : null;
    
    res.status(200).json({
      success: true,
      data: { comments: filteredComments },
      message: 'Comments retrieved successfully',
      error: null,
      meta: {
        pagination: {
          nextCursor: nextCursor,
          hasMore: hasMore
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve comments',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Delete a comment
 * @route DELETE /api/comments/:id
 */
exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    // Find the comment
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Comment not found',
        error: {
          code: 'COMMENT_002',
          details: 'The requested comment does not exist'
        },
        meta: {}
      });
    }
    
    // Check if user is the author or an admin
    if (comment.userId.toString() !== user._id.toString() && !user.isAdmin) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'You do not have permission to delete this comment',
        error: {
          code: 'AUTH_003',
          details: 'Not authorized to delete this comment'
        },
        meta: {}
      });
    }
    
    // Soft delete the comment
    comment.visibility = 'deleted';
    await comment.save();
    
    // Decrement comment count on post
    await Post.findByIdAndUpdate(comment.postId, {
      $inc: { commentCount: -1 }
    });
    
    // Update user's comment count
    await User.findByIdAndUpdate(user._id, {
      $inc: { 'activityMetrics.totalComments': -1 }
    });
    
    // Update post engagement score
    const post = await Post.findById(comment.postId);
    post.updateEngagementScore();
    await post.save();
    
    // Emit comment deletion event through WebSocket
    const io = req.app.get('io');
    emitCommentDeletion(io, comment.postId, comment._id);
    
    res.status(200).json({
      success: true,
      data: null,
      message: 'Comment deleted successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to delete comment',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Add a reply to a comment
 * @route POST /api/comments/:commentId/replies
 */
exports.addReply = async (req, res) => {
    try {
      const { commentId } = req.params;
      const { content, gifUrl, gifId } = req.body;
      const user = req.user;
      
      // Basic validation - either content or gifId must be provided
      if ((!content || content.trim() === '') && !gifId) {
        return res.status(400).json({
          success: false,
          data: null,
          message: 'Reply requires either text content or a GIF',
          error: {
            code: 'COMMENT_001',
            details: 'Either content or gifId is required for creating a reply'
          },
          meta: {}
        });
      }
      
      // Find the parent comment
      const parentComment = await Comment.findById(commentId);
      
      if (!parentComment) {
        return res.status(404).json({
          success: false,
          data: null,
          message: 'Parent comment not found',
          error: {
            code: 'COMMENT_002',
            details: 'The requested comment does not exist'
          },
          meta: {}
        });
      }
      
      // Check if parent comment is public
      if (parentComment.visibility !== 'public') {
        return res.status(403).json({
          success: false,
          data: null,
          message: 'Cannot reply to a non-public comment',
          error: {
            code: 'COMMENT_003',
            details: 'Comment is not public'
          },
          meta: {}
        });
      }
      
      // Check if post is public
      const post = await Post.findById(parentComment.postId);
      if (!post || post.visibility !== 'public') {
        return res.status(403).json({
          success: false,
          data: null,
          message: 'Cannot reply to a comment on a non-public post',
          error: {
            code: 'POST_005',
            details: 'Post is not public'
          },
          meta: {}
        });
      }
      
      // Check for auto-moderation if enabled in user settings
      let visibility = 'public';
      let isModerated = false;
      let moderationReason = null;
  
      if (user.contentSettings.autoModeration && content) {
        const moderationResult = moderationService.autoModerateContent(content, user);
        
        if (moderationResult.shouldModerate) {
          visibility = 'moderated';
          isModerated = true;
          moderationReason = moderationResult.moderationReason;
        }
      }
      
      // Validate GIF if provided
      let finalGifUrl = gifUrl;
      if (gifId && !gifUrl) {
        try {
          // Get GIF details from Giphy
          const gif = await giphyService.getGifById(gifId);
          finalGifUrl = gif.url;
        } catch (gifError) {
          console.error('Error fetching GIF:', gifError);
          return res.status(400).json({
            success: false,
            data: null,
            message: 'Invalid GIF ID',
            error: {
              code: 'COMMENT_007',
              details: 'The provided GIF ID could not be found'
            },
            meta: {}
          });
        }
      }
      
      // Create the reply
      const reply = await Comment.create({
        postId: parentComment.postId,
        userId: user._id,
        username: user.username,
        content: content || '',
        gifUrl: finalGifUrl,
        gifId: gifId,
        parentId: parentComment._id,
        visibility,
        isModerated,
        moderationReason
      });
      
      // Increment comment count on post
      await Post.findByIdAndUpdate(parentComment.postId, {
        $inc: { commentCount: 1 }
      });
      
      // Update user's comment count
      await User.findByIdAndUpdate(user._id, {
        $inc: { 'activityMetrics.totalComments': 1 }
      });
      
      // Update post engagement score
      const updatedPost = await Post.findById(parentComment.postId);
      updatedPost.updateEngagementScore();
      await updatedPost.save();
      
      // Get Socket.io instance
      const io = req.app.get('io');
      
      // Create reply notification
      await notificationService.createReplyNotification({
        reply,
        parentComment,
        actor: user
      }, io);
      
      // Process mentions in content
      if (content) {
        await notificationService.processMentions(content, {
          type: 'comment',
          id: reply._id
        }, user, io);
      }
      
      // Emit new comment (reply) event through WebSocket
      emitNewComment(io, parentComment.postId, reply);
      
      res.status(201).json({
        success: true,
        data: { comment: reply },
        message: 'Reply added successfully',
        error: null,
        meta: {}
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        message: 'Failed to add reply',
        error: {
          code: 'SERVER_001',
          details: error.message
        },
        meta: {}
      });
    }
  };

/**
 * Get replies to a comment
 * @route GET /api/comments/:commentId/replies
 */
exports.getReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { cursor, limit = 15 } = req.query;
    const parsedLimit = Math.min(parseInt(limit), 50);
    const user = req.user;
    
    // Check if parent comment exists
    const parentComment = await Comment.findById(commentId);
    
    if (!parentComment) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Parent comment not found',
        error: {
          code: 'COMMENT_002',
          details: 'The requested comment does not exist'
        },
        meta: {}
      });
    }
    
    // Base query for replies
    let query = { 
      parentId: commentId,
      visibility: 'public'
    };
    
    // Apply cursor-based pagination if cursor is provided
    if (cursor) {
      query._id = { $lt: cursor };
    }
    
    // Get replies
    const replies = await Comment.find(query)
      .sort({ createdAt: 1 }) // Oldest first for replies
      .limit(parsedLimit + 1) // Get one extra to determine if there are more
      .lean();
    
    // Determine if there are more replies
    const hasMore = replies.length > parsedLimit;
    
    // Remove the extra reply if there are more
    if (hasMore) {
      replies.pop();
    }
    
    // Filter out replies from blocked users if user is authenticated
    let filteredReplies = replies;
    if (user && user.blockedUsers && user.blockedUsers.length > 0) {
      filteredReplies = replies.filter(reply => 
        !user.blockedUsers.some(id => id.toString() === reply.userId.toString())
      );
    }
    
    // Get the next cursor
    const nextCursor = filteredReplies.length > 0 
      ? filteredReplies[filteredReplies.length - 1]._id 
      : null;
    
    res.status(200).json({
      success: true,
      data: { comments: filteredReplies },
      message: 'Replies retrieved successfully',
      error: null,
      meta: {
        pagination: {
          nextCursor: nextCursor,
          hasMore: hasMore
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve replies',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Add reaction to a comment
 * @route POST /api/comments/:id/reactions
 */
exports.addCommentReaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body;
    const user = req.user;
    
    // Validate reaction type
    const validReactions = ['❤️', '👍', '😂', '😮', '🙌'];
    if (!validReactions.includes(type)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Invalid reaction type',
        error: {
          code: 'COMMENT_004',
          details: 'Reaction type must be one of: ❤️, 👍, 😂, 😮, 🙌'
        },
        meta: {}
      });
    }
    
    // Find the comment
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Comment not found',
        error: {
          code: 'COMMENT_002',
          details: 'The requested comment does not exist'
        },
        meta: {}
      });
    }
    
    // Check if comment is public
    if (comment.visibility !== 'public') {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Cannot react to a non-public comment',
        error: {
          code: 'COMMENT_003',
          details: 'Comment is not public'
        },
        meta: {}
      });
    }
    
    // Check if user already reacted with this type
    const hasReacted = comment.reactionUsers[type].some(
      userId => userId.toString() === user._id.toString()
    );
    
    if (hasReacted) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'You have already reacted with this type',
        error: {
          code: 'COMMENT_005',
          details: 'User has already added this reaction'
        },
        meta: {}
      });
    }
    
    // Update comment with new reaction
    await Comment.findByIdAndUpdate(id, {
      $inc: { [`reactions.${type}`]: 1 },
      $push: { [`reactionUsers.${type}`]: user._id }
    });
    
    // Update user's reaction count
    await User.findByIdAndUpdate(user._id, {
      $inc: { 'activityMetrics.totalReactionsGiven': 1 }
    });
    
    // Update comment owner's received reactions count
    await User.findByIdAndUpdate(comment.userId, {
      $inc: { 'activityMetrics.totalReactionsReceived': 1 }
    });
    
    // Get updated comment reactions
    const updatedComment = await Comment.findById(id, 'reactions');
    
    // Create reaction notification
    const io = req.app.get('io');
    await notificationService.createReactionNotification({
      contentType: 'comment',
      contentId: comment._id,
      actor: user,
      contentOwner: { _id: comment.userId },
      reactionType: type
    }, io);
    
    // Emit comment update event
    emitCommentUpdate(io, comment.postId, {
      _id: comment._id,
      reactions: updatedComment.reactions
    });
    
    res.status(200).json({
      success: true,
      data: { reactions: updatedComment.reactions },
      message: 'Reaction added successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to add reaction',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Remove reaction from a comment
 * @route DELETE /api/comments/:id/reactions/:type
 */
exports.removeCommentReaction = async (req, res) => {
  try {
    const { id, type } = req.params;
    const user = req.user;
    
    // Validate reaction type
    const validReactions = ['❤️', '👍', '😂', '😮', '🙌'];
    if (!validReactions.includes(type)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Invalid reaction type',
        error: {
          code: 'COMMENT_004',
          details: 'Reaction type must be one of: ❤️, 👍, 😂, 😮, 🙌'
        },
        meta: {}
      });
    }
    
    // Find the comment
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Comment not found',
        error: {
          code: 'COMMENT_002',
          details: 'The requested comment does not exist'
        },
        meta: {}
      });
    }
    
    // Check if user has reacted with this type
    const hasReacted = comment.reactionUsers[type].some(
      userId => userId.toString() === user._id.toString()
    );
    
    if (!hasReacted) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'You have not reacted with this type',
        error: {
          code: 'COMMENT_006',
          details: 'User has not added this reaction'
        },
        meta: {}
      });
    }
    
    // Update comment to remove reaction
    await Comment.findByIdAndUpdate(id, {
      $inc: { [`reactions.${type}`]: -1 },
      $pull: { [`reactionUsers.${type}`]: user._id }
    });
    
    // Update user's reaction count
    await User.findByIdAndUpdate(user._id, {
      $inc: { 'activityMetrics.totalReactionsGiven': -1 }
    });
    
    // Update comment owner's received reactions count
    await User.findByIdAndUpdate(comment.userId, {
      $inc: { 'activityMetrics.totalReactionsReceived': -1 }
    });
    
    // Get updated comment reactions
    const updatedComment = await Comment.findById(id, 'reactions');
    
    // Emit comment update event
    const io = req.app.get('io');
    emitCommentUpdate(io, comment.postId, {
      _id: comment._id,
      reactions: updatedComment.reactions
    });
    
    res.status(200).json({
      success: true,
      data: { reactions: updatedComment.reactions },
      message: 'Reaction removed successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to remove reaction',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Report a comment
 * @route POST /api/comments/:id/report
 */
exports.reportComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, details } = req.body;
    const user = req.user;
    
    // Find the comment
    const comment = await Comment.findById(id);
    
    if (!comment) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Comment not found',
        error: {
          code: 'COMMENT_002',
          details: 'The requested comment does not exist'
        },
        meta: {}
      });
    }
    
    // Create a report using moderation controller
    req.body = {
      contentType: 'comment',
      contentId: id,
      reason,
      details
    };
    
    // Forward to moderation controller
    const moderationController = require('./moderationController');
    await moderationController.submitReport(req, res);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to report comment',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};