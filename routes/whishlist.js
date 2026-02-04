const express = require('express');
const Wishlist = require('../models/WishlistSchema');
const Product = require('../models/ProductSchema');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @desc    Get user's wishlist
// @route   GET /api/v1/wishlist
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user.id })
      .populate({
        path: 'products',
        select: 'name price images stock averageRating isBestSeller discount category originalPrice'
      });

    if (!wishlist) {
      // Create empty wishlist if doesn't exist
      const newWishlist = await Wishlist.create({
        user: req.user.id,
        products: []
      });
      
      return res.status(200).json({
        success: true,
        count: 0,
        data: newWishlist
      });
    }

    res.status(200).json({
      success: true,
      count: wishlist.products.length,
      data: wishlist
    });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching wishlist'
    });
  }
});

// @desc    Toggle product in wishlist (add/remove)
// @route   POST /api/v1/wishlist/toggle
// @access  Private
router.post('/toggle', protect, async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Find user's wishlist
    let wishlist = await Wishlist.findOne({ user: req.user.id });

    // If no wishlist exists, create one
    if (!wishlist) {
      wishlist = await Wishlist.create({
        user: req.user.id,
        products: [productId]
      });
      
      const populatedWishlist = await Wishlist.findById(wishlist._id)
        .populate({
          path: 'products',
          select: 'name price images stock averageRating isBestSeller discount'
        });

      return res.status(200).json({
        success: true,
        action: 'added',
        message: 'Product added to wishlist',
        count: 1,
        data: populatedWishlist
      });
    }

    // Check if product already in wishlist
    const productIndex = wishlist.products.indexOf(productId);
    let action = '';
    
    if (productIndex > -1) {
      // Remove product from wishlist
      wishlist.products.splice(productIndex, 1);
      action = 'removed';
    } else {
      // Add product to wishlist
      wishlist.products.push(productId);
      action = 'added';
    }

    // Update timestamp
    wishlist.updatedAt = Date.now();
    
    await wishlist.save();

    // Populate the updated wishlist
    const populatedWishlist = await Wishlist.findById(wishlist._id)
      .populate({
        path: 'products',
        select: 'name price images stock averageRating isBestSeller discount'
      });

    res.status(200).json({
      success: true,
      action: action,
      message: `Product ${action} from wishlist`,
      count: populatedWishlist.products.length,
      data: populatedWishlist
    });

  } catch (error) {
    console.error('Toggle wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating wishlist'
    });
  }
});

// @desc    Check if product is in wishlist
// @route   GET /api/v1/wishlist/check/:productId
// @access  Private
router.get('/check/:productId', protect, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ 
      user: req.user.id,
      products: req.params.productId 
    });

    res.status(200).json({
      success: true,
      isInWishlist: !!wishlist
    });
  } catch (error) {
    console.error('Check wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while checking wishlist'
    });
  }
});

// @desc    Get wishlist count
// @route   GET /api/v1/wishlist/count
// @access  Private
router.get('/count', protect, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user.id });
    
    const count = wishlist ? wishlist.products.length : 0;
    
    res.status(200).json({
      success: true,
      count: count
    });
  } catch (error) {
    console.error('Get wishlist count error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching wishlist count'
    });
  }
});

// @desc    Clear entire wishlist
// @route   DELETE /api/v1/wishlist/clear
// @access  Private
router.delete('/clear', protect, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user.id });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    wishlist.products = [];
    wishlist.updatedAt = Date.now();
    await wishlist.save();

    res.status(200).json({
      success: true,
      message: 'Wishlist cleared successfully',
      data: wishlist
    });
  } catch (error) {
    console.error('Clear wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while clearing wishlist'
    });
  }
});

// @desc    Remove specific product from wishlist
// @route   DELETE /api/v1/wishlist/:productId
// @access  Private
router.delete('/:productId', protect, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user.id });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    const productIndex = wishlist.products.indexOf(req.params.productId);
    
    if (productIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in wishlist'
      });
    }

    wishlist.products.splice(productIndex, 1);
    wishlist.updatedAt = Date.now();
    await wishlist.save();

    const populatedWishlist = await Wishlist.findById(wishlist._id)
      .populate({
        path: 'products',
        select: 'name price images stock averageRating isBestSeller discount'
      });

    res.status(200).json({
      success: true,
      message: 'Product removed from wishlist',
      count: populatedWishlist.products.length,
      data: populatedWishlist
    });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while removing from wishlist'
    });
  }
});

module.exports = router;