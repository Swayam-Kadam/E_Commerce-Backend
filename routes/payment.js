const express = require('express');
const Razorpay = require('razorpay');


const router = express.Router();
// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// API endpoint to create order
router.post("/api/create-order", async (req, res) => {
  try {
    const { amount } = req.body; // Amount in rupees
    
    const options = {
      amount: amount * 100, // Convert to paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);
    res.json({ 
      success: true, 
      orderId: order.id,
      amount: order.amount,
      currency: order.currency 
    });
  } catch (error) {
    console.error("Order creation failed:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint to verify payment (important!)
router.post("/api/verify-payment", (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  
  const crypto = require("crypto");
  const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
  hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
  const generatedSignature = hmac.digest("hex");

  if (generatedSignature === razorpay_signature) {
    // Payment verified - update your database here
    res.json({ success: true, message: "Payment verified successfully" });
  } else {
    res.status(400).json({ success: false, message: "Invalid signature" });
  }
});




module.exports = router;