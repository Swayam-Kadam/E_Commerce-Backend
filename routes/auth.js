const express = require('express');
const { uploadAvatar } = require('../middleware/upload');
const authController = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Public routes (Auth limited)
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);
router.post('/logout-all', authController.logoutAll);
router.post('/validate-token', authController.validateToken);

// Authenticated routes
router.get('/profile', protect, authController.getProfile);
router.put('/profile', protect, uploadAvatar, authController.updateProfile);
router.get('/token-info', protect, authController.getTokenInfo);

module.exports = router;
