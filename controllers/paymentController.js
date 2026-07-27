const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const Cart = require('../models/CartSchema');
const Order = require('../models/OrderSchema');
const Coupon = require('../models/CouponSchema');
const ErrorResponse = require('../utils/errorResponse');
const { decrementStockIfAvailable } = require('../utils/stock');

// Initialize Razorpay lazily so tests don't break if environment variables are not set
const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new ErrorResponse('Razorpay API keys are not configured', 500);
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const populateOrder = (orderId) =>
  Order.findById(orderId)
    .populate({
      path: 'items.product',
      select: 'name price images',
    })
    .populate('coupon', 'code discountType discountValue');

const isDuplicateKeyError = (error) =>
  error && (error.code === 11000 || error.code === 11001);

/**
 * Persist a cancelled recovery order after payment succeeded but stock could not be allocated.
 * Allows admin refund follow-up. Idempotent via unique razorpayPaymentId.
 */
const recordOutOfStockAfterPay = async ({
  userId,
  orderItems,
  totalAmount,
  discount,
  coupon,
  shippingAddress,
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
}) => {
  try {
    const existing = await Order.findOne({
      $or: [
        { razorpayPaymentId: razorpay_payment_id },
        { razorpayOrderId: razorpay_order_id },
      ],
    });
    if (existing) return existing;

    return await Order.create({
      user: userId,
      orderNumber: `ORD-OOS-${Date.now()}-${String(userId).slice(-4)}`,
      items: orderItems,
      totalAmount,
      coupon: coupon || null,
      discount: discount || 0,
      currency: 'INR',
      shippingAddress,
      paymentMethod: 'razorpay',
      paymentStatus: 'completed',
      orderStatus: 'cancelled',
      cancelReason: 'OUT_OF_STOCK',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      updatedAt: Date.now(),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return Order.findOne({
        $or: [
          { razorpayPaymentId: razorpay_payment_id },
          { razorpayOrderId: razorpay_order_id },
        ],
      });
    }
    console.error('[payment] Failed to record OUT_OF_STOCK recovery order:', error);
    return null;
  }
};

// @desc    Create a Razorpay order from the user's current cart
// @route   POST /api/v1/payment/api/create-order
// @access  Private
// NOTE: Stock pre-check here is UX-only (fail early before opening Razorpay).
// Authoritative stock allocation happens in verifyPayment via atomic decrement.
exports.createOrder = async (req, res, next) => {
  try {
    const { shippingAddress } = req.body;

    if (
      !shippingAddress ||
      !shippingAddress.street ||
      !shippingAddress.city ||
      !shippingAddress.state ||
      !shippingAddress.zipCode ||
      !shippingAddress.country
    ) {
      return next(
        new ErrorResponse(
          'Complete shipping address (street, city, state, zipCode, country) is required',
          400
        )
      );
    }

    const cart = await Cart.findOne({ user: req.user.id }).populate({
      path: 'items.product',
      select: 'name price stock',
    });

    if (!cart || cart.items.length === 0) {
      return next(new ErrorResponse('Your cart is empty', 400));
    }

    // Non-authoritative stock pre-check (UX). Final safety is in verifyPayment.
    let subtotal = 0;
    for (const item of cart.items) {
      if (!item.product) {
        return next(
          new ErrorResponse('One or more products in your cart no longer exist', 400)
        );
      }
      if (item.product.stock < item.quantity) {
        return next(
          new ErrorResponse(
            `Only ${item.product.stock} unit(s) of "${item.product.name}" available in stock`,
            400
          )
        );
      }
      subtotal += item.product.price * item.quantity;
    }

    let totalAmount = subtotal;
    if (cart.coupon && cart.discount) {
      totalAmount = Math.max(0, subtotal - cart.discount);
    }

    const shortUserId = String(req.user.id).slice(-6);
    const amountPaise = Math.round(totalAmount * 100);
    const options = {
      amount: amountPaise,
      currency: 'INR',
      receipt: `rcpt_${shortUserId}_${Date.now()}`.slice(0, 40),
      notes: {
        userId: req.user.id.toString(),
        couponId: cart.coupon ? cart.coupon.toString() : '',
        expectedAmountPaise: String(amountPaise),
      },
    };

    const razorpay = getRazorpayInstance();
    const razorpayOrder = await razorpay.orders.create(options);

    res.status(200).json({
      success: true,
      message: 'Razorpay order created successfully',
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID,
        totalAmount,
        discount: cart.discount || 0,
        shippingAddress,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify Razorpay payment and persist the order (concurrency-safe)
// @route   POST /api/v1/payment/api/verify-payment
// @access  Private
exports.verifyPayment = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      shippingAddress,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return next(
        new ErrorResponse(
          'razorpay_order_id, razorpay_payment_id and razorpay_signature are required',
          400
        )
      );
    }

    if (
      !shippingAddress ||
      !shippingAddress.street ||
      !shippingAddress.city ||
      !shippingAddress.state ||
      !shippingAddress.zipCode ||
      !shippingAddress.country
    ) {
      return next(
        new ErrorResponse(
          'Complete shipping address is required to place the order',
          400
        )
      );
    }

    // 1) Verify signature (outside transaction)
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '');
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return next(new ErrorResponse('Invalid payment signature', 400));
    }

    // 2) Idempotency: already fulfilled / recorded for this payment
    const existingOrder = await Order.findOne({
      $or: [
        { razorpayPaymentId: razorpay_payment_id },
        { razorpayOrderId: razorpay_order_id },
      ],
    });

    if (existingOrder) {
      const populated = await populateOrder(existingOrder._id);
      const isCancelledOos =
        existingOrder.orderStatus === 'cancelled' &&
        existingOrder.cancelReason === 'OUT_OF_STOCK';

      if (isCancelledOos) {
        return res.status(409).json({
          success: false,
          code: 'OUT_OF_STOCK_AFTER_PAY',
          message:
            'Payment was received but the item became unavailable. A refund will be processed.',
          data: populated,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Payment already verified; returning existing order',
        data: populated,
      });
    }

    // 3) Fetch Razorpay order for amount guard
    const razorpay = getRazorpayInstance();
    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.fetch(razorpay_order_id);
    } catch (err) {
      return next(new ErrorResponse('Unable to fetch Razorpay order for verification', 400));
    }

    // 4) Fresh cart read
    const cart = await Cart.findOne({ user: req.user.id }).populate({
      path: 'items.product',
      select: 'name price stock',
    });

    if (!cart || cart.items.length === 0) {
      return next(new ErrorResponse('Cart is empty, nothing to order', 400));
    }

    const orderItems = [];
    let subtotal = 0;

    for (const item of cart.items) {
      if (!item.product) {
        return next(
          new ErrorResponse('One or more products in your cart no longer exist', 400)
        );
      }
      orderItems.push({
        product: item.product._id,
        name: item.product.name,
        variant: item.variant,
        quantity: item.quantity,
        price: item.product.price,
      });
      subtotal += item.product.price * item.quantity;
    }

    let totalAmount = subtotal;
    if (cart.coupon && cart.discount) {
      totalAmount = Math.max(0, subtotal - cart.discount);
    }

    const expectedPaise = Math.round(totalAmount * 100);
    const paidPaise = Number(razorpayOrder.amount);

    if (expectedPaise !== paidPaise) {
      return next(
        new ErrorResponse(
          'Cart total no longer matches the paid amount. Payment will be reviewed for refund if captured.',
          409
        )
      );
    }

    const lineItemsForOrder = orderItems.map(({ product, variant, quantity, price }) => ({
      product,
      variant,
      quantity,
      price,
    }));

    let createdOrderId = null;
    let outOfStockProductName = null;

    // 5) Transaction: atomic stock → order → coupon → clear cart
    try {
      await session.withTransaction(async () => {
        for (const item of lineItemsForOrder) {
          const ok = await decrementStockIfAvailable(
            item.product,
            item.quantity,
            session
          );
          if (!ok) {
            const failed = orderItems.find(
              (oi) => String(oi.product) === String(item.product)
            );
            outOfStockProductName = failed?.name || 'A product';
            throw Object.assign(new Error('OUT_OF_STOCK'), {
              code: 'OUT_OF_STOCK',
              productName: outOfStockProductName,
            });
          }
        }

        const [order] = await Order.create(
          [
            {
              user: req.user.id,
              orderNumber: `ORD-${Date.now()}-${String(req.user.id).slice(-4)}`,
              items: lineItemsForOrder,
              totalAmount,
              coupon: cart.coupon || null,
              discount: cart.discount || 0,
              currency: 'INR',
              shippingAddress,
              paymentMethod: 'razorpay',
              paymentStatus: 'completed',
              orderStatus: 'processing',
              razorpayOrderId: razorpay_order_id,
              razorpayPaymentId: razorpay_payment_id,
              razorpaySignature: razorpay_signature,
              updatedAt: Date.now(),
            },
          ],
          { session }
        );

        createdOrderId = order._id;

        if (cart.coupon) {
          await Coupon.findByIdAndUpdate(
            cart.coupon,
            { $inc: { usedCount: 1 } },
            { session }
          );
        }

        cart.items = [];
        cart.total = 0;
        cart.coupon = null;
        cart.discount = 0;
        cart.updatedAt = Date.now();
        await cart.save({ session });
      });
    } catch (txnError) {
      if (txnError.code === 'OUT_OF_STOCK' || txnError.message === 'OUT_OF_STOCK') {
        // Payment valid but stock lost the race — record cancelled recovery order
        console.error(
          `[payment] OUT_OF_STOCK after pay user=${req.user.id} payment=${razorpay_payment_id} product=${txnError.productName || outOfStockProductName}`
        );

        const recovery = await recordOutOfStockAfterPay({
          userId: req.user.id,
          orderItems: lineItemsForOrder,
          totalAmount,
          discount: cart.discount || 0,
          coupon: cart.coupon || null,
          shippingAddress,
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
        });

        // TODO: enqueue Razorpay refund for razorpay_payment_id
        const populatedRecovery = recovery
          ? await populateOrder(recovery._id)
          : null;

        return res.status(409).json({
          success: false,
          code: 'OUT_OF_STOCK_AFTER_PAY',
          message: `"${txnError.productName || outOfStockProductName || 'Item'}" became unavailable after payment. A refund will be processed.`,
          data: populatedRecovery,
        });
      }

      if (isDuplicateKeyError(txnError)) {
        const dup = await Order.findOne({
          $or: [
            { razorpayPaymentId: razorpay_payment_id },
            { razorpayOrderId: razorpay_order_id },
          ],
        });
        if (dup) {
          const populated = await populateOrder(dup._id);
          return res.status(200).json({
            success: true,
            message: 'Payment already verified; returning existing order',
            data: populated,
          });
        }
      }

      throw txnError;
    }

    const populatedOrder = await populateOrder(createdOrderId);

    res.status(201).json({
      success: true,
      message: 'Payment verified and order placed successfully',
      data: populatedOrder,
    });
  } catch (error) {
    next(error);
  } finally {
    session.endSession();
  }
};
