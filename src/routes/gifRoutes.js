// src/routes/gifRoutes.js
const express = require('express');
const gifController = require('../controllers/gifController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const { apiLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

// Apply rate limiting to all GIF routes
router.use(apiLimiter);

// GIF search routes
router.get('/search', optionalAuth, gifController.searchGifs);
router.get('/trending', optionalAuth, gifController.getTrendingGifs);
router.get('/:id', optionalAuth, gifController.getGifById);

module.exports = router;