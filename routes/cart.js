const express = require('express');
const { protect } = require('../middleware/auth');
const cartController = require('../controllers/cartController');

const router = express.Router();

router.get('/', protect, cartController.getCart);
router.post('/add', protect, cartController.addCart);
router.put('/update-quantity/:itemId', protect, cartController.updateItemQuantity);
router.delete('/remove/:itemId', protect, cartController.removeCart);
router.delete('/clear', protect, cartController.clearCart);
router.get('/count', protect, cartController.getCartCount);
router.get('/total', protect, cartController.getCartTotal);

// Coupon endpoints
router.post('/apply-coupon', protect, cartController.applyCoupon);
router.post('/remove-coupon', protect, cartController.removeCoupon);

module.exports = router;