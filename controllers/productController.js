const Product = require('../models/ProductSchema');
const Category = require('../models/CategorySchema');
const Review = require('../models/ReviewSchema');
const Wishlist = require('../models/WishlistSchema');
const Cart = require('../models/CartSchema');
const ErrorResponse = require('../utils/errorResponse');
const { uniqueSlug } = require('../utils/slug');
const { parseVariantsInput } = require('../utils/parseVariants');
const { normalizeVariants } = require('../utils/productVariants');

// @desc    Get all products
// @route   GET /api/v1/product
// @access  Public
exports.getProducts = async (req, res, next) => {
  try {
    const {
      search,
      category,
      minPrice,
      maxPrice,
      rating,
      inStock,
      isBestSeller,
      sort,
      page,
      limit,
    } = req.query;

    const query = { isActive: { $ne: false } };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    if (category) {
      if (category.match(/^[0-9a-fA-F]{24}$/)) {
        query.category = category;
      } else {
        const foundCategory = await Category.findOne({
          name: { $regex: `^${category}$`, $options: 'i' },
        });
        if (foundCategory) {
          query.category = foundCategory._id;
        } else {
          query.category = null;
        }
      }
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    if (rating) {
      query.averageRating = { $gte: parseFloat(rating) };
    }

    if (inStock === 'true') {
      query.stock = { $gt: 0 };
    } else if (inStock === 'false') {
      query.stock = 0;
    }

    if (isBestSeller === 'true') {
      query.isBestSeller = true;
    }

    const hasPagination = req.query.page != null || req.query.limit != null;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const rawLimit = parseInt(limit, 10) || 12;
    const limitNum = hasPagination ? Math.min(Math.max(rawLimit, 1), 24) : rawLimit;
    const skip = (pageNum - 1) * limitNum;

    const total = await Product.countDocuments(query);

    let dbQuery = Product.find(query).populate('category', 'name description slug');

    if (sort) {
      const sortBy = sort.split(',').join(' ');
      dbQuery = dbQuery.sort(sortBy);
    } else {
      dbQuery = dbQuery.sort('-createdAt');
    }

    if (hasPagination) {
      dbQuery = dbQuery.skip(skip).limit(limitNum);
    }

    const products = await dbQuery;

    let wishlistProductIds = [];
    const cartItemsMap = {};

    if (req.user) {
      const [wishlist, cart] = await Promise.all([
        Wishlist.findOne({ user: req.user.id }),
        Cart.findOne({ user: req.user.id }),
      ]);

      if (wishlist) {
        wishlistProductIds = wishlist.products.map((id) => id.toString());
      }

      if (cart && cart.items.length > 0) {
        cart.items.forEach((item) => {
          cartItemsMap[item.product.toString()] = {
            inCart: true,
            cartItemId: item._id,
            quantity: item.quantity,
            variant: item.variant || {},
            variantSku: item.variantSku || null,
          };
        });
      }
    }

    const productIds = products.map((p) => p._id);
    const reviews = await Review.find({ product: { $in: productIds } })
      .populate('user', 'username email')
      .lean();

    const reviewsByProduct = {};
    reviews.forEach((review) => {
      const pId = review.product.toString();
      if (!reviewsByProduct[pId]) {
        reviewsByProduct[pId] = [];
      }
      reviewsByProduct[pId].push(review);
    });

    const enrichedProducts = products.map((product) => {
      const pIdStr = product._id.toString();
      const productReviews = reviewsByProduct[pIdStr] || [];
      const avgRating =
        productReviews.length > 0
          ? productReviews.reduce((sum, r) => sum + r.rating, 0) /
            productReviews.length
          : product.averageRating || 0;

      return {
        ...product.toObject(),
        reviews: productReviews,
        averageRating: parseFloat(avgRating.toFixed(1)),
        reviewCount: product.reviewCount ?? productReviews.length,
        isWishlist: wishlistProductIds.includes(pIdStr),
        cartInfo: cartItemsMap[pIdStr] || {
          inCart: false,
          cartItemId: null,
          quantity: 0,
          variant: {},
          variantSku: null,
        },
      };
    });

    res.status(200).json({
      success: true,
      count: enrichedProducts.length,
      pagination: hasPagination
        ? {
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum) || 1,
            limit: limitNum,
          }
        : {
            total,
            page: 1,
            pages: 1,
            limit: total,
          },
      data: enrichedProducts,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single product
// @route   GET /api/v1/product/:id
// @access  Public
exports.getProduct = async (req, res, next) => {
  try {
    const [product, reviews] = await Promise.all([
      Product.findById(req.params.id).populate('category', 'name description slug'),
      Review.find({ product: req.params.id })
        .populate('user', 'username profile.firstName profile.lastName')
        .sort({ createdAt: -1 }),
    ]);

    if (!product || product.isActive === false) {
      return next(new ErrorResponse('Product not found', 404));
    }

    let cartInfo = {
      inCart: false,
      cartItemId: null,
      quantity: 0,
      variant: {},
      variantSku: null,
    };

    let isWishlist = false;

    if (req.user) {
      const [cart, wishlist] = await Promise.all([
        Cart.findOne({ user: req.user.id }),
        Wishlist.findOne({ user: req.user.id }),
      ]);

      if (cart) {
        const cartItem = cart.items.find(
          (item) => item.product.toString() === product._id.toString()
        );
        if (cartItem) {
          cartInfo = {
            inCart: true,
            cartItemId: cartItem._id,
            quantity: cartItem.quantity,
            variant: cartItem.variant || {},
            variantSku: cartItem.variantSku || null,
          };
        }
      }

      if (wishlist) {
        isWishlist = wishlist.products
          .map((id) => id.toString())
          .includes(product._id.toString());
      }
    }

    res.status(200).json({
      success: true,
      data: {
        ...product.toObject(),
        reviews,
        averageRating:
          reviews.length > 0
            ? parseFloat(
                (
                  reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
                ).toFixed(1)
              )
            : product.averageRating || 0,
        reviewCount: product.reviewCount ?? reviews.length,
        isWishlist,
        cartInfo,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create product
// @route   POST /api/v1/product
// @access  Private/Admin
exports.createProduct = async (req, res, next) => {
  try {
    const {
      name,
      description,
      price,
      originalPrice,
      category,
      stock,
      specifications,
      variants,
      isBestSeller,
      isActive,
      sku,
    } = req.body;

    if (!name || !description || !price || !category) {
      return next(
        new ErrorResponse(
          'Please provide name, description, price, and category',
          400
        )
      );
    }

    const images = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        images.push({
          url: file.path,
          public_id: file.filename,
          filename: file.originalname,
        });
      });
    }

    let variantsRaw = variants;
    let specsObject = {};
    if (specifications) {
      try {
        specsObject =
          typeof specifications === 'string'
            ? JSON.parse(specifications)
            : specifications;
      } catch (error) {
        return next(
          new ErrorResponse(
            'Invalid specifications format. Must be valid JSON.',
            400
          )
        );
      }
    }

    let categoryId = category;
    if (!category.match(/^[0-9a-fA-F]{24}$/)) {
      let foundCategory = await Category.findOne({
        name: { $regex: `^${category}$`, $options: 'i' },
      });
      if (!foundCategory) {
        const catSlug = await uniqueSlug(Category, category);
        foundCategory = await Category.create({ name: category, slug: catSlug });
      }
      categoryId = foundCategory._id;
    }

    const parsedStock = stock ? parseInt(stock, 10) : 0;
    let variantsArray = [];
    let totalStock = parsedStock;
    try {
      const normalized = parseVariantsInput(variantsRaw, parsedStock, 'new');
      variantsArray = normalized.variants;
      totalStock = normalized.totalStock;
    } catch (error) {
      return next(
        new ErrorResponse('Invalid variants format. Must be valid JSON.', 400)
      );
    }

    const slug = await uniqueSlug(Product, name);

    const product = await Product.create({
      name,
      slug,
      description,
      price: parseFloat(price),
      originalPrice: originalPrice ? parseFloat(originalPrice) : undefined,
      category: categoryId,
      images,
      stock: variantsArray.length > 0 ? totalStock : parsedStock,
      sku: sku || undefined,
      specifications: specsObject,
      variants: variantsArray,
      isBestSeller: isBestSeller === 'true' || isBestSeller === true,
      isActive: isActive === undefined ? true : isActive === 'true' || isActive === true,
    });

    // Re-normalize SKUs with real product id if auto-generated
    if (variantsArray.length > 0) {
      const { variants: withIds, totalStock: synced } = normalizeVariants(
        product.variants.map((v) => v.toObject?.() || v),
        product.stock,
        product._id.toString()
      );
      // Keep existing SKUs if already set; only fill missing
      const merged = product.variants.map((v, i) => ({
        sku: v.sku || withIds[i]?.sku,
        color: v.color,
        size: v.size,
        stock: v.stock,
      }));
      product.variants = merged;
      product.stock = synced;
      await product.save();
    }

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update product
// @route   PUT /api/v1/product/:id
// @access  Private/Admin
exports.updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return next(new ErrorResponse('Product not found', 404));
    }

    const allowedFields = [
      'name',
      'description',
      'price',
      'originalPrice',
      'category',
      'stock',
      'specifications',
      'variants',
      'isBestSeller',
      'isActive',
      'images',
      'sku',
    ];
    const updateData = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (updateData.specifications && typeof updateData.specifications === 'string') {
      try {
        updateData.specifications = JSON.parse(updateData.specifications);
      } catch (error) {
        return next(new ErrorResponse('Invalid specifications JSON format', 400));
      }
    }

    if (updateData.category && !String(updateData.category).match(/^[0-9a-fA-F]{24}$/)) {
      let foundCategory = await Category.findOne({
        name: { $regex: `^${updateData.category}$`, $options: 'i' },
      });
      if (!foundCategory) {
        const catSlug = await uniqueSlug(Category, updateData.category);
        foundCategory = await Category.create({
          name: updateData.category,
          slug: catSlug,
        });
      }
      updateData.category = foundCategory._id;
    }

    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((file) => ({
        url: file.path,
        public_id: file.filename,
        filename: file.originalname,
      }));
      updateData.images = [...(product.images || []), ...newImages];
    }

    if (updateData.price) updateData.price = parseFloat(updateData.price);
    if (updateData.originalPrice) {
      updateData.originalPrice = parseFloat(updateData.originalPrice);
    }
    if (updateData.stock !== undefined) {
      updateData.stock = parseInt(updateData.stock, 10);
    }
    if (updateData.isBestSeller !== undefined) {
      updateData.isBestSeller =
        updateData.isBestSeller === 'true' || updateData.isBestSeller === true;
    }
    if (updateData.isActive !== undefined) {
      updateData.isActive =
        updateData.isActive === 'true' || updateData.isActive === true;
    }

    if (updateData.variants) {
      try {
        const { variants: normalized, totalStock } = parseVariantsInput(
          updateData.variants,
          updateData.stock != null ? updateData.stock : product.stock,
          product._id.toString()
        );
        updateData.variants = normalized;
        updateData.stock = totalStock;
      } catch (error) {
        return next(new ErrorResponse('Invalid variants JSON format', 400));
      }
    } else if (updateData.stock !== undefined && product.variants?.length > 0) {
      delete updateData.stock;
    }

    if (updateData.name && updateData.name !== product.name) {
      updateData.slug = await uniqueSlug(Product, updateData.name, product._id);
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete product
// @route   DELETE /api/v1/product/:id
// @access  Private/Admin
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!product) {
      return next(new ErrorResponse('Product not found', 404));
    }

    res.status(200).json({
      success: true,
      message: 'Product deactivated successfully',
      data: product,
    });
  } catch (error) {
    next(error);
  }
};
