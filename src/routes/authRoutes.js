// src/routes/authRoutes.js
const express = require('express');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

// Public routes with rate limiting
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/refresh-token', authLimiter, authController.refreshToken);
router.post('/recovery-pin', authLimiter, authController.getRecoveryPin);
router.post('/reset-password', authLimiter, authController.resetPassword);
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);

// Admin auth routes
router.post('/admin/login', authLimiter, authController.adminLogin);

// Protected routes
router.post('/logout', protect, authController.logout);
router.post('/change-password', protect, authController.changePassword);

module.exports = router;