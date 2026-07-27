const mongoose = require('mongoose');
const Review = require('../models/ReviewSchema');
const Product = require('../models/ProductSchema');
const ErrorResponse = require('../utils/errorResponse');

// Helper function to update product's average rating (aggregated)
const updateProductAverageRating = async (productId) => {
  try {
    const stats = await Review.aggregate([
      {
        $match: { product: new mongoose.Types.ObjectId(productId) } // FIX: Ensure Cast to ObjectId
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
        averageRating: Math.round(stats[0].averageRating * 10) / 10
      });
    } else {
      await Product.findByIdAndUpdate(productId, {
        averageRating: 0
      });
    }
  } catch (error) {
    console.error('Update average rating error:', error);
  }
};

// @desc    Get all reviews
// @route   GET /api/v1/review
// @access  Public
exports.getReviews = async (req, res, next) => {
  try {
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
    next(error);
  }
};

// @desc    Get all reviews for a specific product
// @route   GET /api/v1/review/products/:productId
// @access  Public
exports.getProductReviews = async (req, res, next) => {
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
    next(error);
  }
};

// @desc    Get single review
// @route   GET /api/v1/review/:id
// @access  Public
exports.getReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate('user', 'username profile.firstName profile.lastName')
      .populate('product', 'name description');

    if (!review) {
      return next(new ErrorResponse('Review not found', 404));
    }

    res.status(200).json({
      success: true,
      data: review
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a review
// @route   POST /api/v1/review/products/:productId
// @access  Private
exports.createReview = async (req, res, next) => {
  try {
    const { rating, comment, isVerified } = req.body;
    const productId = req.params.productId;

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return next(new ErrorResponse('Product not found', 404));
    }

    // Check if user already reviewed this product
    const existingReview = await Review.findOne({
      user: req.user.id,
      product: productId
    });

    if (existingReview) {
      return next(new ErrorResponse('You have already reviewed this product', 400));
    }

    if (!rating || rating < 1 || rating > 5) {
      return next(new ErrorResponse('Please provide a valid rating between 1 and 5', 400));
    }

    const review = await Review.create({
      user: req.user.id,
      product: productId,
      rating: parseInt(rating, 10),
      comment,
      isVerified: isVerified === 'true' || isVerified === true
    });

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
    next(error);
  }
};

// @desc    Update a review
// @route   PUT /api/v1/review/:id
// @access  Private
exports.updateReview = async (req, res, next) => {
  try {
    const { rating, comment, isVerified } = req.body;

    let review = await Review.findById(req.params.id);

    if (!review) {
      return next(new ErrorResponse('Review not found', 404));
    }

    // Check if user owns the review or is admin
    if (review.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return next(new ErrorResponse('Not authorized to update this review', 403));
    }

    if (rating && (rating < 1 || rating > 5)) {
      return next(new ErrorResponse('Rating must be between 1 and 5', 400));
    }

    const updateData = {};
    if (rating) updateData.rating = parseInt(rating, 10);
    if (comment !== undefined) updateData.comment = comment;
    if (isVerified !== undefined) updateData.isVerified = isVerified === 'true' || isVerified === true;

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
    next(error);
  }
};

// @desc    Delete a review
// @route   DELETE /api/v1/review/:id
// @access  Private
exports.deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return next(new ErrorResponse('Review not found', 404));
    }

    if (review.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return next(new ErrorResponse('Not authorized to delete this review', 403));
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
    next(error);
  }
};

// @desc    Get my reviews
// @route   GET /api/v1/review/me/my-reviews
// @access  Private
exports.getMyReviews = async (req, res, next) => {
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
    next(error);
  }
};
