// src/middleware/rateLimitMiddleware.js
const rateLimit = require('express-rate-limit');

// Generic rate limiter
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      data: null,
      message: message || 'Too many requests, please try again later',
      error: {
        code: 'RATE_001',
        details: 'Rate limit exceeded'
      },
      meta: {}
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

// API rate limiter - 100 requests per minute
const apiLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  100,
  'Too many requests, please try again after a minute'
);

// Search limiter - 30 searches per minute
const searchLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  30,
  'Too many search requests, please try again after a minute'
);

// Post creation limiter - 10 posts per hour
const postLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  10,
  'You can only create 10 posts per hour'
);

// Comment creation limiter - 30 comments per hour
const commentLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  30,
  'You can only create 30 comments per hour'
);

// Auth limiter - 5 attempts per 15 minutes
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5,
  'Too many authentication attempts, please try again after 15 minutes'
);

module.exports = {
  apiLimiter,
  searchLimiter,  // Make sure this is exported
  postLimiter,
  commentLimiter,
  authLimiter
};