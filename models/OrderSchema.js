const mongoose = require('mongoose')
const {Schema} = mongoose

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderNumber: { type: String, unique: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Products', required: true },
    variant: {
      color: String,
      size: String
    },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true }
  }],
  totalAmount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  shippingAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  paymentMethod: { type: String, required: true },
  paymentStatus: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'refunded'], 
    default: 'pending' 
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  trackingNumber: String,
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
});

const Order = mongoose.model('order',orderSchema)
Order.createIndexes()
module.exports = Order