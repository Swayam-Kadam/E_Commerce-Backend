const express = require('express');
const { protect, authorize, optionalAuth } = require('../middleware/auth');
const { uploadProductImages } = require('../middleware/upload');
const productController = require('../controllers/productController');

const router = express.Router();

// Public routes with optional auth (wishlist/cart flags when logged in)
router.get('/', optionalAuth, productController.getProducts);
router.get('/:id', optionalAuth, productController.getProduct);

// Admin routes
router.post('/', protect, authorize('admin'), uploadProductImages, productController.createProduct);
router.put('/:id', protect, authorize('admin'), uploadProductImages, productController.updateProduct);
router.delete('/:id', protect, authorize('admin'), productController.deleteProduct);

module.exports = router;
