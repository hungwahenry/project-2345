// src/controllers/adminController.js
const User = require('../models/userModel');
const Post = require('../models/postModel');
const Comment = require('../models/commentModel');
const Report = require('../models/reportModel');
const Notification = require('../models/notificationModel');
const mongoose = require('mongoose');
const { emitNotification } = require('../websocket');

/**
 * Get all users with pagination and filtering
 * @route GET /api/admin/users
 */
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, sort = 'createdAt', order = 'desc', isActive } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    let query = {};
    
    // Search by username
    if (search) {
      query.username = { $regex: search, $options: 'i' };
    }
    
    // Filter by active status
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    // Determine sort order
    const sortOptions = {};
    sortOptions[sort] = order === 'asc' ? 1 : -1;
    
    // Execute query with pagination
    const users = await User.find(query)
      .select('username avatarUrl createdAt lastActive isActive isAdmin activityMetrics')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await User.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: { users },
      message: 'Users retrieved successfully',
      error: null,
      meta: {
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve users',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get user by ID with detailed information
 * @route GET /api/admin/users/:id
 */
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user with all fields
    const user = await User.findById(id);
    
    if (!user) {
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
    
    // Get additional user statistics
    const postsCount = await Post.countDocuments({ userId: user._id });
    const commentsCount = await Comment.countDocuments({ userId: user._id });
    const reportsSubmitted = await Report.countDocuments({ reporterId: user._id });
    const reportsReceived = await Report.countDocuments({ 
      $or: [
        { contentType: 'post', contentId: { $in: await Post.find({ userId: user._id }).distinct('_id') } },
        { contentType: 'comment', contentId: { $in: await Comment.find({ userId: user._id }).distinct('_id') } },
        { contentType: 'user', contentId: user._id }
      ]
    });
    
    res.status(200).json({
      success: true,
      data: { 
        user,
        statistics: {
          postsCount,
          commentsCount,
          reportsSubmitted,
          reportsReceived
        }
      },
      message: 'User retrieved successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve user',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Update user details (admin only)
 * @route PATCH /api/admin/users/:id
 */
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, isAdmin } = req.body;
    
    // Find user
    const user = await User.findById(id);
    
    if (!user) {
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
    
    // Update fields if provided
    if (isActive !== undefined) user.isActive = isActive;
    if (isAdmin !== undefined) user.isAdmin = isAdmin;
    
    // Save changes
    await user.save();
    
    // Send notification to user if their status changed
    if (isActive !== undefined) {
      const io = req.app.get('io');
      await this.createSystemNotification({
        userId: user._id,
        message: isActive 
          ? 'Your account has been activated by an administrator' 
          : 'Your account has been deactivated by an administrator',
        actionable: false
      }, io);
    }
    
    res.status(200).json({
      success: true,
      data: { user },
      message: 'User updated successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to update user',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Delete user (hard delete)
 * @route DELETE /api/admin/users/:id
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find user
    const user = await User.findById(id);
    
    if (!user) {
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
    
    // Begin transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Delete all user content
      await Post.deleteMany({ userId: user._id }, { session });
      await Comment.deleteMany({ userId: user._id }, { session });
      await Report.deleteMany({ reporterId: user._id }, { session });
      await Notification.deleteMany({ userId: user._id }, { session });
      await Notification.deleteMany({ actorId: user._id }, { session });
      
      // Delete the user
      await User.findByIdAndDelete(id, { session });
      
      // Commit transaction
      await session.commitTransaction();
      session.endSession();
      
      res.status(200).json({
        success: true,
        data: null,
        message: 'User and all associated content deleted successfully',
        error: null,
        meta: {}
      });
    } catch (error) {
      // Abort transaction on error
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to delete user',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get all posts with moderation filters
 * @route GET /api/admin/posts
 */
exports.getAllPosts = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      sort = 'createdAt', 
      order = 'desc',
      visibility,
      isModerated,
      startDate,
      endDate,
      userId
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    let query = {};
    
    // Search in content
    if (search) {
      query.content = { $regex: search, $options: 'i' };
    }
    
    // Filter by visibility
    if (visibility) {
      query.visibility = visibility;
    }
    
    // Filter by moderation status
    if (isModerated !== undefined) {
      query.isModerated = isModerated === 'true';
    }
    
    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    // Filter by user
    if (userId) {
      query.userId = userId;
    }
    
    // Determine sort order
    const sortOptions = {};
    sortOptions[sort] = order === 'asc' ? 1 : -1;
    
    // Execute query with pagination
    const posts = await Post.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Post.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: { posts },
      message: 'Posts retrieved successfully',
      error: null,
      meta: {
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve posts',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get all comments with moderation filters
 * @route GET /api/admin/comments
 */
exports.getAllComments = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      sort = 'createdAt', 
      order = 'desc',
      visibility,
      isModerated,
      postId,
      userId
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    let query = {};
    
    // Search in content
    if (search) {
      query.content = { $regex: search, $options: 'i' };
    }
    
    // Filter by visibility
    if (visibility) {
      query.visibility = visibility;
    }
    
    // Filter by moderation status
    if (isModerated !== undefined) {
      query.isModerated = isModerated === 'true';
    }
    
    // Filter by post
    if (postId) {
      query.postId = postId;
    }
    
    // Filter by user
    if (userId) {
      query.userId = userId;
    }
    
    // Determine sort order
    const sortOptions = {};
    sortOptions[sort] = order === 'asc' ? 1 : -1;
    
    // Execute query with pagination
    const comments = await Comment.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await Comment.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: { comments },
      message: 'Comments retrieved successfully',
      error: null,
      meta: {
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
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
 * Delete a post (hard delete)
 * @route DELETE /api/admin/posts/:id
 */
exports.deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { notify } = req.query;
    
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
    
    // Start a transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Delete associated comments
      await Comment.deleteMany({ postId: post._id }, { session });
      
      // Delete associated reports
      await Report.deleteMany({ contentType: 'post', contentId: post._id }, { session });
      
      // Delete the post
      await Post.findByIdAndDelete(id, { session });
      
      // Commit the transaction
      await session.commitTransaction();
      session.endSession();
      
      // Notify the user if requested
      if (notify === 'true') {
        const io = req.app.get('io');
        await this.createSystemNotification({
          userId: post.userId,
          message: 'Your post has been removed by an administrator for violating community guidelines',
          actionable: false
        }, io);
      }
      
      res.status(200).json({
        success: true,
        data: null,
        message: 'Post deleted successfully',
        error: null,
        meta: {}
      });
    } catch (error) {
      // Abort transaction on error
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
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
 * Delete a comment (hard delete)
 * @route DELETE /api/admin/comments/:id
 */
exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { notify } = req.query;
    
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
    
    // Start a transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Delete associated replies
      await Comment.deleteMany({ parentId: comment._id }, { session });
      
      // Delete associated reports
      await Report.deleteMany({ contentType: 'comment', contentId: comment._id }, { session });
      
      // Delete the comment
      await Comment.findByIdAndDelete(id, { session });
      
      // Update comment count on the post
      await Post.findByIdAndUpdate(
        comment.postId,
        { $inc: { commentCount: -1 } },
        { session }
      );
      
      // Commit the transaction
      await session.commitTransaction();
      session.endSession();
      
      // Notify the user if requested
      if (notify === 'true') {
        const io = req.app.get('io');
        await this.createSystemNotification({
          userId: comment.userId,
          message: 'Your comment has been removed by an administrator for violating community guidelines',
          actionable: false
        }, io);
      }
      
      res.status(200).json({
        success: true,
        data: null,
        message: 'Comment deleted successfully',
        error: null,
        meta: {}
      });
    } catch (error) {
      // Abort transaction on error
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
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
 * Get all reports with filtering
 * @route GET /api/admin/reports
 */
exports.getReports = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status = 'pending', 
      sort = 'createdAt', 
      order = 'desc',
      contentType
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    let query = {};
    
    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Filter by content type
    if (contentType) {
      query.contentType = contentType;
    }
    
    // Determine sort order
    const sortOptions = {};
    sortOptions[sort] = order === 'asc' ? 1 : -1;
    
    // Execute query with pagination
    const reports = await Report.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('reporterId', 'username avatarUrl');
    
    // Get total count for pagination
    const total = await Report.countDocuments(query);
    
    // Enhance reports with content details
    const enhancedReports = await Promise.all(
      reports.map(async (report) => {
        const reportObj = report.toObject();
        
        if (report.contentType === 'post') {
          const post = await Post.findById(report.contentId).select('content username userId');
          reportObj.content = post || { message: 'Content not found' };
        } else if (report.contentType === 'comment') {
          const comment = await Comment.findById(report.contentId).select('content username userId postId');
          reportObj.content = comment || { message: 'Content not found' };
        } else if (report.contentType === 'user') {
          const user = await User.findById(report.contentId).select('username avatarUrl');
          reportObj.content = user || { message: 'User not found' };
        }
        
        return reportObj;
      })
    );
    
    res.status(200).json({
      success: true,
      data: { reports: enhancedReports },
      message: 'Reports retrieved successfully',
      error: null,
      meta: {
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve reports',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Update report status
 * @route PATCH /api/admin/reports/:id
 */
exports.updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, actionTaken } = req.body;
    const admin = req.user;
    
    // Validate status
    const validStatuses = ['reviewed', 'actioned', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Invalid status',
        error: {
          code: 'MOD_005',
          details: `Status must be one of: ${validStatuses.join(', ')}`
        },
        meta: {}
      });
    }
    
    // Find the report
    const report = await Report.findById(id);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Report not found',
        error: {
          code: 'MOD_006',
          details: 'The requested report does not exist'
        },
        meta: {}
      });
    }
    
    // Update report
    report.status = status;
    report.reviewedAt = new Date();
    report.reviewedBy = admin._id;
    if (actionTaken) report.actionTaken = actionTaken;
    
    await report.save();
    
    res.status(200).json({
      success: true,
      data: { report },
      message: 'Report updated successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to update report',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Moderate a post
 * @route POST /api/admin/posts/:id/moderate
 */
exports.moderatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;
    const admin = req.user;
    
    // Validate action
    if (!['flag', 'remove', 'restore'].includes(action)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Invalid moderation action',
        error: {
          code: 'MOD_007',
          details: 'Action must be flag, remove, or restore'
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
    
    // Apply moderation action
    if (action === 'flag') {
      post.contentWarning = reason || 'Flagged by moderator';
      post.isModerated = true;
      post.moderationReason = reason || 'Violated community guidelines';
    } else if (action === 'remove') {
      post.visibility = 'moderated';
      post.isModerated = true;
      post.moderationReason = reason || 'Violated community guidelines';
      
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
    
    // Send notification to post owner
    const io = req.app.get('io');
    const notificationMessage = action === 'restore' 
      ? 'Your post has been restored by a moderator'
      : `Your post has been ${action === 'flag' ? 'flagged' : 'removed'} for ${reason || 'violating community guidelines'}`;
    
    await this.createSystemNotification({
      userId: post.userId,
      message: notificationMessage,
      actionable: true,
      actionLink: `/posts/${post._id}`,
      actionLabel: 'View Post',
      contentRef: {
        type: 'post',
        id: post._id
      }
    }, io);
    
    res.status(200).json({
      success: true,
      data: { post },
      message: 'Post moderated successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to moderate post',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Moderate a comment
 * @route POST /api/admin/comments/:id/moderate
 */
exports.moderateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;
    const admin = req.user;
    
    // Validate action
    if (!['remove', 'restore'].includes(action)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Invalid moderation action',
        error: {
          code: 'MOD_007',
          details: 'Action must be remove or restore'
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
    
    // Apply moderation action
    if (action === 'remove') {
      comment.visibility = 'moderated';
      comment.isModerated = true;
      comment.moderationReason = reason || 'Violated community guidelines';
    } else if (action === 'restore') {
      comment.visibility = 'public';
      comment.isModerated = false;
      comment.moderationReason = null;
    }
    
    // Save updated comment
    await comment.save();
    
    // Send notification to comment owner
    const io = req.app.get('io');
    const notificationMessage = action === 'restore' 
      ? 'Your comment has been restored by a moderator'
      : `Your comment has been removed for ${reason || 'violating community guidelines'}`;
    
    await this.createSystemNotification({
      userId: comment.userId,
      message: notificationMessage,
      actionable: true,
      actionLink: `/posts/${comment.postId}`,
      actionLabel: 'View Post',
      contentRef: {
        type: 'comment',
        id: comment._id
      }
    }, io);
    
    res.status(200).json({
      success: true,
      data: { comment },
      message: 'Comment moderated successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to moderate comment',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get moderation statistics
 * @route GET /api/admin/moderation/stats
 */
exports.getModerationStats = async (req, res) => {
  try {
    // Get report statistics
    const totalReports = await Report.countDocuments();
    const pendingReports = await Report.countDocuments({ status: 'pending' });
    const actionedReports = await Report.countDocuments({ status: 'actioned' });
    const dismissedReports = await Report.countDocuments({ status: 'dismissed' });
    
    // Get moderated content statistics
    const moderatedPosts = await Post.countDocuments({ isModerated: true });
    const moderatedComments = await Comment.countDocuments({ isModerated: true });
    
    // Get report categories
    const reportsByReason = await Report.aggregate([
      { $group: { _id: '$reason', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Get report trends (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const reportTrend = await Report.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
    
    // Format trend data
    const formattedTrend = reportTrend.map(day => ({
      date: `${day._id.year}-${day._id.month.toString().padStart(2, '0')}-${day._id.day.toString().padStart(2, '0')}`,
      count: day.count
    }));
    
    res.status(200).json({
      success: true,
      data: {
        reports: {
          total: totalReports,
          pending: pendingReports,
          actioned: actionedReports,
          dismissed: dismissedReports
        },
        moderated: {
          posts: moderatedPosts,
          comments: moderatedComments
        },
        categories: reportsByReason,
        trend: formattedTrend
      },
      message: 'Moderation statistics retrieved successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve moderation statistics',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get platform statistics
 * @route GET /api/admin/statistics
 */
exports.getStatistics = async (req, res) => {
  try {
    // User statistics
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const admins = await User.countDocuments({ isAdmin: true });
    
    // Content statistics
   const totalPosts = await Post.countDocuments();
   const totalComments = await Comment.countDocuments();
   const publicPosts = await Post.countDocuments({ visibility: 'public' });
   const moderatedContent = await Post.countDocuments({ isModerated: true }) + 
                            await Comment.countDocuments({ isModerated: true });
   
   // Calculate engagement metrics
   const totalReactions = await Post.aggregate([
     { 
       $group: { 
         _id: null,
         total: { 
           $sum: { 
             $add: [
               { $ifNull: ["$reactions.❤️", 0] },
               { $ifNull: ["$reactions.👍", 0] },
               { $ifNull: ["$reactions.😂", 0] },
               { $ifNull: ["$reactions.😮", 0] },
               { $ifNull: ["$reactions.🙌", 0] }
             ] 
           } 
         } 
       } 
     }
   ]);
   
   // Get post creation trend (last 30 days)
   const thirtyDaysAgo = new Date();
   thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
   
   const postTrend = await Post.aggregate([
     { $match: { createdAt: { $gte: thirtyDaysAgo } } },
     {
       $group: {
         _id: {
           year: { $year: '$createdAt' },
           month: { $month: '$createdAt' },
           day: { $dayOfMonth: '$createdAt' }
         },
         count: { $sum: 1 }
       }
     },
     { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
   ]);
   
   // Format trend data
   const formattedPostTrend = postTrend.map(day => ({
     date: `${day._id.year}-${day._id.month.toString().padStart(2, '0')}-${day._id.day.toString().padStart(2, '0')}`,
     count: day.count
   }));
   
   // Get user registration trend (last 30 days)
   const userTrend = await User.aggregate([
     { $match: { createdAt: { $gte: thirtyDaysAgo } } },
     {
       $group: {
         _id: {
           year: { $year: '$createdAt' },
           month: { $month: '$createdAt' },
           day: { $dayOfMonth: '$createdAt' }
         },
         count: { $sum: 1 }
       }
     },
     { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
   ]);
   
   // Format trend data
   const formattedUserTrend = userTrend.map(day => ({
     date: `${day._id.year}-${day._id.month.toString().padStart(2, '0')}-${day._id.day.toString().padStart(2, '0')}`,
     count: day.count
   }));
   
   // Get top hashtags
   const topHashtags = await Post.aggregate([
     { $match: { visibility: 'public' } },
     { $unwind: '$hashtags' },
     { $group: { _id: '$hashtags', count: { $sum: 1 } } },
     { $sort: { count: -1 } },
     { $limit: 10 }
   ]);
   
   // Get notification stats
   const totalNotifications = await Notification.countDocuments();
   const unreadNotifications = await Notification.countDocuments({ read: false });
   
   res.status(200).json({
     success: true,
     data: {
       users: {
         total: totalUsers,
         active: activeUsers,
         admins: admins
       },
       content: {
         posts: totalPosts,
         comments: totalComments,
         publicPosts: publicPosts,
         moderatedContent: moderatedContent
       },
       engagement: {
         reactions: totalReactions.length > 0 ? totalReactions[0].total : 0,
         commentsAverage: totalPosts > 0 ? (totalComments / totalPosts).toFixed(2) : 0
       },
       trends: {
         posts: formattedPostTrend,
         users: formattedUserTrend
       },
       topHashtags: topHashtags.map(tag => ({
         hashtag: tag._id,
         count: tag.count
       })),
       notifications: {
         total: totalNotifications,
         unread: unreadNotifications
       }
     },
     message: 'Platform statistics retrieved successfully',
     error: null,
     meta: {}
   });
 } catch (error) {
   res.status(500).json({
     success: false,
     data: null,
     message: 'Failed to retrieve platform statistics',
     error: {
       code: 'SERVER_001',
       details: error.message
     },
     meta: {}
   });
 }
};

/**
* Get system logs
* @route GET /api/admin/logs
*/
exports.getLogs = async (req, res) => {
 try {
   const { page = 1, limit = 50, level, startDate, endDate } = req.query;
   
   // In a real application, this would fetch logs from a logging service
   // For this implementation, we'll return a placeholder
   
   res.status(200).json({
     success: true,
     data: {
       logs: [
         {
           timestamp: new Date(),
           level: 'info',
           message: 'System log example - this would be actual logs in production',
           service: 'api'
         }
       ]
     },
     message: 'System logs retrieved successfully',
     error: null,
     meta: {
       pagination: {
         page: parseInt(page),
         limit: parseInt(limit),
         total: 1,
         pages: 1
       },
       note: 'This is a placeholder implementation. In a real application, this would retrieve actual system logs.'
     }
   });
 } catch (error) {
   res.status(500).json({
     success: false,
     data: null,
     message: 'Failed to retrieve system logs',
     error: {
       code: 'SERVER_001',
       details: error.message
     },
     meta: {}
   });
 }
};

/**
* Create system announcement
* @route POST /api/admin/announcements
*/
exports.createAnnouncement = async (req, res) => {
 try {
   const { message, audience, expiry, actionLink, actionLabel } = req.body;
   const admin = req.user;
   
   if (!message) {
     return res.status(400).json({
       success: false,
       data: null,
       message: 'Announcement message is required',
       error: {
         code: 'ADMIN_001',
         details: 'Message cannot be empty'
       },
       meta: {}
     });
   }
   
   // Get users to notify based on audience
   let userQuery = {};
   if (audience === 'active') {
     userQuery.isActive = true;
   } else if (audience === 'inactive') {
     userQuery.isActive = false;
   }
   // Default is 'all' users
   
   const users = await User.find(userQuery).select('_id');
   const io = req.app.get('io');
   
   // Create a notification for each user
   let notificationCount = 0;
   for (const user of users) {
     await this.createSystemNotification({
       userId: user._id,
       message,
       actionable: !!actionLink,
       actionLink,
       actionLabel
     }, io);
     notificationCount++;
   }
   
   // Broadcast announcement to all connected clients
   if (io) {
     io.emit('announcement', {
       message,
       timestamp: new Date(),
       actionLink,
       actionLabel
     });
   }
   
   res.status(201).json({
     success: true,
     data: { 
       notifiedUsers: notificationCount,
       announcement: {
         message,
         audience,
         timestamp: new Date(),
         actionLink,
         actionLabel
       }
     },
     message: 'Announcement created and notifications sent successfully',
     error: null,
     meta: {}
   });
 } catch (error) {
   res.status(500).json({
     success: false,
     data: null,
     message: 'Failed to create announcement',
     error: {
       code: 'SERVER_001',
       details: error.message
     },
     meta: {}
   });
 }
};

const Category = require('../models/categoryModel');

/**
 * Get all categories (admin)
 * @route GET /api/admin/categories
 */
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ displayOrder: 1, name: 1 });
    
    res.status(200).json({
      success: true,
      data: { categories },
      message: 'Categories retrieved successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve categories',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Create a category
 * @route POST /api/admin/categories
 */
exports.createCategory = async (req, res) => {
  try {
    const { name, description, hashtags, displayOrder, isActive } = req.body;
    
    // Validate required fields
    if (!name || !description) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Name and description are required',
        error: {
          code: 'ADMIN_002',
          details: 'Category name and description must be provided'
        },
        meta: {}
      });
    }
    
    // Create slug from name
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
    
    // Check if category with this slug already exists
    const existingCategory = await Category.findOne({ slug });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'A category with this name already exists',
        error: {
          code: 'ADMIN_003',
          details: 'Category slugs must be unique'
        },
        meta: {}
      });
    }
    
    // Create the category
    const category = await Category.create({
      slug,
      name,
      description,
      hashtags: hashtags || [],
      displayOrder: displayOrder || 0,
      isActive: isActive !== undefined ? isActive : true
    });
    
    res.status(201).json({
      success: true,
      data: { category },
      message: 'Category created successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to create category',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Update a category
 * @route PATCH /api/admin/categories/:id
 */
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, hashtags, displayOrder, isActive } = req.body;
    
    // Find the category
    const category = await Category.findById(id);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Category not found',
        error: {
          code: 'ADMIN_004',
          details: 'The requested category does not exist'
        },
        meta: {}
      });
    }
    
    // Update fields if provided
    if (name) {
      category.name = name;
      // Update slug if name changes
      category.slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
    }
    
    if (description) category.description = description;
    if (hashtags) category.hashtags = hashtags;
    if (displayOrder !== undefined) category.displayOrder = displayOrder;
    if (isActive !== undefined) category.isActive = isActive;
    
    // Save the updated category
    await category.save();
    
    res.status(200).json({
      success: true,
      data: { category },
      message: 'Category updated successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to update category',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Delete a category
 * @route DELETE /api/admin/categories/:id
 */
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the category
    const category = await Category.findById(id);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Category not found',
        error: {
          code: 'ADMIN_004',
          details: 'The requested category does not exist'
        },
        meta: {}
      });
    }
    
    // Delete the category
    await Category.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      data: null,
      message: 'Category deleted successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to delete category',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
* Update system settings
* @route PATCH /api/admin/settings
*/
exports.updateSettings = async (req, res) => {
 try {
   const { settings } = req.body;
   
   // In a real application, this would update system settings in a database
   // For this implementation, we'll return a placeholder response
   
   res.status(200).json({
     success: true,
     data: { settings },
     message: 'System settings updated successfully',
     error: null,
     meta: {
       note: 'This is a placeholder implementation. In a real application, this would update actual system settings.'
     }
   });
 } catch (error) {
   res.status(500).json({
     success: false,
     data: null,
     message: 'Failed to update system settings',
     error: {
       code: 'SERVER_001',
       details: error.message
     },
     meta: {}
   });
 }
};

/**
* Get admin activity logs
* @route GET /api/admin/activity
*/
exports.getAdminActivity = async (req, res) => {
 try {
   const { page = 1, limit = 20 } = req.query;
   
   // In a real application, this would fetch admin activity from a logging service
   // For this implementation, we'll return a placeholder
   
   res.status(200).json({
     success: true,
     data: {
       activities: [
         {
           timestamp: new Date(),
           admin: {
             _id: req.user._id,
             username: req.user.username
           },
           action: 'Viewed admin activity logs',
           details: 'Accessed the admin activity endpoint'
         }
       ]
     },
     message: 'Admin activity retrieved successfully',
     error: null,
     meta: {
       pagination: {
         page: parseInt(page),
         limit: parseInt(limit),
         total: 1,
         pages: 1
       },
       note: 'This is a placeholder implementation. In a real application, this would retrieve actual admin activity logs.'
     }
   });
 } catch (error) {
   res.status(500).json({
     success: false,
     data: null,
     message: 'Failed to retrieve admin activity',
     error: {
       code: 'SERVER_001',
       details: error.message
     },
     meta: {}
   });
 }
};

/**
 * Helper method to create system notifications
 * @private
 */
exports.createSystemNotification = async function(data, io) {
    try {
      const { userId, message, actionable = false, actionLink, actionLabel, contentRef } = data;
      
      // Create notification
      const notification = await Notification.create({
        userId,
        type: 'system',
        contentRef: contentRef || {
          type: 'post',
          id: new mongoose.Types.ObjectId('000000000000000000000000') // Use 'new' keyword here
        },
        message,
        actionable,
        actionLink,
        actionLabel
      });
      
      // Emit real-time notification if socket.io instance provided
      if (io) {
        emitNotification(io, userId, notification);
      }
      
      return notification;
    } catch (error) {
      console.error('Error creating system notification:', error);
      // Don't throw, just log - this is a helper method
    }
  };