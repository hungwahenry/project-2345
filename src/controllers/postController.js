//src/controllers/postController.js
const Post = require('../models/postModel');
const Comment = require('../models/commentModel');
const User = require('../models/userModel');
const SavedPost = require('../models/savedPostModel');
const notificationService = require('../services/notificationService');
const moderationService = require('../services/moderationService');
const searchService = require('../services/searchService');
const { 
  extractHashtags, 
  containsSensitiveContent, 
  detectLanguage,
  filterPostsForUser 
} = require('../utils/postUtils');

/**
 * Create a new post
 * @route POST /api/posts
 */
exports.createPost = async (req, res) => {
  try {
    const { content, contentWarning } = req.body;
    const user = req.user;

    // Basic validation
    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Post content cannot be empty',
        error: {
          code: 'POST_003',
          details: 'Content is required for creating a post'
        },
        meta: {}
      });
    }

    // Extract hashtags
    const hashtags = extractHashtags(content);

    // Detect language
    const language = detectLanguage(content);

    // Check for auto-moderation if enabled in user settings
    let visibility = 'public';
    let isModerated = false;
    let moderationReason = null;

    if (user.contentSettings.autoModeration) {
      const moderationResult = moderationService.autoModerateContent(content, user);
      
      if (moderationResult.shouldModerate) {
        visibility = 'moderated';
        isModerated = true;
        moderationReason = moderationResult.moderationReason;
      }
    }

    // Create the post
    const post = await Post.create({
      userId: user._id,
      username: user.username,
      content,
      contentWarning,
      hashtags,
      language,
      visibility,
      isModerated,
      moderationReason
    });

    // Update user's post count
    await User.findByIdAndUpdate(user._id, {
      $inc: { 'activityMetrics.totalPosts': 1 }
    });
    
    // Process mentions in content
    const io = req.app.get('io');
    await notificationService.processMentions(content, {
      type: 'post',
      id: post._id
    }, user, io);

    res.status(201).json({
      success: true,
      data: { post },
      message: 'Post created successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to create post',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get personalized feed
 * @route GET /api/posts/feed
 */
exports.getPersonalizedFeed = async (req, res) => {
  try {
    const user = req.user;
    const { cursor, limit = 15 } = req.query;
    const parsedLimit = Math.min(parseInt(limit), 50);
    
    // Base query
    let query = { visibility: 'public' };
    
    // Apply cursor-based pagination if cursor is provided
    if (cursor) {
      query._id = { $lt: cursor };
    }
    
    // Filter out posts from blocked users if user is authenticated
    if (user && user.blockedUsers && user.blockedUsers.length > 0) {
      query.userId = { $nin: user.blockedUsers };
    }
    
    // Get posts
    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit + 1) // Get one extra to determine if there are more
      .lean();
    
    // Determine if there are more posts
    const hasMore = posts.length > parsedLimit;
    
    // Remove the extra post if there are more
    if (hasMore) {
      posts.pop();
    }
    
    // Apply user-specific filtering
    const filteredPosts = user ? filterPostsForUser(posts, user) : posts;
    
    // Get the next cursor
    const nextCursor = filteredPosts.length > 0 
      ? filteredPosts[filteredPosts.length - 1]._id 
      : null;
    
    res.status(200).json({
      success: true,
      data: { posts: filteredPosts },
      message: 'Feed retrieved successfully',
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
      message: 'Failed to retrieve feed',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get a specific post with comments
 * @route GET /api/posts/:id
 */
exports.getPost = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    // Find the post
    const post = await Post.findById(id);
    
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
    
    // Check if post is visible to user
    if (post.visibility !== 'public') {
      if (!user || (post.userId.toString() !== user._id.toString() && !user.isAdmin)) {
        return res.status(403).json({
          success: false,
          data: null,
          message: 'You do not have permission to view this post',
          error: {
            code: 'AUTH_003',
            details: 'Post is not public'
          },
          meta: {}
        });
      }
    }
    
    // Increment impression count
    await Post.findByIdAndUpdate(id, { $inc: { impressionCount: 1 } });
    
    // Get top-level comments for the post
    const comments = await Comment.find({
      postId: id,
      parentId: null,
      visibility: 'public'
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
    
    // Filter comments if user is authenticated
    const filteredComments = user ? 
      comments.filter(comment => 
        !user.blockedUsers.some(id => id.toString() === comment.userId.toString())
      ) : 
      comments;
    
    res.status(200).json({
      success: true,
      data: { 
        post,
        comments: filteredComments 
      },
      message: 'Post retrieved successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve post',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Delete a post
 * @route DELETE /api/posts/:id
 */
exports.deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    // Find the post
    const post = await Post.findById(id);
    
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
    
    // Check if user is the author or an admin
    if (post.userId.toString() !== user._id.toString() && !user.isAdmin) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'You do not have permission to delete this post',
        error: {
          code: 'AUTH_003',
          details: 'Not authorized to delete this post'
        },
        meta: {}
      });
    }
    
    // Soft delete the post
    post.visibility = 'deleted';
    await post.save();
    
    // Decrement user's post count
    await User.findByIdAndUpdate(user._id, {
      $inc: { 'activityMetrics.totalPosts': -1 }
    });
    
    res.status(200).json({
      success: true,
      data: null,
      message: 'Post deleted successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to delete post',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Add reaction to a post
 * @route POST /api/posts/:id/reactions
 */
exports.addReaction = async (req, res) => {
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
          code: 'POST_004',
          details: 'Reaction type must be one of: ❤️, 👍, 😂, 😮, 🙌'
        },
        meta: {}
      });
    }
    
    // Find the post
    const post = await Post.findById(id);
    
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
        message: 'Cannot react to a non-public post',
        error: {
          code: 'POST_005',
          details: 'Post is not public'
        },
        meta: {}
      });
    }
    
    // Check if user already reacted with this type
    const reactionField = `reactionUsers.${type}`;
    const hasReacted = post.reactionUsers[type].some(
      userId => userId.toString() === user._id.toString()
    );
    
    if (hasReacted) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'You have already reacted with this type',
        error: {
          code: 'POST_006',
          details: 'User has already added this reaction'
        },
        meta: {}
      });
    }
    
    // Update post with new reaction
    await Post.findByIdAndUpdate(id, {
      $inc: { [`reactions.${type}`]: 1 },
      $push: { [`reactionUsers.${type}`]: user._id }
    });
    
    // Update user's reaction count
    await User.findByIdAndUpdate(user._id, {
      $inc: { 'activityMetrics.totalReactionsGiven': 1 }
    });
    
    // Update post owner's received reactions count
    await User.findByIdAndUpdate(post.userId, {
      $inc: { 'activityMetrics.totalReactionsReceived': 1 }
    });
    
    // Get updated post reactions
    const updatedPost = await Post.findById(id, 'reactions');
    
    // Update engagement score
    updatedPost.updateEngagementScore();
    await updatedPost.save();
    
    // Create reaction notification
    const io = req.app.get('io');
    await notificationService.createReactionNotification({
      contentType: 'post',
      contentId: post._id,
      actor: user,
      contentOwner: { _id: post.userId },
      reactionType: type
    }, io);
    
    res.status(200).json({
      success: true,
      data: { reactions: updatedPost.reactions },
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
 * Remove reaction from a post
 * @route DELETE /api/posts/:id/reactions/:type
 */
exports.removeReaction = async (req, res) => {
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
          code: 'POST_004',
          details: 'Reaction type must be one of: ❤️, 👍, 😂, 😮, 🙌'
        },
        meta: {}
      });
    }
    
    // Find the post
    const post = await Post.findById(id);
    
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
    
    // Check if user has reacted with this type
    const hasReacted = post.reactionUsers[type].some(
      userId => userId.toString() === user._id.toString()
    );
    
    if (!hasReacted) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'You have not reacted with this type',
        error: {
          code: 'POST_007',
          details: 'User has not added this reaction'
        },
        meta: {}
      });
    }
    
    // Update post to remove reaction
    await Post.findByIdAndUpdate(id, {
      $inc: { [`reactions.${type}`]: -1 },
      $pull: { [`reactionUsers.${type}`]: user._id }
    });
    
    // Update user's reaction count
    await User.findByIdAndUpdate(user._id, {
      $inc: { 'activityMetrics.totalReactionsGiven': -1 }
    });
    
    // Update post owner's received reactions count
    await User.findByIdAndUpdate(post.userId, {
      $inc: { 'activityMetrics.totalReactionsReceived': -1 }
    });
    
    // Get updated post reactions
    const updatedPost = await Post.findById(id, 'reactions');
    
    // Update engagement score
    updatedPost.updateEngagementScore();
    await updatedPost.save();
    
    res.status(200).json({
      success: true,
      data: { reactions: updatedPost.reactions },
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
 * Save a post
 * @route POST /api/posts/:id/save
 */
exports.savePost = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    // Find the post
    const post = await Post.findById(id);
    
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
        message: 'Cannot save a non-public post',
        error: {
          code: 'POST_005',
          details: 'Post is not public'
        },
        meta: {}
      });
    }
    
    // Check if post is already saved
    const existingSaved = await SavedPost.findOne({
      userId: user._id,
      postId: id
    });
    
    if (existingSaved) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Post already saved',
        error: {
          code: 'POST_008',
          details: 'User has already saved this post'
        },
        meta: {}
      });
    }
    
    // Save the post
    await SavedPost.create({
      userId: user._id,
      postId: id
    });
    
    // Increment save count on post
    await Post.findByIdAndUpdate(id, {
      $inc: { saveCount: 1 }
    });
    
    res.status(200).json({
      success: true,
      data: null,
      message: 'Post saved successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to save post',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Unsave a post
 * @route DELETE /api/posts/:id/save
 */
exports.unsavePost = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    // Find the saved post
    const savedPost = await SavedPost.findOne({
      userId: user._id,
      postId: id
    });
    
    if (!savedPost) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Post not in saved list',
        error: {
          code: 'POST_009',
          details: 'User has not saved this post'
        },
        meta: {}
      });
    }
    
    // Remove from saved posts
    await SavedPost.deleteOne({
      userId: user._id,
      postId: id
    });
    
    // Decrement save count on post
    await Post.findByIdAndUpdate(id, {
      $inc: { saveCount: -1 }
    });
    
    res.status(200).json({
      success: true,
      data: null,
      message: 'Post removed from saved list',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to remove post from saved list',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get saved posts
 * @route GET /api/posts/saved
 */
exports.getSavedPosts = async (req, res) => {
  try {
    const user = req.user;
    const { cursor, limit = 15 } = req.query;
    const parsedLimit = Math.min(parseInt(limit), 50);
    
    // Base query
    let query = { userId: user._id };
    
    // Apply cursor-based pagination if cursor is provided
    if (cursor) {
      const cursorDoc = await SavedPost.findById(cursor);
      if (cursorDoc) {
        query.savedAt = { $lt: cursorDoc.savedAt };
      }
    }
    
    // Get saved posts
    const savedPosts = await SavedPost.find(query)
      .sort({ savedAt: -1 })
      .limit(parsedLimit + 1) // Get one extra to determine if there are more
      .lean();
    
    // Determine if there are more saved posts
    const hasMore = savedPosts.length > parsedLimit;
    
    // Remove the extra saved post if there are more
    if (hasMore) {
      savedPosts.pop();
    }
    
    // Get the post IDs
    const postIds = savedPosts.map(saved => saved.postId);
    
    // Get the actual posts
    const posts = await Post.find({
      _id: { $in: postIds },
      visibility: 'public'
    }).lean();
    
    // Sort posts in the same order as saved posts
    const orderedPosts = postIds.map(id => 
      posts.find(post => post._id.toString() === id.toString())
    ).filter(Boolean);
    
    // Get the next cursor
    const nextCursor = savedPosts.length > 0 
      ? savedPosts[savedPosts.length - 1]._id 
      : null;
    
    res.status(200).json({
      success: true,
      data: { posts: orderedPosts },
      message: 'Saved posts retrieved successfully',
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
      message: 'Failed to retrieve saved posts',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Report a post
 * @route POST /api/posts/:id/report
 */
exports.reportPost = async (req, res) => {
    try {
      const { id } = req.params;
      const { reason, details } = req.body;
      const user = req.user;
      
      // Find the post
      const post = await Post.findById(id);
      
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
      
      // Create a report using moderation controller
      req.body = {
        contentType: 'post',
        contentId: id,
        reason,
        details
      };
      
      // Forward to moderation controller
      const moderationController = require('../controllers/moderationController');
      await moderationController.submitReport(req, res);
      
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        message: 'Failed to report post',
        error: {
          code: 'SERVER_001',
          details: error.message
        },
        meta: {}
      });
    }
  };

/**
 * Get trending posts
 * @route GET /api/posts/trending
 */
exports.getTrendingPosts = async (req, res) => {
  try {
    const { timeframe = '24h', category, limit = 15 } = req.query;
    const user = req.user;
    const parsedLimit = Math.min(parseInt(limit), 50);
    
    // Calculate timeframe
    const now = new Date();
    let startTime;
    
    if (timeframe === '24h') {
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (timeframe === '7d') {
      startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default
    }
    
    // Build query
    let query = {
      visibility: 'public',
      createdAt: { $gte: startTime }
    };
    
    // Add category filter if specified
    if (category) {
      query.hashtags = category;
    }
    
    // Get posts with highest engagement score
    const posts = await Post.find(query)
      .sort({ engagementScore: -1 })
      .limit(parsedLimit)
      .lean();
    
    // Filter posts based on user preferences
    const filteredPosts = user ? filterPostsForUser(posts, user) : posts;
    
    res.status(200).json({
      success: true,
      data: { posts: filteredPosts },
      message: 'Trending posts retrieved successfully',
      error: null,
      meta: {
        timeframe,
        category: category || 'all'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve trending posts',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get posts by hashtag
 * @route GET /api/posts/hashtag/:tag
 */
exports.getPostsByHashtag = async (req, res) => {
  try {
    const { tag } = req.params;
    const { cursor, limit = 15 } = req.query;
    const user = req.user;
    const parsedLimit = Math.min(parseInt(limit), 50);
    
    // Base query
    let query = { 
      visibility: 'public',
      hashtags: tag.toLowerCase() 
    };
    
    // Apply cursor-based pagination if cursor is provided
    if (cursor) {
      query._id = { $lt: cursor };
    }
    
    // Get posts
    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit + 1) // Get one extra to determine if there are more
      .lean();
    
    // Determine if there are more posts
    const hasMore = posts.length > parsedLimit;
    
    // Remove the extra post if there are more
    if (hasMore) {
      posts.pop();
    }
    
    // Filter posts based on user preferences
    const filteredPosts = user ? filterPostsForUser(posts, user) : posts;
    
    // Get the next cursor
    const nextCursor = filteredPosts.length > 0 
      ? filteredPosts[filteredPosts.length - 1]._id 
      : null;
    
    res.status(200).json({
      success: true,
      data: { posts: filteredPosts },
      message: 'Posts by hashtag retrieved successfully',
      error: null,
      meta: {
        pagination: {
          nextCursor: nextCursor,
          hasMore: hasMore
        },
        hashtag: tag
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve posts by hashtag',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get user's posts
 * @route GET /api/posts/user/:userId
 */
exports.getUserPosts = async (req, res) => {
  try {
    const { userId } = req.params;
    const { cursor, limit = 15 } = req.query;
    const user = req.user;
    const parsedLimit = Math.min(parseInt(limit), 50);
    
    // Check if the user exists
    const postAuthor = await User.findById(userId);
    
    if (!postAuthor) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'User not found',
        error: {
          code: 'USER_002',
          details: 'The requested user does not exist'
        },
        meta: {}
      });
    }
    
    // Check if the current user has blocked or been blocked by the user
    if (user) {
      const isBlocked = user.blockedUsers.some(id => id.toString() === userId);
      const isBlockedBy = postAuthor.blockedUsers.some(id => id.toString() === user._id.toString());
      
      if (isBlocked || isBlockedBy) {
        return res.status(403).json({
          success: false,
          data: null,
          message: 'Cannot view posts from this user',
          error: {
            code: 'USER_010',
            details: 'User is blocked or has blocked you'
          },
          meta: {}
        });
      }
    }
    
    // Base query
    let query = { 
      userId,
      visibility: 'public'
    };
    
    // Apply cursor-based pagination if cursor is provided
    if (cursor) {
      query._id = { $lt: cursor };
    }
    
    // Get posts
    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit + 1) // Get one extra to determine if there are more
      .lean();
    
      // Determine if there are more posts
    const hasMore = posts.length > parsedLimit;
    
    // Remove the extra post if there are more
    if (hasMore) {
      posts.pop();
    }
    
    // Filter posts based on user preferences
    const filteredPosts = user ? filterPostsForUser(posts, user) : posts;
    
    // Get the next cursor
    const nextCursor = filteredPosts.length > 0 
      ? filteredPosts[filteredPosts.length - 1]._id 
      : null;
    
    res.status(200).json({
      success: true,
      data: { posts: filteredPosts },
      message: 'User posts retrieved successfully',
      error: null,
      meta: {
        pagination: {
          nextCursor: nextCursor,
          hasMore: hasMore
        },
        userId
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve user posts',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get explore content
 * @route GET /api/posts/explore
 */
exports.getExploreContent = async (req, res) => {
  try {
    const { category, cursor, limit = 15 } = req.query;
    const user = req.user;
    const parsedLimit = Math.min(parseInt(limit), 50);
    
    // Base query
    let query = { visibility: 'public' };
    
    // Add category filter if specified
    if (category) {
      query.hashtags = category;
    }
    
    // Apply cursor-based pagination if cursor is provided
    if (cursor) {
      query._id = { $lt: cursor };
    }
    
    // Filter out posts from blocked users if user is authenticated
    if (user && user.blockedUsers && user.blockedUsers.length > 0) {
      query.userId = { $nin: user.blockedUsers };
    }
    
    // Get posts - mix of recent and high engagement
    const recentPosts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.floor(parsedLimit / 2))
      .lean();
      
    const engagementPosts = await Post.find(query)
      .sort({ engagementScore: -1 })
      .limit(Math.ceil(parsedLimit / 2) + 1) // Get one extra to determine if there are more
      .lean();
    
    // Determine if there are more posts
    const hasMore = engagementPosts.length > Math.ceil(parsedLimit / 2);
    
    // Remove the extra post if there are more
    if (hasMore) {
      engagementPosts.pop();
    }
    
    // Combine and remove duplicates
    let posts = [...recentPosts];
    
    for (const post of engagementPosts) {
      if (!posts.some(p => p._id.toString() === post._id.toString())) {
        posts.push(post);
      }
    }
    
    // Filter posts based on user preferences
    const filteredPosts = user ? filterPostsForUser(posts, user) : posts;
    
    // Get the next cursor
    const nextCursor = filteredPosts.length > 0 
      ? filteredPosts[filteredPosts.length - 1]._id 
      : null;
    
    res.status(200).json({
      success: true,
      data: { posts: filteredPosts },
      message: 'Explore content retrieved successfully',
      error: null,
      meta: {
        pagination: {
          nextCursor: nextCursor,
          hasMore: hasMore
        },
        category: category || 'all'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve explore content',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};