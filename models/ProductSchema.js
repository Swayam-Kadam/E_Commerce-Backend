const mongoose = require('mongoose')
const {Schema} = mongoose

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  originalPrice: Number, // Original price for showing discounts
  category: { type: String, required: true },
   images: [{
    url: String,
    public_id: String, // Cloudinary public ID for deletion
    filename: String
  }],
  stock: { type: Number, default: 0 },
  specifications: Map, // Key-value pairs for product specs
  variants: [{
    color: [String],
    size: [String]
  }],
  reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Review' }],
  averageRating: { type: Number, default: 0 },
  isBestSeller: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Products',productSchema)
Product.createIndexes()
module.exports = Product