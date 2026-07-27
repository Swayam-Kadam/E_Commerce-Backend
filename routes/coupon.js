const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const couponController = require('../controllers/couponController');

const router = express.Router();

// Only admin can perform CRUD on coupons
router.use(protect, authorize('admin'));

router.route('/')
  .get(couponController.getCoupons)
  .post(couponController.createCoupon);

router.route('/:id')
  .get(couponController.getCoupon)
  .put(couponController.updateCoupon)
  .delete(couponController.deleteCoupon);

module.exports = router;
