const mongoose = require('mongoose')
const {Schema} = mongoose

const wishlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Products' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
});

const Wishlist = mongoose.model('Wishlist',wishlistSchema)
Wishlist.createIndexes()
module.exports = Wishlist