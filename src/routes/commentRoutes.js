// src/routes/commentRoutes.js
const express = require('express');
const commentController = require('../controllers/commentController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const { commentLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

// Comment management
router.delete('/:id', protect, commentController.deleteComment);

// Reply functionality
router.post('/:commentId/replies', protect, commentLimiter, commentController.addReply);
router.get('/:commentId/replies', optionalAuth, commentController.getReplies);

// Reaction functionality
router.post('/:id/reactions', protect, commentController.addCommentReaction);
router.delete('/:id/reactions/:type', protect, commentController.removeCommentReaction);

// Report functionality
router.post('/:id/report', protect, commentController.reportComment);

module.exports = router;