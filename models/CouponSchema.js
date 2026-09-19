const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderAmount: Number,
    maxDiscountAmount: Number,
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    usageLimit: Number,
    usedCount: { type: Number, default: 0 },
    usedBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        usedAt: { type: Date, default: Date.now },
      },
    ],
    isActive: { type: Boolean, default: true },
    applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  },
  { timestamps: true }
);

couponSchema.index({ 'usedBy.user': 1 });

const Coupon = mongoose.model('Coupon', couponSchema);
Coupon.createIndexes().catch((err) => {
  console.error('Coupon index creation warning:', err.message);
});

module.exports = Coupon;
