const express = require('express');
const Review = require('../models/ReviewSchema');
const Product = require('../models/ProductSchema');
const User = require('../models/UserSchema');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();


// router.get('/', async (req, res) => {
//   try {
//     const review = await Review.find()
//     if (!review) {
//       return res.status(404).json({
//         success: false,
//         message: 'Review not found'
//       });
//     }

//     res.status(200).json({
//       success: true,
//       reviewCount: review.length,
//       data: review
//     });
//   } catch (error) {
//     console.error('Get review error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error while fetching review'
//     });
//   }
// });

// @desc    Get all reviews for a specific product
// @route   GET /api/v1/products/:productId/reviews
// @access  Public

router.get('/', async (req, res) => {
  try {
    // Fetch all reviews and populate user & product data
    const reviews = await Review.find()
      .populate('user', 'username email profile.firstName profile.lastName')
      .populate('product', 'name images category price originalPrice')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      reviewCount: reviews.length,
      data: reviews
    });
  } catch (error) {
    console.error('Get review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching reviews'
    });
  }
});

router.get('/products/:productId', async (req, res) => {
  try {
    const reviews = await Review.find({ product: req.params.productId })
      .populate('user', 'username profile.firstName profile.lastName')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching reviews'
    });
  }
});

// @desc    Get single review
// @route   GET /api/v1/reviews/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate('user', 'username profile.firstName profile.lastName')
      .populate('product', 'name description');

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    res.status(200).json({
      success: true,
      data: review
    });
  } catch (error) {
    console.error('Get review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching review'
    });
  }
});

// @desc    Create a review
// @route   POST /api/v1/products/:productId/reviews
// @access  Private (Logged-in users)
router.post('/products/:productId', protect, async (req, res) => {
  try {
    const { rating, comment, isVerified } = req.body;
    const productId = req.params.productId;

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user already reviewed this product
    const existingReview = await Review.findOne({
      user: req.user._id || req.user.id,
      product: productId
    });

    console.log('Debug - User:', req.user.id || req.user._id);
     console.log('Existing review found:', existingReview);

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this product'
      });
    }

    // Validation
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid rating between 1 and 5'
      });
    }

    const review = await Review.create({
      user: req.user.id,
      product: productId,
      rating: parseInt(rating),
      comment,
      isVerified: isVerified === 'true'
    });

    // Populate the created review
    const populatedReview = await Review.findById(review._id)
      .populate('user', 'username profile.firstName profile.lastName');

    // Update product's average rating
    await updateProductAverageRating(productId);

    res.status(201).json({
      success: true,
      message: 'Review added successfully',
      data: populatedReview
    });

  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating review'
    });
  }
});

// @desc    Update a review
// @route   PUT /api/v1/reviews/:id
// @access  Private (Review owner or admin)
router.put('/:id', protect, async (req, res) => {
  try {
    const { rating, comment, isVerified } = req.body;

    let review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check if user owns the review or is admin
    if (review.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this review'
      });
    }

    // Validation
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    const updateData = {};
    if (rating) updateData.rating = parseInt(rating);
    if (comment !== undefined) updateData.comment = comment;
    if (isVerified !== undefined) updateData.isVerified = isVerified === 'true';

    review = await Review.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('user', 'username profile.firstName profile.lastName');

    // Update product's average rating
    await updateProductAverageRating(review.product);

    res.status(200).json({
      success: true,
      message: 'Review updated successfully',
      data: review
    });

  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating review'
    });
  }
});

// @desc    Delete a review
// @route   DELETE /api/v1/reviews/:id
// @access  Private (Review owner or admin)
router.delete('/:id', protect, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check if user owns the review or is admin
    if (review.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this review'
      });
    }

    const productId = review.product;
    await Review.findByIdAndDelete(req.params.id);

    // Update product's average rating
    await updateProductAverageRating(productId);

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    });

  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting review'
    });
  }
});

// @desc    Get my reviews
// @route   GET /api/v1/reviews/me/my-reviews
// @access  Private
router.get('/me/my-reviews', protect, async (req, res) => {
  try {
    const reviews = await Review.find({ user: req.user.id })
      .populate('product', 'name images price')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews
    });
  } catch (error) {
    console.error('Get my reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching your reviews'
    });
  }
});

// Helper function to update product's average rating
const updateProductAverageRating = async (productId) => {
  try {
    const stats = await Review.aggregate([
      {
        $match: { product: productId }
      },
      {
        $group: {
          _id: '$product',
          averageRating: { $avg: '$rating' },
          numberOfReviews: { $sum: 1 }
        }
      }
    ]);

    if (stats.length > 0) {
      await Product.findByIdAndUpdate(productId, {
        averageRating: Math.round(stats[0].averageRating * 10) / 10, // Round to 1 decimal
        // You can also store numberOfReviews if needed
      });
    } else {
      // No reviews, reset average rating
      await Product.findByIdAndUpdate(productId, {
        averageRating: 0
      });
    }
  } catch (error) {
    console.error('Update average rating error:', error);
  }
};

module.exports = router;