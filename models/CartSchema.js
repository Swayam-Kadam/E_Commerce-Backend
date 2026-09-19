const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
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
        quantity: { type: Number, default: 1, min: 1 },
        price: Number,
      },
    ],
    total: { type: Number, default: 0 },
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
    discount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Cart = mongoose.model('Cart', cartSchema);
Cart.createIndexes().catch((err) => {
  console.error('Cart index creation warning:', err.message);
});

module.exports = Cart;
