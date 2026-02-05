const mongoose = require('mongoose')
const {Schema} = mongoose

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Products', required: true },
    variant: {
      color: String,
      size: String
    },
    quantity: { type: Number, default: 1, min: 1 },
    price: Number
  }],
  total: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

const Cart = mongoose.model('Cart',cartSchema)
Cart.createIndexes()
module.exports = Cart