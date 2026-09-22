const Order = require('../models/OrderSchema');
const ErrorResponse = require('../utils/errorResponse');
const { restoreStock } = require('../utils/stock');
const { refundOrderPayment } = require('../utils/refund');
const { delByPrefix } = require('../utils/cache');

const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const PRODUCT_POPULATE = {
  path: 'items.product',
  select: 'name price images category stock description',
};

const populateOrderQuery = (query) =>
  query
    .populate(PRODUCT_POPULATE)
    .populate('coupon', 'code discountType discountValue')
    .populate('user', 'username email');

async function restoreOrderStock(order) {
  for (const item of order.items || []) {
    const productId = item.product?._id || item.product;
    await restoreStock(
      productId,
      item.quantity,
      null,
      item.variantSku || null
    );
  }
  await delByPrefix('products:list:');
}

function canCancel(order) {
  return order.orderStatus === 'pending' || order.orderStatus === 'processing';
}

function canReturn(order) {
  if (order.orderStatus !== 'delivered') return false;
  if (order.returnStatus === 'completed' || order.orderStatus === 'returned') {
    return false;
  }
  if (!order.deliveredAt) return false;
  const elapsed = Date.now() - new Date(order.deliveredAt).getTime();
  return elapsed >= 0 && elapsed <= RETURN_WINDOW_MS;
}

function returnWindowEndsAt(order) {
  if (!order.deliveredAt) return null;
  return new Date(new Date(order.deliveredAt).getTime() + RETURN_WINDOW_MS);
}

// @desc    Get logged-in user's orders
// @route   GET /api/v1/order
// @access  Private
exports.getOrders = async (req, res, next) => {
  try {
    const orders = await populateOrderQuery(
      Order.find({ user: req.user.id })
    ).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      message: 'Orders fetched successfully',
      data: orders,
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
    const order = await populateOrderQuery(
      Order.findOne({
        _id: req.params.id,
        user: req.user.id,
      })
    );

    if (!order) {
      return next(new ErrorResponse('Order not found', 404));
    }

    res.status(200).json({
      success: true,
      message: 'Order fetched successfully',
      data: order,
      meta: {
        canCancel: canCancel(order),
        canReturn: canReturn(order),
        returnWindowEndsAt: returnWindowEndsAt(order),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel order before shipped (customer)
// @route   POST /api/v1/order/:id/cancel
// @access  Private
exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!order) {
      return next(new ErrorResponse('Order not found', 404));
    }

    if (!canCancel(order)) {
      return next(
        new ErrorResponse(
          'Order can only be cancelled before it is shipped',
          400
        )
      );
    }

    // Refund first — do not mutate order if refund fails
    let refundResult;
    try {
      refundResult = await refundOrderPayment(order);
    } catch (err) {
      return next(err);
    }

    await restoreOrderStock(order);

    order.orderStatus = 'cancelled';
    order.cancelReason = 'CUSTOMER';
    order.cancelledAt = new Date();
    if (refundResult.refundId) {
      order.refundId = refundResult.refundId;
      order.paymentStatus = 'refunded';
    } else if (
      order.paymentMethod !== 'razorpay' ||
      !order.razorpayPaymentId
    ) {
      // Non-Razorpay / unpaid — mark refunded locally when applicable
      if (order.paymentStatus === 'completed') {
        order.paymentStatus = 'refunded';
      }
    } else if (refundResult.alreadyRefunded) {
      order.paymentStatus = 'refunded';
    }

    await order.save();

    const populated = await populateOrderQuery(Order.findById(order._id));

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully. Refund initiated if applicable.',
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Return delivered order within 7 days
// @route   POST /api/v1/order/:id/return
// @access  Private
exports.returnOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!order) {
      return next(new ErrorResponse('Order not found', 404));
    }

    if (order.orderStatus === 'returned' || order.returnStatus === 'completed') {
      return next(new ErrorResponse('Order has already been returned', 400));
    }

    if (!canReturn(order)) {
      return next(
        new ErrorResponse(
          'Return is only allowed within 7 days of delivery',
          400
        )
      );
    }

    const reason =
      typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

    let refundResult;
    try {
      refundResult = await refundOrderPayment(order);
    } catch (err) {
      return next(err);
    }

    await restoreOrderStock(order);

    order.returnStatus = 'completed';
    order.returnReason = reason || null;
    order.orderStatus = 'returned';
    order.returnedAt = new Date();
    if (refundResult.refundId) {
      order.refundId = refundResult.refundId;
      order.paymentStatus = 'refunded';
    } else if (
      order.paymentMethod !== 'razorpay' ||
      !order.razorpayPaymentId
    ) {
      if (order.paymentStatus === 'completed') {
        order.paymentStatus = 'refunded';
      }
    } else if (refundResult.alreadyRefunded) {
      order.paymentStatus = 'refunded';
    }

    await order.save();

    const populated = await populateOrderQuery(Order.findById(order._id));

    res.status(200).json({
      success: true,
      message: 'Return completed successfully. Refund initiated if applicable.',
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin — list all orders
// @route   GET /api/v1/order/admin/all
// @access  Private/Admin
exports.getAllOrdersAdmin = async (req, res, next) => {
  try {
    const orders = await populateOrderQuery(Order.find())
      .sort({ createdAt: -1 })
      .limit(200);

    res.status(200).json({
      success: true,
      count: orders.length,
      message: 'All orders fetched successfully',
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};

const FORWARD_TRANSITIONS = {
  processing: ['shipped'],
  shipped: ['delivered'],
  pending: ['processing', 'shipped'],
};

// @desc    Admin — update order status (forward only)
// @route   PATCH /api/v1/order/admin/:id/status
// @access  Private/Admin
exports.updateOrderStatusAdmin = async (req, res, next) => {
  try {
    const { orderStatus, trackingNumber } = req.body || {};
    const allowedTargets = ['processing', 'shipped', 'delivered'];

    if (!orderStatus || !allowedTargets.includes(orderStatus)) {
      return next(
        new ErrorResponse(
          'orderStatus must be one of: processing, shipped, delivered',
          400
        )
      );
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return next(new ErrorResponse('Order not found', 404));
    }

    if (['cancelled', 'returned'].includes(order.orderStatus)) {
      return next(
        new ErrorResponse('Cannot update status of a cancelled or returned order', 400)
      );
    }

    if (order.orderStatus === orderStatus) {
      if (trackingNumber !== undefined) {
        order.trackingNumber = trackingNumber;
        await order.save();
      }
      const populated = await populateOrderQuery(Order.findById(order._id));
      return res.status(200).json({
        success: true,
        message: 'Order already in this status',
        data: populated,
      });
    }

    const allowed = FORWARD_TRANSITIONS[order.orderStatus] || [];
    if (!allowed.includes(orderStatus)) {
      return next(
        new ErrorResponse(
          `Cannot move order from "${order.orderStatus}" to "${orderStatus}"`,
          400
        )
      );
    }

    order.orderStatus = orderStatus;
    if (trackingNumber !== undefined && trackingNumber !== null) {
      order.trackingNumber = String(trackingNumber).trim() || order.trackingNumber;
    }
    if (orderStatus === 'delivered') {
      order.deliveredAt = new Date();
    }

    await order.save();

    const populated = await populateOrderQuery(Order.findById(order._id));

    res.status(200).json({
      success: true,
      message: `Order marked as ${orderStatus}`,
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};
