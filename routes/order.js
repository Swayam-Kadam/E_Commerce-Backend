const express = require('express');
const Order = require('../models/OrderSchema');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @desc    Get logged-in user's orders
// @route   GET /api/v1/order
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate({
        path: 'items.product',
        select: 'name price images category stock'
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      message: 'Orders fetched successfully',
      data: orders
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching orders'
    });
  }
});

// @desc    Get a single order for the logged-in user
// @route   GET /api/v1/order/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id
    }).populate({
      path: 'items.product',
      select: 'name price images category stock description'
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order fetched successfully',
      data: order
    });
  } catch (error) {
    console.error('Get order by id error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching order'
    });
  }
});

module.exports = router;
