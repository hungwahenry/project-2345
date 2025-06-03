// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/config');
const authRoutes = require('./routes/authRoutes');
const postRoutes = require('./routes/postRoutes');
const gifRoutes = require('./routes/gifRoutes');
const commentRoutes = require('./routes/commentRoutes');
const userRoutes = require('./routes/userRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const searchRoutes = require('./routes/searchRoutes');
const moderationRoutes = require('./routes/moderationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { apiLimiter } = require('./middleware/rateLimitMiddleware');

// Initialize express app
const app = express();

// Apply security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "https://api.dicebear.com", "https://images.unsplash.com", "data:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  }
}));

// Apply CORS with WebSocket support
app.use(cors({
  origin: config.clientOrigin || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Set security headers
app.use((req, res, next) => {
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  next();
});

// Apply global rate limiting to API endpoints
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/gifs', gifRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/moderation', moderationRoutes);

// Health check endpoint - exempt from rate limiting
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    environment: config.environment,
    version: '1.0.0',
    services: {
      api: 'running',
      websocket: 'running'
    }
  });
});

// API documentation
app.get('/api/docs', (req, res) => {
  res.status(200).json({
    message: 'API documentation is available at /api/docs/swagger',
    error: null,
    data: {
      name: 'lowercase API',
      version: '1.0.0',
      description: 'Backend API for the lowercase anonymous posting platform'
    },
    meta: {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    message: 'Resource not found',
    error: {
      code: 'ROUTE_001',
      details: `Route ${req.originalUrl} not found`
    },
    meta: {}
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Default error status and message
  const status = err.statusCode || 500;
  const message = err.message || 'An internal server error occurred';
  
  res.status(status).json({
    success: false,
    data: null,
    message: message,
    error: {
      code: err.code || 'SERVER_001',
      details: config.environment === 'development' ? err.stack : undefined
    },
    meta: {}
  });
});

module.exports = app;