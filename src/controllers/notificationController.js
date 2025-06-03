// src/controllers/notificationController.js
const Notification = require('../models/notificationModel');
const User = require('../models/userModel');

/**
 * Get user notifications
 * @route GET /api/notifications
 */
exports.getNotifications = async (req, res) => {
  try {
    const user = req.user;
    const { cursor, limit = 15, read } = req.query;
    const parsedLimit = Math.min(parseInt(limit), 50);
    
    // Base query
    let query = { userId: user._id };
    
    // Filter by read status if specified
    if (read !== undefined) {
      query.read = read === 'true';
    }
    
    // Apply cursor-based pagination if cursor is provided
    if (cursor) {
      query._id = { $lt: cursor };
    }
    
    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit + 1) // Get one extra to determine if there are more
      .lean();
    
    // Determine if there are more notifications
    const hasMore = notifications.length > parsedLimit;
    
    // Remove the extra notification if there are more
    if (hasMore) {
      notifications.pop();
    }
    
    // Get the next cursor
    const nextCursor = notifications.length > 0 
      ? notifications[notifications.length - 1]._id 
      : null;
    
    res.status(200).json({
      success: true,
      data: { notifications },
      message: 'Notifications retrieved successfully',
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
      message: 'Failed to retrieve notifications',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Mark a notification as read
 * @route PATCH /api/notifications/:id/read
 */
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    // Find the notification
    const notification = await Notification.findOne({
      _id: id,
      userId: user._id
    });
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Notification not found',
        error: {
          code: 'NOTIF_001',
          details: 'The requested notification does not exist'
        },
        meta: {}
      });
    }
    
    // Mark as read
    notification.read = true;
    await notification.save();
    
    res.status(200).json({
      success: true,
      data: { notification },
      message: 'Notification marked as read',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to mark notification as read',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Mark all notifications as read
 * @route PATCH /api/notifications/read-all
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const user = req.user;
    
    // Update all unread notifications
    const result = await Notification.updateMany(
      { userId: user._id, read: false },
      { $set: { read: true } }
    );
    
    res.status(200).json({
      success: true,
      data: { count: result.modifiedCount },
      message: 'All notifications marked as read',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to mark all notifications as read',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Get unread notification count
 * @route GET /api/notifications/unread-count
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const user = req.user;
    
    // Count unread notifications
    const count = await Notification.countDocuments({
      userId: user._id,
      read: false
    });
    
    res.status(200).json({
      success: true,
      data: { count },
      message: 'Unread count retrieved successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve unread count',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Update notification preferences
 * @route PATCH /api/notifications/preferences
 */
exports.updatePreferences = async (req, res) => {
  try {
    const { preferences } = req.body;
    const user = req.user;
    
    // Validate preferences
    const validPreferences = [
      'reactions', 'comments', 'mentions', 'system'
    ];
    
    const updatedPreferences = {};
    
    Object.keys(preferences).forEach(key => {
      if (validPreferences.includes(key) && typeof preferences[key] === 'boolean') {
        updatedPreferences[`settings.notificationPreferences.${key}`] = preferences[key];
      }
    });
    
    if (Object.keys(updatedPreferences).length === 0) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Invalid preferences',
        error: {
          code: 'NOTIF_002',
          details: 'Provided preferences are invalid'
        },
        meta: {}
      });
    }
    
    // Update user preferences
    await User.findByIdAndUpdate(user._id, {
      $set: updatedPreferences
    });
    
    // Get updated user
    const updatedUser = await User.findById(user._id);
    
    res.status(200).json({
      success: true,
      data: { preferences: updatedUser.settings.notificationPreferences },
      message: 'Notification preferences updated successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to update notification preferences',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};