const express = require('express');
const Cart = require('../models/CartSchema');
const Product = require('../models/ProductSchema');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @desc    Get user's cart
// @route   GET /api/v1/cart
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id })
      .populate({
        path: 'items.product',
        select: 'name price images stock description category originalPrice'
      });

    if (!cart) {
      // Create empty cart if doesn't exist
      const newCart = await Cart.create({
        user: req.user.id,
        items: [],
        total: 0
      });
      
      return res.status(200).json({
        success: true,
        count: 0,
        total: 0,
        data: newCart
      });
    }

    // Calculate total
    let total = 0;
    cart.items.forEach(item => {
      total += item.price * item.quantity;
    });
    
    // Update total if changed
    if (cart.total !== total) {
      cart.total = total;
      await cart.save();
    }

    res.status(200).json({
      success: true,
      count: cart.items.length,
      total: cart.total,
      data: cart
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching cart'
    });
  }
});

// @desc    Add/Update product in cart
// @route   POST /api/v1/cart/add
// @access  Private
router.post('/add', protect, async (req, res) => {
  try {
    const { productId, variant = {}, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Check if product exists and get current price
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check stock availability
    if (product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stock} items available in stock`
      });
    }

    // Find user's cart
    let cart = await Cart.findOne({ user: req.user.id });

    // If no cart exists, create one
    if (!cart) {
      cart = await Cart.create({
        user: req.user.id,
        items: [{
          product: productId,
          variant: {
            color: variant.color || null,
            size: variant.size || null
          },
          quantity: quantity,
          price: product.price
        }],
        total: product.price * quantity
      });
      
      const populatedCart = await Cart.findById(cart._id)
        .populate({
          path: 'items.product',
          select: 'name price images stock'
        });

      return res.status(200).json({
        success: true,
        action: 'added',
        message: 'Product added to cart',
        count: 1,
        total: cart.total,
        data: populatedCart
      });
    }

    // Check if product with same variant already exists in cart
    const existingItemIndex = cart.items.findIndex(item => 
      item.product.toString() === productId.toString() &&
      item.variant.color === (variant.color || null) &&
      item.variant.size === (variant.size || null)
    );

    let action = '';
    
    if (existingItemIndex > -1) {
      // Update quantity of existing item
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;
      
      // Check stock for updated quantity
      if (product.stock < newQuantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${product.stock} items available in stock. You already have ${cart.items[existingItemIndex].quantity} in cart.`
        });
      }
      
      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].price = product.price; // Update to current price
      action = 'updated';
    } else {
      // Add new item to cart
      cart.items.push({
        product: productId,
        variant: {
          color: variant.color || null,
          size: variant.size || null
        },
        quantity: quantity,
        price: product.price
      });
      action = 'added';
    }

    // Calculate total
    let total = 0;
    cart.items.forEach(item => {
      total += item.price * item.quantity;
    });
    
    cart.total = total;
    cart.updatedAt = Date.now();
    
    await cart.save();

    // Populate the updated cart
    const populatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'items.product',
        select: 'name price images stock'
      });

    res.status(200).json({
      success: true,
      action: action,
      message: `Product ${action} to cart`,
      count: populatedCart.items.length,
      total: populatedCart.total,
      data: populatedCart
    });

  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating cart'
    });
  }
});

// @desc    Update cart item quantity
// @route   PUT /api/v1/cart/update-quantity/:itemId
// @access  Private
router.put('/update-quantity/:itemId', protect, async (req, res) => {
  try {
    const { quantity } = req.body;
    const { itemId } = req.params;

    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Valid quantity is required (minimum 1)'
      });
    }

    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Find the item
    const itemIndex = cart.items.findIndex(item => 
      item._id.toString() === itemId
    );
    
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    // Get product to check stock
    const product = await Product.findById(cart.items[itemIndex].product);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check stock availability
    if (product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stock} items available in stock`
      });
    }

    // Update quantity and price
    cart.items[itemIndex].quantity = quantity;
    cart.items[itemIndex].price = product.price; // Update to current price

    // Calculate total
    let total = 0;
    cart.items.forEach(item => {
      total += item.price * item.quantity;
    });
    
    cart.total = total;
    cart.updatedAt = Date.now();
    
    await cart.save();

    const populatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'items.product',
        select: 'name price images stock'
      });

    res.status(200).json({
      success: true,
      message: 'Quantity updated successfully',
      count: populatedCart.items.length,
      total: populatedCart.total,
      data: populatedCart
    });
  } catch (error) {
    console.error('Update quantity error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating quantity'
    });
  }
});

// @desc    Remove item from cart
// @route   DELETE /api/v1/cart/remove/:itemId
// @access  Private
router.delete('/remove/:itemId', protect, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    const itemIndex = cart.items.findIndex(item => 
      item._id.toString() === req.params.itemId
    );
    
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    cart.items.splice(itemIndex, 1);
    cart.updatedAt = Date.now();
    
    // Recalculate total
    let total = 0;
    cart.items.forEach(item => {
      total += item.price * item.quantity;
    });
    cart.total = total;
    
    await cart.save();

    const populatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'items.product',
        select: 'name price images stock'
      });

    res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      count: populatedCart.items.length,
      total: populatedCart.total,
      data: populatedCart
    });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while removing from cart'
    });
  }
});

// @desc    Clear entire cart
// @route   DELETE /api/v1/cart/clear
// @access  Private
router.delete('/clear', protect, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    cart.items = [];
    cart.total = 0;
    cart.updatedAt = Date.now();
    await cart.save();

    res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      data: cart
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while clearing cart'
    });
  }
});

// @desc    Get cart count
// @route   GET /api/v1/cart/count
// @access  Private
router.get('/count', protect, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    
    const count = cart ? cart.items.length : 0;
    const totalQuantity = cart ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
    
    res.status(200).json({
      success: true,
      count: count,
      totalQuantity: totalQuantity
    });
  } catch (error) {
    console.error('Get cart count error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching cart count'
    });
  }
});

// @desc    Get cart total
// @route   GET /api/v1/cart/total
// @access  Private
router.get('/total', protect, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    
    const total = cart ? cart.total : 0;
    
    res.status(200).json({
      success: true,
      total: total
    });
  } catch (error) {
    console.error('Get cart total error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching cart total'
    });
  }
});

module.exports = router;