// src/controllers/authController.js
const User = require('../models/userModel');
const Token = require('../models/tokenModel');
const { generateTokens, verifyToken } = require('../utils/authUtils');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

/**
 * Register a new user
 * @route POST /api/auth/register
 */
exports.register = async (req, res) => {
    try {
      const { username, email, password } = req.body;
  
      // Check if username already exists
      const existingUser = await User.findOne({ 
        $or: [{ username }, { email }]
      });
      
      if (existingUser) {
        const field = existingUser.username === username ? 'username' : 'email';
        return res.status(400).json({
          success: false,
          data: null,
          message: `This ${field} is already in use`,
          error: {
            code: 'USER_001',
            details: `This ${field} is not available`
          },
          meta: {}
        });
      }
  
      // Generate default avatar URL using DiceBear
      const avatarUrl = `https://api.dicebear.com/6.x/thumbs/svg?seed=${username}`;
  
      // Create email verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = new Date(Date.now() + config.email.verificationExpiry);
  
      // Create new user
      const user = await User.create({
        username,
        email,
        passwordHash: password, // will be hashed in pre-save hook
        avatarUrl,
        lastActive: new Date(),
        emailVerified: false,
        emailVerificationToken: {
          token: verificationToken,
          expiresAt: tokenExpiry
        }
      });
  
      // Send verification email
      const emailService = require('../services/emailService');
      await emailService.sendVerificationEmail(user, verificationToken);
  
      // Generate tokens
      const deviceInfo = req.headers['user-agent'] || 'Unknown device';
      const ipAddress = req.ip;
      const tokens = await generateTokens(user, deviceInfo, ipAddress);
  
      // Update user's active sessions
      await User.findByIdAndUpdate(user._id, {
        $push: {
          activeSessions: {
            sessionId: crypto.randomBytes(16).toString('hex'),
            deviceInfo,
            ipAddress,
            lastActive: new Date()
          }
        }
      });
  
      // Remove sensitive data before sending response
      const userResponse = {
        _id: user._id,
        username: user.username,
        email: user.email,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        settings: user.settings,
        activityMetrics: user.activityMetrics,
        contentSettings: user.contentSettings
      };
  
      res.status(201).json({
        success: true,
        data: {
          user: userResponse,
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            accessTokenExpiry: tokens.accessTokenExpiry,
            refreshTokenExpiry: tokens.refreshTokenExpiry
          }
        },
        message: 'User registration successful. Please verify your email address.',
        error: null,
        meta: {}
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        message: 'Registration failed',
        error: {
          code: 'SERVER_001',
          details: error.message
        },
        meta: {}
      });
    }
  };

/**
 * Verify email address
 * @route POST /api/auth/verify-email
 */
exports.verifyEmail = async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({
          success: false,
          data: null,
          message: 'Verification token is required',
          error: {
            code: 'AUTH_008',
            details: 'Token must be provided'
          },
          meta: {}
        });
      }
      
      // Find user with this verification token
      const user = await User.findOne({
        'emailVerificationToken.token': token,
        'emailVerificationToken.expiresAt': { $gt: new Date() }
      });
      
      if (!user) {
        return res.status(400).json({
          success: false,
          data: null,
          message: 'Invalid or expired verification token',
          error: {
            code: 'AUTH_009',
            details: 'The verification token is invalid or has expired'
          },
          meta: {}
        });
      }
      
      // Mark email as verified
      user.emailVerified = true;
      user.emailVerificationToken = undefined;
      await user.save();
      
      res.status(200).json({
        success: true,
        data: null,
        message: 'Email verified successfully',
        error: null,
        meta: {}
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        message: 'Failed to verify email',
        error: {
          code: 'SERVER_001',
          details: error.message
        },
        meta: {}
      });
    }
  };

/**
 * Resend verification email
 * @route POST /api/auth/resend-verification
 */
exports.resendVerification = async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({
          success: false,
          data: null,
          message: 'Email is required',
          error: {
            code: 'AUTH_010',
            details: 'Email must be provided'
          },
          meta: {}
        });
      }
      
      // Find user by email
      const user = await User.findOne({ email });
      
      // For security, don't reveal if user exists
      if (!user || user.emailVerified) {
        return res.status(200).json({
          success: true,
          data: null,
          message: 'If your email exists and is not verified, a new verification email has been sent',
          error: null,
          meta: {}
        });
      }
      
      // Generate new verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = new Date(Date.now() + config.email.verificationExpiry);
      
      // Update user's verification token
      user.emailVerificationToken = {
        token: verificationToken,
        expiresAt: tokenExpiry
      };
      await user.save();
      
      // Send verification email
      const emailService = require('../services/emailService');
      await emailService.sendVerificationEmail(user, verificationToken);
      
      res.status(200).json({
        success: true,
        data: null,
        message: 'If your email exists and is not verified, a new verification email has been sent',
        error: null,
        meta: {}
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        message: 'Failed to resend verification email',
        error: {
          code: 'SERVER_001',
          details: error.message
        },
        meta: {}
      });
    }
  };

/**
 * Login user
 * @route POST /api/auth/login
 */
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Invalid credentials',
        error: {
          code: 'AUTH_001',
          details: 'Invalid username or password'
        },
        meta: {}
      });
    }

    // Check if password is correct
    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Invalid credentials',
        error: {
          code: 'AUTH_001',
          details: 'Invalid username or password'
        },
        meta: {}
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Account has been deactivated',
        error: {
          code: 'AUTH_003',
          details: 'User account is not active'
        },
        meta: {}
      });
    }

    // Generate tokens
    const deviceInfo = req.headers['user-agent'] || 'Unknown device';
    const ipAddress = req.ip;
    const tokens = await generateTokens(user, deviceInfo, ipAddress);

    // Update user's active sessions and last active timestamp
    await User.findByIdAndUpdate(user._id, {
      lastActive: new Date(),
      $push: {
        activeSessions: {
          sessionId: crypto.randomBytes(16).toString('hex'),
          deviceInfo,
          ipAddress,
          lastActive: new Date()
        }
      }
    });

    // Remove sensitive data before sending response
    const userResponse = {
      _id: user._id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      settings: user.settings,
      activityMetrics: user.activityMetrics,
      contentSettings: user.contentSettings
    };

    res.status(200).json({
      success: true,
      data: {
        user: userResponse,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          accessTokenExpiry: tokens.accessTokenExpiry,
          refreshTokenExpiry: tokens.refreshTokenExpiry
        }
      },
      message: 'Login successful',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Login failed',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Admin Login
 * @route POST /api/auth/admin/login
 */
exports.adminLogin = async (req, res) => {
    try {
      const { username, password } = req.body;
  
      // Check if user exists
      const user = await User.findOne({ username });
      if (!user) {
        return res.status(401).json({
          success: false,
          data: null,
          message: 'Invalid credentials',
          error: {
            code: 'AUTH_001',
            details: 'Invalid username or password'
          },
          meta: {}
        });
      }
  
      // Check if password is correct
      const isPasswordCorrect = await user.comparePassword(password);
      if (!isPasswordCorrect) {
        return res.status(401).json({
          success: false,
          data: null,
          message: 'Invalid credentials',
          error: {
            code: 'AUTH_001',
            details: 'Invalid username or password'
          },
          meta: {}
        });
      }
  
      // Check if user is an admin
      if (!user.isAdmin) {
        return res.status(403).json({
          success: false,
          data: null,
          message: 'Admin privileges required',
          error: {
            code: 'AUTH_004',
            details: 'Only administrators can access this endpoint'
          },
          meta: {}
        });
      }
  
      // Check if account is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          data: null,
          message: 'Account has been deactivated',
          error: {
            code: 'AUTH_003',
            details: 'User account is not active'
          },
          meta: {}
        });
      }
  
      // Generate tokens
      const deviceInfo = req.headers['user-agent'] || 'Unknown device';
      const ipAddress = req.ip;
      const tokens = await generateTokens(user, deviceInfo, ipAddress, true);
  
      // Update user's active sessions and last active timestamp
      await User.findByIdAndUpdate(user._id, {
        lastActive: new Date(),
        $push: {
          activeSessions: {
            sessionId: crypto.randomBytes(16).toString('hex'),
            deviceInfo,
            ipAddress,
            lastActive: new Date()
          }
        }
      });
  
      // Remove sensitive data before sending response
      const userResponse = {
        _id: user._id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
        settings: user.settings
      };
  
      res.status(200).json({
        success: true,
        data: {
          user: userResponse,
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            accessTokenExpiry: tokens.accessTokenExpiry,
            refreshTokenExpiry: tokens.refreshTokenExpiry
          }
        },
        message: 'Admin login successful',
        error: null,
        meta: {}
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        data: null,
        message: 'Admin login failed',
        error: {
          code: 'SERVER_001',
          details: error.message
        },
        meta: {}
      });
    }
  };

/**
 * Refresh access token
 * @route POST /api/auth/refresh-token
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Refresh token is required',
        error: {
          code: 'AUTH_002',
          details: 'No refresh token provided'
        },
        meta: {}
      });
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken, 'refresh');

    // Check if token exists in database and is not revoked
    const tokenDoc = await Token.findOne({
      token: refreshToken,
      userId: decoded.userId,
      type: 'refresh',
      isRevoked: false
    });

    if (!tokenDoc) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Invalid refresh token',
        error: {
          code: 'AUTH_002',
          details: 'Refresh token is invalid or has been revoked'
        },
        meta: {}
      });
    }

    // Check if token is expired
    if (new Date(tokenDoc.expiresAt) < new Date()) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Refresh token has expired',
        error: {
          code: 'AUTH_002',
          details: 'Refresh token has expired'
        },
        meta: {}
      });
    }

    // Get user
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'User not found or inactive',
        error: {
          code: 'AUTH_003',
          details: 'User associated with this token no longer exists or is inactive'
        },
        meta: {}
      });
    }

    // Generate new access token
    const payload = {
      userId: user._id,
      username: user.username
    };

    const newAccessToken = jwt.sign(
      payload,
      config.jwt.accessTokenSecret,
      { expiresIn: config.jwt.accessTokenExpiry }
    );

    // Calculate new access token expiry
    const accessTokenExpiry = new Date();
    accessTokenExpiry.setMinutes(accessTokenExpiry.getMinutes() + 15); // 15 minutes

    res.status(200).json({
      success: true,
      data: {
        accessToken: newAccessToken,
        accessTokenExpiry
      },
      message: 'Access token refreshed successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      data: null,
      message: 'Failed to refresh token',
      error: {
        code: 'AUTH_002',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Generate password recovery PIN
 * @route POST /api/auth/recovery-pin
 */
exports.getRecoveryPin = async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                data: null,
                message: 'Email is required',
                error: {
                    code: 'AUTH_004',
                    details: 'Email must be provided'
                },
                meta: {}
            });
        }
        
        // Find the user
        const user = await User.findOne({ email });
        
        // For security reasons, don't reveal if user exists or not
        if (!user || !user.isActive) {
            return res.status(200).json({
                success: true,
                data: null,
                message: 'If your account exists, a recovery PIN has been sent',
                error: null,
                meta: {}
            });
        }
        
        // Generate a 6-digit PIN
        const recoveryPin = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Hash the PIN before storing
        const pinHash = crypto
            .createHash('sha256')
            .update(recoveryPin)
            .digest('hex');
        
        // Store PIN in user's account
        user.accountRecoveryTokens.push({
            token: pinHash,
            createdAt: new Date(),
            used: false
        });
        
        await user.save();
        
        // Send recovery email with PIN
        const emailService = require('../services/emailService');
        await emailService.sendPasswordRecoveryEmail(user, recoveryPin);
        
        res.status(200).json({
            success: true,
            data: null,
            message: 'If your account exists, a recovery PIN has been sent',
            error: null,
            meta: {}
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            data: null,
            message: 'Failed to process recovery request',
            error: {
                code: 'SERVER_001',
                details: error.message
            },
            meta: {}
        });
    }
};

/**
 * Reset password with PIN
 * @route POST /api/auth/reset-password
 */
exports.resetPassword = async (req, res) => {
    try {
        const { pin, newPassword } = req.body;
        
        if (!pin || !newPassword) {
            return res.status(400).json({
                success: false,
                data: null,
                message: 'PIN and new password are required',
                error: {
                    code: 'AUTH_005',
                    details: 'Both PIN and new password must be provided'
                },
                meta: {}
            });
        }
        
        // Hash the PIN for comparison
        const pinHash = crypto
            .createHash('sha256')
            .update(pin)
            .digest('hex');
        
        // Find user with this PIN
        const user = await User.findOne({
            'accountRecoveryTokens.token': pinHash,
            'accountRecoveryTokens.used': false,
            isActive: true
        });
        
        if (!user) {
            return res.status(400).json({
                success: false,
                data: null,
                message: 'Invalid or expired PIN',
                error: {
                    code: 'AUTH_006',
                    details: 'Recovery PIN is invalid or has been used'
                },
                meta: {}
            });
        }
        
        // Check if PIN is expired (24 hours)
        const recoveryToken = user.accountRecoveryTokens.find(t => t.token === pinHash);
        const tokenAge = (new Date() - new Date(recoveryToken.createdAt)) / (1000 * 60 * 60); // in hours
        
        if (tokenAge > 24) {
            return res.status(400).json({
                success: false,
                data: null,
                message: 'PIN has expired',
                error: {
                    code: 'AUTH_007',
                    details: 'Recovery PIN has expired'
                },
                meta: {}
            });
        }
        
        // Mark PIN as used
        recoveryToken.used = true;
        
        // Update password
        user.passwordHash = newPassword;
        await user.save();
        
        // Revoke all refresh tokens for security
        await Token.updateMany(
            { userId: user._id },
            { isRevoked: true }
        );
        
        res.status(200).json({
            success: true,
            data: null,
            message: 'Password reset successful',
            error: null,
            meta: {}
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            data: null,
            message: 'Failed to reset password',
            error: {
                code: 'SERVER_001',
                details: error.message
            },
            meta: {}
        });
    }
};

/**
 * Reset password with PIN
 * @route POST /api/auth/reset-password
 */
exports.resetPassword = async (req, res) => {
    try {
        const { pin, newPassword } = req.body;
        
        if (!pin || !newPassword) {
            return res.status(400).json({
                success: false,
                data: null,
                message: 'PIN and new password are required',
                error: {
                    code: 'AUTH_005',
                    details: 'Both PIN and new password must be provided'
                },
                meta: {}
            });
        }
        
        // Hash the PIN for comparison
        const pinHash = crypto
            .createHash('sha256')
            .update(pin)
            .digest('hex');
        
        // Find user with this PIN
        const user = await User.findOne({
            'accountRecoveryTokens.token': pinHash,
            'accountRecoveryTokens.used': false,
            isActive: true
        });
        
        if (!user) {
            return res.status(400).json({
                success: false,
                data: null,
                message: 'Invalid or expired PIN',
                error: {
                    code: 'AUTH_006',
                    details: 'Recovery PIN is invalid or has been used'
                },
                meta: {}
            });
        }
        
        // Check if PIN is expired (24 hours)
        const recoveryToken = user.accountRecoveryTokens.find(t => t.token === pinHash);
        const tokenAge = (new Date() - new Date(recoveryToken.createdAt)) / (1000 * 60 * 60); // in hours
        
        if (tokenAge > 24) {
            return res.status(400).json({
                success: false,
                data: null,
                message: 'PIN has expired',
                error: {
                    code: 'AUTH_007',
                    details: 'Recovery PIN has expired'
                },
                meta: {}
            });
        }
        
        // Mark PIN as used
        recoveryToken.used = true;
        
        // Update password
        user.passwordHash = newPassword;
        await user.save();
        
        // Revoke all refresh tokens for security
        await Token.updateMany(
            { userId: user._id },
            { isRevoked: true }
        );
        
        res.status(200).json({
            success: true,
            data: null,
            message: 'Password reset successful',
            error: null,
            meta: {}
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            data: null,
            message: 'Failed to reset password',
            error: {
                code: 'SERVER_001',
                details: error.message
            },
            meta: {}
        });
    }
};

/**
 * Logout user
 * @route POST /api/auth/logout
 */
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Refresh token is required',
        error: {
          code: 'AUTH_002',
          details: 'No refresh token provided'
        },
        meta: {}
      });
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken, 'refresh');

    // Revoke the refresh token
    await Token.findOneAndUpdate(
      { token: refreshToken, userId: decoded.userId },
      { isRevoked: true }
    );

    // Remove the session from active sessions
    if (req.user) {
      const deviceInfo = req.headers['user-agent'] || 'Unknown device';
      await User.findByIdAndUpdate(req.user._id, {
        $pull: {
          activeSessions: { deviceInfo }
        }
      });
    }

    res.status(200).json({
      success: true,
      data: null,
      message: 'Logout successful',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Logout failed',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};

/**
 * Change user password
 * @route POST /api/auth/change-password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user;

    // Check if current password is correct
    const isPasswordCorrect = await user.comparePassword(currentPassword);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Current password is incorrect',
        error: {
          code: 'AUTH_001',
          details: 'The provided current password is incorrect'
        },
        meta: {}
      });
    }

    // Update password
    user.passwordHash = newPassword;
    await user.save();

    // Revoke all refresh tokens for security
    await Token.updateMany(
      { userId: user._id },
      { isRevoked: true }
    );

    res.status(200).json({
      success: true,
      data: null,
      message: 'Password changed successfully',
      error: null,
      meta: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to change password',
      error: {
        code: 'SERVER_001',
        details: error.message
      },
      meta: {}
    });
  }
};