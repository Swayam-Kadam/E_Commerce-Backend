const mongoose = require('mongoose')
const {Schema} = mongoose

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
  discountValue: { type: Number, required: true },
  minOrderAmount: Number,
  maxDiscountAmount: Number,
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  usageLimit: Number,
  usedCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  createdAt: { type: Date, default: Date.now }
});

const Coupon = mongoose.model('Coupon',couponSchema)
Coupon.createIndexes()
module.exports = Coupon