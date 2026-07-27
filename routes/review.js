const express = require('express');
const { protect } = require('../middleware/auth');
const reviewController = require('../controllers/reviewController');

const router = express.Router();

// Public routes
router.get('/', reviewController.getReviews);
router.get('/products/:productId', reviewController.getProductReviews);

// Private routes — register /me before /:id so "me" is not treated as an id
router.get('/me/my-reviews', protect, reviewController.getMyReviews);
router.post('/products/:productId', protect, reviewController.createReview);
router.put('/:id', protect, reviewController.updateReview);
router.delete('/:id', protect, reviewController.deleteReview);
router.get('/:id', reviewController.getReview);

module.exports = router;
