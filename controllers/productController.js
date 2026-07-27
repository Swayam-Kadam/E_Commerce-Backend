const Product = require('../models/ProductSchema');
const Category = require('../models/CategorySchema');
const Review = require('../models/ReviewSchema');
const Wishlist = require('../models/WishlistSchema');
const Cart = require('../models/CartSchema');
const ErrorResponse = require('../utils/errorResponse');

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
      sort, 
      page, 
      limit
    } = req.query;

    // Build query object
    const query = {};

    // 1. Text Search
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // 2. Category Filter (can be category ID or category name)
    if (category) {
      // If it's a valid MongoDB ObjectId
      if (category.match(/^[0-9a-fA-F]{24}$/)) {
        query.category = category;
      } else {
        // Find category object by name
        const foundCategory = await Category.findOne({ name: { $regex: `^${category}$`, $options: 'i' } });
        if (foundCategory) {
          query.category = foundCategory._id;
        } else {
          // If category name doesn't exist, search products with raw string value just in case
          query.category = null; 
        }
      }
    }

    // 3. Price Filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // 4. Rating Filter
    if (rating) {
      query.averageRating = { $gte: parseFloat(rating) };
    }

    // 5. Stock Filter
    if (inStock === 'true') {
      query.stock = { $gt: 0 };
    } else if (inStock === 'false') {
      query.stock = 0;
    }

    // Pagination setup — only apply when page/limit are explicitly provided
    // so storefront/admin list calls still receive the full catalog by default
    const hasPagination = req.query.page != null || req.query.limit != null;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 12;
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination metadata
    const total = await Product.countDocuments(query);

    // Build the query execution
    let dbQuery = Product.find(query).populate('category', 'name description');

    // 6. Sorting
    if (sort) {
      const sortBy = sort.split(',').join(' ');
      dbQuery = dbQuery.sort(sortBy);
    } else {
      dbQuery = dbQuery.sort('-createdAt'); // Default: Newest first
    }

    // Apply pagination only when requested
    if (hasPagination) {
      dbQuery = dbQuery.skip(skip).limit(limitNum);
    }

    // Execute query
    const products = await dbQuery;

    // Fetch wishlist and cart states for populated info if authenticated
    let wishlistProductIds = [];
    const cartItemsMap = {};

    if (req.user) {
      const [wishlist, cart] = await Promise.all([
        Wishlist.findOne({ user: req.user.id }),
        Cart.findOne({ user: req.user.id })
      ]);

      if (wishlist) {
        wishlistProductIds = wishlist.products.map(id => id.toString());
      }

      if (cart && cart.items.length > 0) {
        cart.items.forEach(item => {
          cartItemsMap[item.product.toString()] = {
            inCart: true,
            cartItemId: item._id,
            quantity: item.quantity,
            variant: item.variant || {}
          };
        });
      }
    }

    // Map reviews info
    const productIds = products.map(p => p._id);
    const reviews = await Review.find({ product: { $in: productIds } })
      .populate('user', 'username email')
      .lean();

    const reviewsByProduct = {};
    reviews.forEach(review => {
      const pId = review.product.toString();
      if (!reviewsByProduct[pId]) {
        reviewsByProduct[pId] = [];
      }
      reviewsByProduct[pId].push(review);
    });

    const enrichedProducts = products.map(product => {
      const pIdStr = product._id.toString();
      const productReviews = reviewsByProduct[pIdStr] || [];
      const avgRating = productReviews.length > 0
        ? productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length
        : product.averageRating || 0;

      return {
        ...product.toObject(),
        reviews: productReviews,
        averageRating: parseFloat(avgRating.toFixed(1)),
        reviewCount: productReviews.length,
        isWishlist: wishlistProductIds.includes(pIdStr),
        cartInfo: cartItemsMap[pIdStr] || {
          inCart: false,
          cartItemId: null,
          quantity: 0,
          variant: {}
        }
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
            limit: limitNum
          }
        : {
            total,
            page: 1,
            pages: 1,
            limit: total
          },
      data: enrichedProducts
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
      Product.findById(req.params.id).populate('category', 'name description'),
      Review.find({ product: req.params.id }).populate('user', 'username profile.firstName profile.lastName').sort({ createdAt: -1 })
    ]);

    if (!product) {
      return next(new ErrorResponse('Product not found', 404));
    }

    let cartInfo = {
      inCart: false,
      cartItemId: null,
      quantity: 0,
      variant: {}
    };

    let isWishlist = false;

    if (req.user) {
      const [cart, wishlist] = await Promise.all([
        Cart.findOne({ user: req.user.id }),
        Wishlist.findOne({ user: req.user.id })
      ]);

      if (cart) {
        const cartItem = cart.items.find(item => item.product.toString() === product._id.toString());
        if (cartItem) {
          cartInfo = {
            inCart: true,
            cartItemId: cartItem._id,
            quantity: cartItem.quantity,
            variant: cartItem.variant || {}
          };
        }
      }

      if (wishlist) {
        isWishlist = wishlist.products.map(id => id.toString()).includes(product._id.toString());
      }
    }

    res.status(200).json({
      success: true,
      data: {
        ...product.toObject(),
        reviews,
        averageRating: reviews.length > 0 ? 
          parseFloat((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)) : product.averageRating || 0,
        reviewCount: reviews.length,
        isWishlist,
        cartInfo
      }
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
      averageRating
    } = req.body;

    if (!name || !description || !price || !category) {
      return next(new ErrorResponse('Please provide name, description, price, and category', 400));
    }

    // Process uploaded images
    const images = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        images.push({
          url: file.path,
          public_id: file.filename,
          filename: file.originalname
        });
      });
    }

    // Process variants
    let variantsArray = [];
    if (variants) {
      try {
        variantsArray = typeof variants === 'string' ? JSON.parse(variants) : variants;
      } catch (error) {
        return next(new ErrorResponse('Invalid variants format. Must be valid JSON.', 400));
      }
    }

    // Process specifications
    let specsObject = {};
    if (specifications) {
      try {
        specsObject = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
      } catch (error) {
        return next(new ErrorResponse('Invalid specifications format. Must be valid JSON.', 400));
      }
    }

    // Ensure category exists as ObjectId or create raw category if it's name string
    let categoryId = category;
    if (!category.match(/^[0-9a-fA-F]{24}$/)) {
      let foundCategory = await Category.findOne({ name: { $regex: `^${category}$`, $options: 'i' } });
      if (!foundCategory) {
        foundCategory = await Category.create({ name: category });
      }
      categoryId = foundCategory._id;
    }

    const product = await Product.create({
      name,
      description,
      price: parseFloat(price),
      originalPrice: originalPrice ? parseFloat(originalPrice) : undefined,
      category: categoryId,
      images,
      stock: stock ? parseInt(stock, 10) : 0,
      specifications: specsObject,
      variants: variantsArray,
      isBestSeller: isBestSeller === 'true' || isBestSeller === true,
      averageRating: averageRating ? parseFloat(averageRating) : 0
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
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

    const allowedFields = ['name', 'description', 'price', 'originalPrice', 'category', 'stock', 'specifications', 'variants', 'isBestSeller', 'averageRating', 'images'];
    const updateData = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (updateData.variants && typeof updateData.variants === 'string') {
      try {
        updateData.variants = JSON.parse(updateData.variants);
      } catch (error) {
        return next(new ErrorResponse('Invalid variants JSON format', 400));
      }
    }

    if (updateData.specifications && typeof updateData.specifications === 'string') {
      try {
        updateData.specifications = JSON.parse(updateData.specifications);
      } catch (error) {
        return next(new ErrorResponse('Invalid specifications JSON format', 400));
      }
    }

    if (updateData.category && !updateData.category.match(/^[0-9a-fA-F]{24}$/)) {
      let foundCategory = await Category.findOne({ name: { $regex: `^${updateData.category}$`, $options: 'i' } });
      if (!foundCategory) {
        foundCategory = await Category.create({ name: updateData.category });
      }
      updateData.category = foundCategory._id;
    }

    // Process new images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => ({
        url: file.path,
        public_id: file.filename,
        filename: file.originalname
      }));
      updateData.images = [...(product.images || []), ...newImages];
    }

    if (updateData.price) updateData.price = parseFloat(updateData.price);
    if (updateData.originalPrice) updateData.originalPrice = parseFloat(updateData.originalPrice);
    if (updateData.stock) updateData.stock = parseInt(updateData.stock, 10);
    if (updateData.isBestSeller !== undefined) {
      updateData.isBestSeller = updateData.isBestSeller === 'true' || updateData.isBestSeller === true;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct
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
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return next(new ErrorResponse('Product not found', 404));
    }

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
