const Category = require('../models/CategorySchema');
const ErrorResponse = require('../utils/errorResponse');
const { uniqueSlug } = require('../utils/slug');
const { getJson, setJson, del } = require('../utils/cache');

// @desc    List active categories for storefront filters/tabs
// @route   GET /api/v1/category
// @access  Public
exports.getCategories = async (req, res, next) => {
  const CACHE_KEY = 'categories:active';

  try {
    const cached = await getJson(CACHE_KEY);
    if (cached) {
      return res.status(200).json(cached);
    }

    const categories = await Category.find({ isActive: { $ne: false } })
      .select('name slug description image')
      .sort({ name: 1 })
      .lean();

    const body = {
      success: true,
      count: categories.length,
      data: categories,
    };

    await setJson(CACHE_KEY, body, 300);
    return res.status(200).json(body);
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
    await del('categories:active');
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};
