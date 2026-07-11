// const express = require('express');
// const Razorpay = require('razorpay');


// const router = express.Router();
// // Initialize Razorpay instance
// const razorpay = new Razorpay({
//   key_id: process.env.RAZORPAY_KEY_ID,
//   key_secret: process.env.RAZORPAY_KEY_SECRET,
// });

// // API endpoint to create order
// router.post("/api/create-order", async (req, res) => {
//   try {
//     const { amount } = req.body; // Amount in rupees
    
//     const options = {
//       amount: amount * 100, // Convert to paise
//       currency: "INR",
//       receipt: `receipt_${Date.now()}`,
//     };

//     const order = await razorpay.orders.create(options);
//     res.json({ 
//       success: true, 
//       orderId: order.id,
//       amount: order.amount,
//       currency: order.currency 
//     });
//   } catch (error) {
//     console.error("Order creation failed:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// // API endpoint to verify payment (important!)
// router.post("/api/verify-payment", (req, res) => {
//   const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  
//   const crypto = require("crypto");
//   const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
//   hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
//   const generatedSignature = hmac.digest("hex");

//   if (generatedSignature === razorpay_signature) {
//     // Payment verified - update your database here
//     res.json({ success: true, message: "Payment verified successfully" });
//   } else {
//     res.status(400).json({ success: false, message: "Invalid signature" });
//   }
// });




// module.exports = router;


const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const Cart = require('../models/CartSchema');
const Order = require('../models/OrderSchema');
const Product = require('../models/ProductSchema');
const { protect } = require('../middleware/auth');

const router = express.Router();
// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// @desc    Create a Razorpay order from the user's current cart
// @route   POST /api/v1/payment/api/create-order
// @access  Private
router.post('/api/create-order', protect, async (req, res) => {
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
      return res.status(400).json({
        success: false,
        message: 'Complete shipping address (street, city, state, zipCode, country) is required'
      });
    }

    const cart = await Cart.findOne({ user: req.user.id }).populate({
      path: 'items.product',
      select: 'name price stock'
    });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    // Validate stock and recompute the authoritative total server-side
    let totalAmount = 0;
    for (const item of cart.items) {
      if (!item.product) {
        return res.status(400).json({
          success: false,
          message: 'One or more products in your cart no longer exist'
        });
      }
      if (item.product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${item.product.stock} unit(s) of "${item.product.name}" available in stock`
        });
      }
      totalAmount += item.product.price * item.quantity;
    }

    // Razorpay receipt max length is 40 characters
    const shortUserId = String(req.user.id).slice(-6);
    const options = {
      amount: Math.round(totalAmount * 100), // paise
      currency: 'INR',
      receipt: `rcpt_${shortUserId}_${Date.now()}`.slice(0, 40),
      notes: {
        userId: req.user.id.toString()
      }
    };

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
        shippingAddress
      }
    });
  } catch (error) {
    console.error('Order creation failed:', error);
    res.status(500).json({ success: false, message: 'Server error while creating order' });
  }
});

// @desc    Verify Razorpay payment and persist the order
// @route   POST /api/v1/payment/api/verify-payment
// @access  Private
router.post('/api/verify-payment', protect, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      shippingAddress
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required'
      });
    }

    // Verify signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // Signature verified — rebuild order from the user's cart
    const cart = await Cart.findOne({ user: req.user.id }).populate({
      path: 'items.product',
      select: 'name price stock'
    });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty, nothing to order (payment was verified but no order could be created)'
      });
    }

    const orderItems = [];
    let totalAmount = 0;

    for (const item of cart.items) {
      if (!item.product || item.product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `"${item.product ? item.product.name : 'A product'}" is no longer available in the requested quantity`
        });
      }
      orderItems.push({
        product: item.product._id,
        variant: item.variant,
        quantity: item.quantity,
        price: item.product.price
      });
      totalAmount += item.product.price * item.quantity;
    }

    if (
      !shippingAddress ||
      !shippingAddress.street ||
      !shippingAddress.city ||
      !shippingAddress.state ||
      !shippingAddress.zipCode ||
      !shippingAddress.country
    ) {
      return res.status(400).json({
        success: false,
        message: 'Complete shipping address is required to place the order'
      });
    }

    // Create the order record
    const order = await Order.create({
      user: req.user.id,
      orderNumber: `ORD-${Date.now()}-${String(req.user.id).slice(-4)}`,
      items: orderItems,
      totalAmount,
      currency: 'INR',
      shippingAddress,
      paymentMethod: 'razorpay',
      paymentStatus: 'completed',
      orderStatus: 'processing',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature
    });

    // Decrement stock for each purchased product
    await Promise.all(
      orderItems.map(item =>
        Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } })
      )
    );

    // Clear the cart now that the order has been placed
    cart.items = [];
    cart.total = 0;
    cart.updatedAt = Date.now();
    await cart.save();

    const populatedOrder = await Order.findById(order._id).populate({
      path: 'items.product',
      select: 'name price images'
    });

    res.status(201).json({
      success: true,
      message: 'Payment verified and order placed successfully',
      data: populatedOrder
    });
  } catch (error) {
    console.error('Payment verification failed:', error);
    res.status(500).json({ success: false, message: 'Server error while verifying payment' });
  }
});

module.exports = router;