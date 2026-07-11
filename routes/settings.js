const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/UserSchema');
const Cart = require('../models/CartSchema');
const Wishlist = require('../models/WishlistSchema');
const Order = require('../models/OrderSchema');
const { protect } = require('../middleware/auth');

const router = express.Router();

const defaultNotifications = {
  email: true,
  sms: true,
  promotional: true,
  orderUpdates: true
};

const getNotifications = (user) => ({
  ...defaultNotifications,
  ...(user.settings?.notifications
    ? (typeof user.settings.notifications.toObject === 'function'
        ? user.settings.notifications.toObject()
        : user.settings.notifications)
    : {})
});

// @desc    Get account settings
// @route   GET /api/v1/settings
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -refreshToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Settings fetched successfully',
      data: {
        notifications: getNotifications(user)
      }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching settings'
    });
  }
});

// @desc    Update notification preferences
// @route   PUT /api/v1/settings/notifications
// @access  Private
router.put('/notifications', protect, async (req, res) => {
  try {
    const { email, sms, promotional, orderUpdates } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const current = getNotifications(user);
    user.settings = {
      notifications: {
        email: typeof email === 'boolean' ? email : current.email,
        sms: typeof sms === 'boolean' ? sms : current.sms,
        promotional: typeof promotional === 'boolean' ? promotional : current.promotional,
        orderUpdates: typeof orderUpdates === 'boolean' ? orderUpdates : current.orderUpdates
      }
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: {
        notifications: getNotifications(user)
      }
    });
  } catch (error) {
    console.error('Update notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating notifications'
    });
  }
});

// @desc    Change account password
// @route   PUT /api/v1/settings/change-password
// @access  Private
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password, new password, and confirm password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirm password do not match'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user || !user.password) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while changing password'
    });
  }
});

// @desc    Delete account permanently
// @route   DELETE /api/v1/settings/account
// @access  Private
router.delete('/account', protect, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to delete your account'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Password is incorrect'
      });
    }

    const userId = user._id;

    await Promise.all([
      Cart.deleteMany({ user: userId }),
      Wishlist.deleteMany({ user: userId }),
      Order.deleteMany({ user: userId }),
      User.findByIdAndDelete(userId)
    ]);

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting account'
    });
  }
});

module.exports = router;
