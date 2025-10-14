const mongoose = require('mongoose')
const {Schema} = mongoose

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Products', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: String,
  isVerified: { type: Boolean, default: false }, // If purchased the product
  createdAt: { type: Date, default: Date.now }
});

// Add compound index to prevent duplicate reviews
 reviewSchema.index({ user: 1, product: 1 }, { unique: true });

const Review = mongoose.model('Review',reviewSchema)
Review.createIndexes();
module.exports = Review