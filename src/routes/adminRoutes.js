// src/routes/adminRoutes.js
const express = require('express');
const adminController = require('../controllers/adminController');
const { adminProtect } = require('../middleware/authMiddleware');

const router = express.Router();

// Set admin requirement flag for all admin routes
router.use((req, res, next) => {
  req.adminRequired = true;
  next();
});

// All admin routes require admin protection
router.use(adminProtect);

// User management
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserById);
router.patch('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

// Content management
router.get('/posts', adminController.getAllPosts);
router.get('/comments', adminController.getAllComments);
router.delete('/posts/:id', adminController.deletePost);
router.delete('/comments/:id', adminController.deleteComment);

// Moderation
router.get('/reports', adminController.getReports);
router.patch('/reports/:id', adminController.updateReport);
router.post('/posts/:id/moderate', adminController.moderatePost);
router.post('/comments/:id/moderate', adminController.moderateComment);
router.get('/moderation/stats', adminController.getModerationStats);

// Category management
router.get('/categories', adminController.getAllCategories);
router.post('/categories', adminController.createCategory);
router.patch('/categories/:id', adminController.updateCategory);
router.delete('/categories/:id', adminController.deleteCategory);

// System management
router.get('/statistics', adminController.getStatistics);
router.get('/logs', adminController.getLogs);
router.post('/announcements', adminController.createAnnouncement);
router.patch('/settings', adminController.updateSettings);

// Admin activity
router.get('/activity', adminController.getAdminActivity);

module.exports = router;