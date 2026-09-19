const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
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
        variantSku: { type: String, default: null },
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
    paymentMethod: {
      type: String,
      enum: ['razorpay', 'cod', 'card'],
      required: true,
    },
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
    cancelReason: {
      type: String,
      enum: ['OUT_OF_STOCK', 'PAYMENT_ISSUE', 'CUSTOMER', 'ADMIN', 'OTHER'],
      default: undefined,
    },
    trackingNumber: String,
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: String,
  },
  { timestamps: true }
);

orderSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, sparse: true, name: 'unique_razorpay_payment_id' }
);
orderSchema.index(
  { razorpayOrderId: 1 },
  { unique: true, sparse: true, name: 'unique_razorpay_order_id' }
);
orderSchema.index({ user: 1, createdAt: -1 });

// Explicit collection keeps continuity with the previous model name ('order')
const Order = mongoose.model('Order', orderSchema, 'orders');
Order.createIndexes().catch((err) => {
  console.error('Order index creation warning:', err.message);
});

module.exports = Order;
