//src/controllers/userController.j
const User = require('../models/userModel');
const Post = require('../models/postModel');
const searchService = require('../services/searchService');

/**
 * Get current user profile
 * @route GET /api/users/me
 */
exports.getCurrentUser = async (req, res) => {
  try {
    const user = req.user;
    
    // Remove sensitive data before sending response
    const userResponse = {
      _id: user._id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      lastActive: user.lastActive,
      settings: user.settings,
      activityMetrics: user.activityMetrics,
      contentSettings: user.contentSettings,
      keywordFilters: user.keywordFilters,
      isAdmin: user.isAdmin
    };
    
    res.status(200).json({
      success: true,
      data: { user: userResponse },
      message: 'User profile retrieved successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve user profile',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Update current user profile
 * @route PATCH /api/users/me
 */
exports.updateCurrentUser = async (req, res) => {
  try {
    const { 
      avatarUrl, 
      settings, 
      contentSettings
    } = req.body;
    
    const user = req.user;
    
    // Update fields if provided
    if (avatarUrl) user.avatarUrl = avatarUrl;
    if (settings) {
      // Update notification preferences
      if (settings.notificationPreferences) {
        user.settings.notificationPreferences = {
          ...user.settings.notificationPreferences,
          ...settings.notificationPreferences
        };
      }
      
      // Update content filters
      if (settings.contentFilters) {
        user.settings.contentFilters = {
          ...user.settings.contentFilters,
          ...settings.contentFilters
        };
      }
      
      // Update other settings
      if (settings.darkMode !== undefined) user.settings.darkMode = settings.darkMode;
      if (settings.dataCollection !== undefined) user.settings.dataCollection = settings.dataCollection;
    }
    
    // Update content settings
    if (contentSettings) {
      if (contentSettings.defaultVisibility) user.contentSettings.defaultVisibility = contentSettings.defaultVisibility;
      if (contentSettings.autoModeration !== undefined) user.contentSettings.autoModeration = contentSettings.autoModeration;
    }
    
    // Save the updated user
    await user.save();
    
    // Remove sensitive data before sending response
    const userResponse = {
      _id: user._id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      lastActive: user.lastActive,
      settings: user.settings,
      activityMetrics: user.activityMetrics,
      contentSettings: user.contentSettings,
      keywordFilters: user.keywordFilters,
      isAdmin: user.isAdmin
    };
    
    res.status(200).json({
      success: true,
      data: { user: userResponse },
      message: 'User profile updated successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to update user profile',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get user's public profile
 * @route GET /api/users/:username/public
 */
exports.getPublicProfile = async (req, res) => {
  try {
    const { username } = req.params;
    const currentUser = req.user;
    
    // Find user by username
    const user = await User.findOne({ username });
    
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
    
    // Check if user is blocked (if authenticated)
    if (currentUser) {
      const isBlocked = currentUser.blockedUsers.some(
        id => id.toString() === user._id.toString()
      );
      
      const isBlockedBy = user.blockedUsers.some(
        id => id.toString() === currentUser._id.toString()
      );
      
      if (isBlocked || isBlockedBy) {
        return res.status(403).json({
          success: false,
          data: null,
          message: 'Cannot view this user profile',
          error: {
            code: 'USER_010',
            details: 'User is blocked or has blocked you'
          },
          meta: {}
        });
      }
    }
    
    // Create public profile response
    const publicProfile = {
      _id: user._id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      activityMetrics: user.activityMetrics
    };
    
    res.status(200).json({
      success: true,
      data: { publicProfile },
      message: 'Public profile retrieved successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve public profile',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Block a user
 * @route POST /api/users/block/:username
 */
exports.blockUser = async (req, res) => {
  try {
    const { username } = req.params;
    const user = req.user;
    
    // Find user to block
    const userToBlock = await User.findOne({ username });
    
    if (!userToBlock) {
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
    
    // Cannot block yourself
    if (userToBlock._id.toString() === user._id.toString()) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'You cannot block yourself',
        error: {
          code: 'USER_003',
          details: 'Self-blocking is not allowed'
        },
        meta: {}
      });
    }
    
    // Check if already blocked
    const alreadyBlocked = user.blockedUsers.some(
      id => id.toString() === userToBlock._id.toString()
    );
    
    if (alreadyBlocked) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'User is already blocked',
        error: {
          code: 'USER_004',
          details: 'This user is already in your blocked list'
        },
        meta: {}
      });
    }
    
    // Add user to blocked list
    user.blockedUsers.push(userToBlock._id);
    await user.save();
    
    res.status(200).json({
      success: true,
      data: null,
      message: 'User blocked successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to block user',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Unblock a user
 * @route DELETE /api/users/block/:username
 */
exports.unblockUser = async (req, res) => {
  try {
    const { username } = req.params;
    const user = req.user;
    
    // Find user to unblock
    const userToUnblock = await User.findOne({ username });
    
    if (!userToUnblock) {
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
    
    // Check if user is blocked
    const isBlocked = user.blockedUsers.some(
      id => id.toString() === userToUnblock._id.toString()
    );
    
    if (!isBlocked) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'User is not in your blocked list',
        error: {
          code: 'USER_005',
          details: 'This user is not in your blocked list'
        },
        meta: {}
      });
    }
    
    // Remove user from blocked list
    user.blockedUsers = user.blockedUsers.filter(
      id => id.toString() !== userToUnblock._id.toString()
    );
    await user.save();
    
    res.status(200).json({
      success: true,
      data: null,
      message: 'User unblocked successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to unblock user',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get blocked users
 * @route GET /api/users/blocked
 */
exports.getBlockedUsers = async (req, res) => {
  try {
    const user = req.user;
    
    // Get details of blocked users
    const blockedUsers = await User.find(
      { _id: { $in: user.blockedUsers } },
      'username avatarUrl'
    );
    
    res.status(200).json({
      success: true,
      data: { blockedUsers },
      message: 'Blocked users retrieved successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve blocked users',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Add keyword filter
 * @route POST /api/users/keyword-filters
 */
exports.addKeywordFilter = async (req, res) => {
  try {
    const { keyword } = req.body;
    const user = req.user;
    
    // Basic validation
    if (!keyword || keyword.trim() === '') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Keyword cannot be empty',
        error: {
          code: 'USER_006',
          details: 'Keyword is required'
        },
        meta: {}
      });
    }
    
    // Normalize keyword
    const normalizedKeyword = keyword.trim().toLowerCase();
    
    // Check if keyword already exists
    const keywordExists = user.keywordFilters.includes(normalizedKeyword);
    
    if (keywordExists) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Keyword already exists',
        error: {
          code: 'USER_007',
          details: 'This keyword is already in your filter list'
        },
        meta: {}
      });
    }
    
    // Add keyword to filters
    user.keywordFilters.push(normalizedKeyword);
    await user.save();
    
    res.status(200).json({
      success: true,
      data: { filters: user.keywordFilters },
      message: 'Keyword filter added successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to add keyword filter',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get keyword filters
 * @route GET /api/users/keyword-filters
 */
exports.getKeywordFilters = async (req, res) => {
  try {
    const user = req.user;
    
    res.status(200).json({
      success: true,
      data: { filters: user.keywordFilters },
      message: 'Keyword filters retrieved successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve keyword filters',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Remove keyword filter
 * @route DELETE /api/users/keyword-filters/:keyword
 */
exports.removeKeywordFilter = async (req, res) => {
  try {
    const { keyword } = req.params;
    const user = req.user;
    
    // Normalize keyword
    const normalizedKeyword = keyword.trim().toLowerCase();
    
    // Check if keyword exists
    const keywordExists = user.keywordFilters.includes(normalizedKeyword);
    
    if (!keywordExists) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Keyword not found',
        error: {
          code: 'USER_008',
          details: 'This keyword is not in your filter list'
        },
        meta: {}
      });
    }
    // Remove keyword from filters
    user.keywordFilters = user.keywordFilters.filter(k => k !== normalizedKeyword);
    await user.save();
    
    res.status(200).json({
      success: true,
      data: { filters: user.keywordFilters },
      message: 'Keyword filter removed successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to remove keyword filter',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Delete user account
 * @route DELETE /api/users/me
 */
exports.deleteAccount = async (req, res) => {
  try {
    const user = req.user;
    
    // Soft delete by deactivating account
    user.isActive = false;
    await user.save();
    
    res.status(200).json({
      success: true,
      data: null,
      message: 'Account deleted successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to delete account',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get user activity stats
 * @route GET /api/users/me/stats
 */
exports.getUserStats = async (req, res) => {
  try {
    const user = req.user;
    
    // Get additional stats that aren't stored in user document
    const postsCount = await Post.countDocuments({ 
      userId: user._id,
      visibility: 'public'
    });
    
    // Combine with stored metrics
    const stats = {
      postsCount,
      commentsCount: user.activityMetrics.totalComments,
      reactionsGiven: user.activityMetrics.totalReactionsGiven,
      reactionsReceived: user.activityMetrics.totalReactionsReceived,
      accountAge: Math.floor((Date.now() - user.createdAt) / (1000 * 60 * 60 * 24)) // in days
    };
    
    res.status(200).json({
      success: true,
      data: { stats },
      message: 'User stats retrieved successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve user stats',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get active sessions
 * @route GET /api/users/me/active-sessions
 */
exports.getActiveSessions = async (req, res) => {
  try {
    const user = req.user;
    
    res.status(200).json({
      success: true,
      data: { sessions: user.activeSessions },
      message: 'Active sessions retrieved successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve active sessions',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * End a session
 * @route DELETE /api/users/me/active-sessions/:id
 */
exports.endSession = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    // Check if session exists
    const sessionExists = user.activeSessions.some(
      session => session.sessionId === id
    );
    
    if (!sessionExists) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Session not found',
        error: {
          code: 'USER_009',
          details: 'The requested session does not exist'
        },
        meta: {}
      });
    }
    
    // Remove session
    user.activeSessions = user.activeSessions.filter(
      session => session.sessionId !== id
    );
    await user.save();
    
    res.status(200).json({
      success: true,
      data: null,
      message: 'Session ended successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to end session',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};