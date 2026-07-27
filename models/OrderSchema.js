const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderNumber: { type: String, unique: true },
  items: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Products',
        required: true,
      },
      variant: {
        color: String,
        size: String,
      },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true },
    },
  ],
  totalAmount: { type: Number, required: true },
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
  discount: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  shippingAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
  },
  paymentMethod: { type: String, required: true },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending',
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
  },
  /** Why an order was cancelled (e.g. OUT_OF_STOCK after paid) */
  cancelReason: {
    type: String,
    enum: ['OUT_OF_STOCK', 'PAYMENT_ISSUE', 'CUSTOMER', 'ADMIN', 'OTHER'],
    default: undefined,
  },
  trackingNumber: String,
  razorpayOrderId: { type: String, default: null },
  razorpayPaymentId: { type: String, default: null },
  razorpaySignature: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
});

// Prevent duplicate fulfillment from payment retries / double-submit
orderSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, sparse: true, name: 'unique_razorpay_payment_id' }
);
orderSchema.index(
  { razorpayOrderId: 1 },
  { unique: true, sparse: true, name: 'unique_razorpay_order_id' }
);

const Order = mongoose.model('order', orderSchema);
Order.createIndexes().catch((err) => {
  console.error('Order index creation warning:', err.message);
});

module.exports = Order;
