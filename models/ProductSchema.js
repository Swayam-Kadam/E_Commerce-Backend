const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: Number,
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    images: [
      {
        url: String,
        public_id: String,
        filename: String,
      },
    ],
    /** Cached total: sum of variant stocks, or product-level stock when no variants */
    stock: { type: Number, default: 0, min: 0 },
    /** Optional product-level SKU when there are no variants */
    sku: { type: String, sparse: true, trim: true },
    specifications: Map,
    variants: [
      {
        sku: { type: String, required: true, trim: true },
        color: String,
        size: String,
        stock: { type: Number, default: 0, min: 0 },
      },
    ],
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    isBestSeller: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ averageRating: -1 });
productSchema.index({ isBestSeller: 1 });
productSchema.index({ name: 'text' });
productSchema.index({ 'variants.sku': 1 });

const Product = mongoose.model('Products', productSchema);
Product.createIndexes().catch((err) => {
  console.error('Product index creation warning:', err.message);
});

module.exports = Product;
