const express = require('express');
const Product = require('../models/ProductSchema');
const { protect, authorize } = require('../middleware/auth');
const { uploadProductImages } = require('../middleware/upload');

const router = express.Router();

// @desc    Get all products
// @route   GET /api/v1/products
// @access  Public (Both user and admin can access)
router.get('/', async (req, res) => {
  try {
    const products = await Product.find()
      .populate('category', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching products'
    });
  }
});

// @desc    Get single product
// @route   GET /api/v1/products/:id
// @access  Public (Both user and admin can access)
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name')
      .populate('reviews', 'rating comment user');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching product'
    });
  }
});

// @desc    Create new product
// @route   POST /api/v1/products
// @access  Private/Admin only
// router.post('/', protect, authorize('admin'), async (req, res) => {
//   try {
//     const {
//       name,
//       description,
//       price,
//       originalPrice,
//       category,
//       images,
//       stock,
//       specifications,
//       variants,
//       isBestSeller
//     } = req.body;

//     // Validation
//     if (!name || !description || !price || !category) {
//       return res.status(400).json({
//         success: false,
//         message: 'Please provide name, description, price, and category'
//       });
//     }

//     const product = await Product.create({
//       name,
//       description,
//       price,
//       originalPrice,
//       category,
//       images: images || [],
//       stock: stock || 0,
//       specifications: specifications || {},
//       variants: variants || [],
//       isBestSeller: isBestSeller || false
//     });

//     res.status(201).json({
//       success: true,
//       message: 'Product created successfully',
//       data: product
//     });
//   } catch (error) {
//     console.error('Create product error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error while creating product'
//     });
//   }
// });

router.post('/', protect, authorize('admin'), uploadProductImages, async (req, res) => {
  try {
    console.log('Request files:', req.files);
    console.log('Request body:', req.body);

    const {
      name,
      description,
      price,
      originalPrice,
      category,
      stock,
      specifications,
      variants,
      isBestSeller
    } = req.body;

    // Validation
    if (!name || !description || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, description, price, and category'
      });
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

     // Process variants (parse JSON string to object)
    let variantsArray = [];
    if (variants) {
      try {
        variantsArray = JSON.parse(variants);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid variants format. Must be valid JSON.'
        });
      }
    }

    // Process specifications
    let specsObject = {};
    if (specifications) {
      try {
        specsObject = JSON.parse(specifications);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid specifications format. Must be valid JSON.'
        });
      }
    }

    const product = await Product.create({
      name,
      description,
      price: parseFloat(price),
      originalPrice: originalPrice ? parseFloat(originalPrice) : undefined,
      category,
      images,
      stock: stock ? parseInt(stock) : 0,
      specifications: specifications ? JSON.parse(specifications) : {},
      variants: variantsArray,
      isBestSeller: isBestSeller === 'true'
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });

  } catch (error) {
    console.error('Create product error details:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating product',
      error: error.message
    });
  }
});

// @desc    Update product
// @route   PUT /api/v1/products/:id
// @access  Private/Admin only
// router.put('/:id', protect, authorize('admin'), async (req, res) => {
//   try {
//     const product = await Product.findByIdAndUpdate(
//       req.params.id,
//       req.body,
//       { new: true, runValidators: true }
//     );

//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         message: 'Product not found'
//       });
//     }

//     res.status(200).json({
//       success: true,
//       message: 'Product updated successfully',
//       data: product
//     });
//   } catch (error) {
//     console.error('Update product error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error while updating product'
//     });
//   }
// });

router.put('/:id', protect, authorize('admin'), uploadProductImages, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Fields that are allowed to be updated
    const allowedFields = ['name', 'description', 'price', 'originalPrice', 'category', 'stock', 'specifications', 'variants', 'isBestSeller'];
    const updateData = {};

    // Only include allowed fields
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Parse JSON fields
    if (updateData.variants && typeof updateData.variants === 'string') {
      try {
        updateData.variants = JSON.parse(updateData.variants);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid variants JSON format'
        });
      }
    }

    if (updateData.specifications && typeof updateData.specifications === 'string') {
      try {
        updateData.specifications = JSON.parse(updateData.specifications);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid specifications JSON format'
        });
      }
    }

    // Handle images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => ({
        url: file.path,
        public_id: file.filename,
        filename: file.originalname
      }));
      updateData.images = [...product.images, ...newImages];
    }

    // Convert data types
    if (updateData.price) updateData.price = parseFloat(updateData.price);
    if (updateData.originalPrice) updateData.originalPrice = parseFloat(updateData.originalPrice);
    if (updateData.stock) updateData.stock = parseInt(updateData.stock);
    if (updateData.isBestSeller !== undefined) {
      updateData.isBestSeller = updateData.isBestSeller === 'true';
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
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating product',
      error: error.message
    });
  }
});

// @desc    Delete product
// @route   DELETE /api/v1/products/:id
// @access  Private/Admin only
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting product'
    });
  }
});

module.exports = router;