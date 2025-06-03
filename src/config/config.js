// src/config/config.js
require('dotenv').config();

module.exports = {
  environment: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  mongodb: {
    uri: process.env.MONGODB_URI,
    options: {
    }
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  },
  jwt: {
    accessTokenSecret: process.env.JWT_ACCESS_SECRET || 'access_secret_key_for_dev',
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET || 'refresh_secret_key_for_dev',
    accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d'
  },
  websocket: {
    pingInterval: 25000, // milliseconds
    pingTimeout: 60000, // milliseconds
    cors: {
      origin: process.env.CLIENT_ORIGIN || '*',
      methods: ["GET", "POST"],
      credentials: true
    }
  },
  giphy: {
    apiKey: process.env.GIPHY_API_KEY || 'your_development_api_key',
    contentRating: process.env.GIPHY_CONTENT_RATING || 'pg-13',
    cacheTime: 60 * 60 * 1000 // 1 hour in milliseconds
  },
  moderation: {
    autoModerationEnabled: process.env.AUTO_MODERATION_ENABLED === 'true' || true,
    moderationApiKey: process.env.MODERATION_API_KEY
  },
email: {
    fromEmail: process.env.EMAIL_FROM || 'no-reply@lowercase-app.com',
    fromName: process.env.EMAIL_NAME || 'Lowercase',
    verificationExpiry: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    recoveryExpiry: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
  },
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
};