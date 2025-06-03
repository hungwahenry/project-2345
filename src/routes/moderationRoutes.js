// src/routes/moderationRoutes.js
const express = require('express');
const moderationController = require('../controllers/moderationController');
const { protect, isAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// User-accessible reporting
router.post('/report', protect, moderationController.submitReport);

// Admin-only routes
router.get('/reports', protect, isAdmin, moderationController.getReports);
router.patch('/reports/:id', protect, isAdmin, moderationController.updateReport);
router.post('/posts/:id/moderate', protect, isAdmin, moderationController.moderatePost);
router.post('/comments/:id/moderate', protect, isAdmin, moderationController.moderateComment);

module.exports = router;