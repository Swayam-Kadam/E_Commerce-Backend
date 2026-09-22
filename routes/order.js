const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const orderController = require('../controllers/orderController');

const router = express.Router();

router.get('/', protect, orderController.getOrders);

// Admin routes must be registered before /:id
router.get(
  '/admin/all',
  protect,
  authorize('admin'),
  orderController.getAllOrdersAdmin
);
router.patch(
  '/admin/:id/status',
  protect,
  authorize('admin'),
  orderController.updateOrderStatusAdmin
);

router.post('/:id/cancel', protect, orderController.cancelOrder);
router.post('/:id/return', protect, orderController.returnOrder);
router.get('/:id', protect, orderController.getOrder);

module.exports = router;
