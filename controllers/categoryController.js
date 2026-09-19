const Category = require('../models/CategorySchema');
const ErrorResponse = require('../utils/errorResponse');
const { uniqueSlug } = require('../utils/slug');

// @desc    List active categories for storefront filters/tabs
// @route   GET /api/v1/category
// @access  Public
exports.getCategories = async (req, res, next) => {
  try {
    const categories = await Category.find({ isActive: { $ne: false } })
      .select('name slug description image')
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

// @desc    Create category (admin helpers may call this elsewhere)
// @route   POST /api/v1/category
// @access  Private/Admin (if wired)
exports.createCategory = async (req, res, next) => {
  try {
    const { name, description, image, parentCategory, isActive } = req.body;
    if (!name) {
      return next(new ErrorResponse('Category name is required', 400));
    }
    const slug = await uniqueSlug(Category, name);
    const category = await Category.create({
      name,
      slug,
      description,
      image,
      parentCategory: parentCategory || undefined,
      isActive: isActive === undefined ? true : Boolean(isActive),
    });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};
