const Order = require('../models/OrderSchema');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get logged-in user's orders
// @route   GET /api/v1/order
// @access  Private
exports.getOrders = async (req, res, next) => {
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
    next(error);
  }
};

// @desc    Get a single order for the logged-in user
// @route   GET /api/v1/order/:id
// @access  Private
exports.getOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id
    }).populate({
      path: 'items.product',
      select: 'name price images category stock description'
    });

    if (!order) {
      return next(new ErrorResponse('Order not found', 404));
    }

    res.status(200).json({
      success: true,
      message: 'Order fetched successfully',
      data: order
    });
  } catch (error) {
    next(error);
  }
};
