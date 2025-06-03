// src/middleware/authMiddleware.js
const { verifyToken } = require('../utils/authUtils');
const User = require('../models/userModel');
const Token = require('../models/tokenModel');

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't block request if not
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    // Get token from authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      return next();
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = verifyToken(token, 'access');

    // Check if user still exists
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      // Invalid user, continue without user
      return next();
    }

    // Update last active timestamp
    user.lastActive = new Date();
    await user.save({ validateBeforeSave: false });

    // Set user on request object
    req.user = user;
    next();
  } catch (error) {
    // Token verification failed, continue without user
    next();
  }
};

/**
 * Middleware to protect routes that require authentication
 */
exports.protect = async (req, res, next) => {
  try {
    // Get token from authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Not authenticated. Please log in',
        error: {
          code: 'AUTH_003',
          details: 'Authentication token is missing'
        },
        meta: {}
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = verifyToken(token, 'access');

    // Check if user still exists
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'User no longer exists',
        error: {
          code: 'AUTH_003',
          details: 'User associated with this token no longer exists'
        },
        meta: {}
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'User account has been deactivated',
        error: {
          code: 'AUTH_003',
          details: 'User account is not active'
        },
        meta: {}
      });
    }

    // Update last active timestamp
    user.lastActive = new Date();
    await user.save({ validateBeforeSave: false });

    // Set user on request object
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      data: null,
      message: 'Not authenticated. Please log in',
      error: {
        code: 'AUTH_002',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Middleware to check if user is an admin
 */
exports.isAdmin = async (req, res, next) => {
    try {
      const user = req.user;
      
      // Check if user exists and is authenticated (should be handled by protect middleware)
      if (!user) {
        return res.status(401).json({
          success: false,
          data: null,
          message: 'Not authenticated',
          error: {
            code: 'AUTH_003',
            details: 'Authentication required'
          },
          meta: {}
        });
      }
      
      // Check if user has admin role
      if (!user.isAdmin) {
        return res.status(403).json({
          success: false,
          data: null,
          message: 'Access denied',
          error: {
            code: 'AUTH_003',
            details: 'Admin privileges required'
          },
          meta: {}
        });
      }
      
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        data: null,
        message: 'Authentication error',
        error: {
          code: 'SERVER_001',
          details: error.message
        },
        meta: {}
      });
    }
  };

  /**
 * Middleware to protect admin routes
 * Requires both authentication and admin privileges
 */
exports.adminProtect = async (req, res, next) => {
    try {
      // First authenticate the user
      await this.protect(req, res, () => {
        // Now check if the user is an admin
        const user = req.user;
        
        if (!user.isAdmin) {
          return res.status(403).json({
            success: false,
            data: null,
            message: 'Admin privileges required',
            error: {
              code: 'AUTH_004',
              details: 'You do not have permission to access this resource'
            },
            meta: {}
          });
        }
        
        // Check if this token was issued specifically for admin session
        // This adds extra security by requiring admin-specific login
        if (!req.adminRequired) {
          next();
          return;
        }
        
        // Get token from header
        const authHeader = req.headers.authorization;
        const token = authHeader.split(' ')[1];
        
        // Verify the token has admin session flag
        const decoded = verifyToken(token, 'access');
        
        if (!decoded.isAdminSession) {
          return res.status(403).json({
            success: false,
            data: null,
            message: 'Admin session required',
            error: {
              code: 'AUTH_005',
              details: 'Please use the admin login endpoint to access this resource'
            },
            meta: {}
          });
        }
        
        next();
      });
    } catch (error) {
      // If the protect middleware threw an error, it will be caught here
      next(error);
    }
  };