// src/utils/authUtils.js
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const Token = require('../models/tokenModel');

/**
 * Generate JWT tokens for a user
 * @param {Object} user - User document
 * @param {Object} deviceInfo - Device information
 * @param {String} ipAddress - IP address
 * @param {Boolean} isAdminSession - Whether this is an admin session
 * @returns {Object} Access and refresh tokens
 */
const generateTokens = async (user, deviceInfo, ipAddress, isAdminSession = false) => {
    // Create payload
    const payload = {
      userId: user._id,
      username: user.username,
      isAdmin: user.isAdmin,
      isAdminSession: isAdminSession && user.isAdmin
    };
  
    // Generate access token
    const accessToken = jwt.sign(
      payload,
      config.jwt.accessTokenSecret,
      { expiresIn: config.jwt.accessTokenExpiry }
    );
  
    // Generate refresh token
    const refreshToken = jwt.sign(
      payload,
      config.jwt.refreshTokenSecret,
      { expiresIn: config.jwt.refreshTokenExpiry }
    );
  
    // Calculate expiry dates
    const accessTokenExpiry = new Date();
    accessTokenExpiry.setMinutes(accessTokenExpiry.getMinutes() + 15); // 15 minutes
  
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 days
  
    // Store refresh token in database
    await Token.create({
      userId: user._id,
      token: refreshToken,
      type: 'refresh',
      expiresAt: refreshTokenExpiry,
      deviceInfo,
      ipAddress,
      isAdminSession: isAdminSession && user.isAdmin
    });
  
    return {
      accessToken,
      refreshToken,
      accessTokenExpiry,
      refreshTokenExpiry
    };
  };

/**
 * Verify JWT token
 * @param {String} token - JWT token
 * @param {String} type - Token type ('access' or 'refresh')
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token, type = 'access') => {
  try {
    const secret = type === 'access' 
      ? config.jwt.accessTokenSecret 
      : config.jwt.refreshTokenSecret;
    
    return jwt.verify(token, secret);
  } catch (error) {
    throw new Error(`Invalid or expired ${type} token`);
  }
};

module.exports = {
  generateTokens,
  verifyToken
};