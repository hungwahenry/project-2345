// src/routes/userRoutes.js
const express = require('express');
const userController = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Profile management
router.get('/me', protect, userController.getCurrentUser);
router.patch('/me', protect, userController.updateCurrentUser);
router.delete('/me', protect, userController.deleteAccount);

// Public profile
router.get('/:username/public', userController.getPublicProfile);

// User blocking
router.post('/block/:username', protect, userController.blockUser);
router.delete('/block/:username', protect, userController.unblockUser);
router.get('/blocked', protect, userController.getBlockedUsers);

// Content filtering
router.post('/keyword-filters', protect, userController.addKeywordFilter);
router.get('/keyword-filters', protect, userController.getKeywordFilters);
router.delete('/keyword-filters/:keyword', protect, userController.removeKeywordFilter);

// User statistics and sessions
router.get('/me/stats', protect, userController.getUserStats);
router.get('/me/active-sessions', protect, userController.getActiveSessions);
router.delete('/me/active-sessions/:id', protect, userController.endSession);

module.exports = router;