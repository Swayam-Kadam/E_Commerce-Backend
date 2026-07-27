const express = require('express');
const { protect } = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

router.post('/api/create-order', protect, paymentController.createOrder);
router.post('/api/verify-payment', protect, paymentController.verifyPayment);

module.exports = router;