// src/routes/postRoutes.js
const express = require('express');
const postController = require('../controllers/postController');
const commentController = require('../controllers/commentController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const { postLimiter, commentLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

// Post routes
router.post('/', protect, postLimiter, postController.createPost);
router.get('/feed', optionalAuth, postController.getPersonalizedFeed);
router.get('/explore', optionalAuth, postController.getExploreContent);
router.get('/trending', optionalAuth, postController.getTrendingPosts);
router.get('/hashtag/:tag', optionalAuth, postController.getPostsByHashtag);
router.get('/user/:userId', optionalAuth, postController.getUserPosts);
router.get('/saved', protect, postController.getSavedPosts);
router.get('/:id', optionalAuth, postController.getPost);
router.delete('/:id', protect, postController.deletePost);

// Reaction routes
router.post('/:id/reactions', protect, postController.addReaction);
router.delete('/:id/reactions/:type', protect, postController.removeReaction);

// Save/bookmark routes
router.post('/:id/save', protect, postController.savePost);
router.delete('/:id/save', protect, postController.unsavePost);

// Report route
router.post('/:id/report', protect, postController.reportPost);

// Comment routes
router.post('/:postId/comments', protect, commentLimiter, commentController.addComment);
router.get('/:postId/comments', optionalAuth, commentController.getComments);

module.exports = router;