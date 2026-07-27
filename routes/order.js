const express = require('express');
const { protect } = require('../middleware/auth');
const orderController = require('../controllers/orderController');

const router = express.Router();

router.get('/', protect, orderController.getOrders);
router.get('/:id', protect, orderController.getOrder);

module.exports = router;
