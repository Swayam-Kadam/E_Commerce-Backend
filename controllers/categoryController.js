const Category = require('../models/CategorySchema');
const ErrorResponse = require('../utils/errorResponse');

// @desc    List active categories for storefront filters/tabs
// @route   GET /api/v1/category
// @access  Public
exports.getCategories = async (req, res, next) => {
  try {
    const categories = await Category.find({ isActive: { $ne: false } })
      .select('name description image')
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
};
