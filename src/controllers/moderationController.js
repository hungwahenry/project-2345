// src/controllers/moderationController.js
const Report = require('../models/reportModel');
const Post = require('../models/postModel');
const Comment = require('../models/commentModel');
const User = require('../models/userModel');
const moderationService = require('../services/moderationService');

/**
 * Submit report
 * @route POST /api/moderation/report
 */
exports.submitReport = async (req, res) => {
    try {
      const { contentType, contentId, reason, details } = req.body;
      const user = req.user;
      
      // Validate content type
      if (!['post', 'comment', 'user'].includes(contentType)) {
        return res.status(400).json({
          success: false,
          data: null,
          message: 'Invalid content type',
          error: {
            code: 'MOD_001',
            details: 'Content type must be post, comment, or user'
          },
          meta: {}
        });
      }
      
      // Validate reason
      const validReasons = [
        'harassment', 'spam', 'inappropriate', 'violence', 
        'misinformation', 'copyright', 'other'
      ];
      
      if (!validReasons.includes(reason)) {
        return res.status(400).json({
          success: false,
          data: null,
          message: 'Invalid report reason',
          error: {
            code: 'MOD_002',
            details: `Reason must be one of: ${validReasons.join(', ')}`
          },
          meta: {}
        });
      }
      
      // Verify that the content exists
      let content;
      if (contentType === 'post') {
        content = await Post.findById(contentId);
      } else if (contentType === 'comment') {
        content = await Comment.findById(contentId);
      } else if (contentType === 'user') {
        content = await User.findById(contentId);
      }
      
      if (!content) {
        return res.status(404).json({
          success: false,
          data: null,
          message: 'Content not found',
          error: {
            code: 'MOD_003',
            details: 'The reported content does not exist'
          },
          meta: {}
        });
      }
      
      // Check if user has already reported this content
      const Report = require('../models/reportModel');
      
      const existingReport = await Report.findOne({
        contentType,
        contentId,
        reporterId: user._id
      });
      
      if (existingReport) {
        return res.status(400).json({
          success: false,
          data: null,
          message: 'You have already reported this content',
          error: {
            code: 'MOD_004',
            details: 'A user can only report a specific content once'
          },
          meta: {}
        });
      }
      
      // Create the report
      const report = await Report.create({
        contentType,
        contentId,
        reporterId: user._id,
        reason,
        details: details || '',
        status: 'pending'
      });
      
      res.status(201).json({
        success: true,
        data: null,
        message: 'Content reported successfully',
        error: null,
        meta: {}
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        message: 'Failed to submit report',
        error: {
          code: 'SERVER_001',
          details: error.message
        },
        meta: {}
      });
    }
  };

/**
 * Get reports (admin only)
 * @route GET /api/moderation/reports
 */
exports.getReports = async (req, res) => {
  try {
    const { status = 'pending', cursor, limit = 15 } = req.query;
    const parsedLimit = Math.min(parseInt(limit), 50);
    
    // Validate status
    const validStatuses = ['pending', 'reviewed', 'actioned', 'dismissed', 'all'];
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
    
    // Build query
    let query = {};
    if (status !== 'all') {
      query.status = status;
    }
    
    // Apply cursor-based pagination if cursor is provided
    if (cursor) {
      query._id = { $lt: cursor };
    }
    
    // Get reports
    const reports = await Report.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit + 1) // Get one extra to determine if there are more
      .populate('reporterId', 'username avatarUrl')
      .lean();
    
    // Determine if there are more reports
    const hasMore = reports.length > parsedLimit;
    
    // Remove the extra report if there are more
    if (hasMore) {
      reports.pop();
    }
    
    // Get the next cursor
    const nextCursor = reports.length > 0 
      ? reports[reports.length - 1]._id 
      : null;
    
    // Populate content details (simplified version)
    for (const report of reports) {
      if (report.contentType === 'post') {
        const post = await Post.findById(report.contentId, 'content username userId');
        report.content = post ? {
          id: post._id,
          content: post.content,
          username: post.username,
          userId: post.userId
        } : { content: '[Content not found]' };
      } else if (report.contentType === 'comment') {
        const comment = await Comment.findById(report.contentId, 'content username userId postId');
        report.content = comment ? {
          id: comment._id,
          content: comment.content,
          username: comment.username,
          userId: comment.userId,
          postId: comment.postId
        } : { content: '[Content not found]' };
      } else if (report.contentType === 'user') {
        const user = await User.findById(report.contentId, 'username avatarUrl');
        report.content = user ? {
          id: user._id,
          username: user.username,
          avatarUrl: user.avatarUrl
        } : { content: '[User not found]' };
      }
    }
    
    res.status(200).json({
      success: true,
      data: { reports },
      message: 'Reports retrieved successfully',
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
 * Update report status (admin only)
 * @route PATCH /api/moderation/reports/:id
 */
exports.updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, action } = req.body;
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
    report.actionTaken = action || null;
    
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
   * Moderate a post (admin only)
   * @route POST /api/moderation/posts/:id/moderate
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
      
      // Get the Socket.io instance
      const io = req.app.get('io');
      
      // Apply moderation
      const moderatedPost = await moderationService.moderatePost(
        post,
        action,
        reason || 'Violation of community guidelines',
        admin,
        io
      );
      
      res.status(200).json({
        success: true,
        data: { post: moderatedPost },
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
   * Moderate a comment (admin only)
   * @route POST /api/moderation/comments/:id/moderate
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
      
      // Get the Socket.io instance
      const io = req.app.get('io');
      
      // Apply moderation
      const moderatedComment = await moderationService.moderateComment(
        comment,
        action,
        reason || 'Violation of community guidelines',
        admin,
        io
      );
      
      res.status(200).json({
        success: true,
        data: { comment: moderatedComment },
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