// src/routes/searchRoutes.js
const express = require('express');
const searchController = require('../controllers/searchController');
const { searchLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

// Search endpoints with rate limiting
router.get('/posts', searchLimiter, searchController.searchPosts);
router.get('/users', searchLimiter, searchController.searchUsers);
router.get('/hashtags', searchLimiter, searchController.searchHashtags);

// Trending content
router.get('/trending/hashtags', searchController.getTrendingHashtags);
router.get('/categories', searchController.getCategories);
router.get('/categories/:id/posts', searchController.getCategoryPosts);

module.exports = router;