const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const categoryController = require('../controllers/categoryController');

const router = express.Router();

router.get('/', categoryController.getCategories);
router.post('/', protect, authorize('admin'), categoryController.createCategory);

module.exports = router;
