const Cart = require('../models/CartSchema');
const Product = require('../models/ProductSchema');
const Coupon = require('../models/CouponSchema');
const ErrorResponse = require('../utils/errorResponse');

// Helper function to recalculate cart subtotal, discount, and final total
const recalculateCart = async (cart) => {
  let subtotal = 0;
  cart.items.forEach(item => {
    subtotal += item.price * item.quantity;
  });

  if (cart.coupon) {
    const couponObj = await Coupon.findById(cart.coupon);
    
    if (
      couponObj && 
      couponObj.isActive && 
      new Date(couponObj.startDate) <= new Date() && 
      new Date(couponObj.endDate) >= new Date()
    ) {
      if (couponObj.minOrderAmount && subtotal < couponObj.minOrderAmount) {
        // Subtotal fell below coupon threshold
        cart.coupon = null;
        cart.discount = 0;
        cart.total = subtotal;
      } else {
        let disc = 0;
        if (couponObj.discountType === 'percentage') {
          disc = (subtotal * couponObj.discountValue) / 100;
          if (couponObj.maxDiscountAmount && disc > couponObj.maxDiscountAmount) {
            disc = couponObj.maxDiscountAmount;
          }
        } else if (couponObj.discountType === 'fixed') {
          disc = couponObj.discountValue;
        }
        cart.discount = Math.round(Math.min(disc, subtotal) * 100) / 100;
        cart.total = Math.round((subtotal - cart.discount) * 100) / 100;
      }
    } else {
      // Coupon expired or inactive
      cart.coupon = null;
      cart.discount = 0;
      cart.total = subtotal;
    }
  } else {
    cart.discount = 0;
    cart.total = subtotal;
  }
  cart.updatedAt = Date.now();
};

// @desc    Get user's cart
// @route   GET /api/v1/cart
// @access  Private
exports.getCart = async (req, res, next) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id })
      .populate({
        path: 'items.product',
        select: 'name price images stock description category originalPrice'
      })
      .populate('coupon', 'code discountType discountValue');

    if (!cart) {
      cart = await Cart.create({
        user: req.user.id,
        items: [],
        total: 0
      });
      return res.status(200).json({
        success: true,
        count: 0,
        total: 0,
        discount: 0,
        data: cart
      });
    }

    // Recalculate totals dynamically
    await recalculateCart(cart);
    await cart.save();

    res.status(200).json({
      success: true,
      count: cart.items.length,
      total: cart.total,
      discount: cart.discount,
      data: cart
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add/Update product in cart
// @route   POST /api/v1/cart/add
// @access  Private
exports.addCart = async (req, res, next) => {
  try {
    const { productId, variant = {}, quantity = 1 } = req.body;

    if (!productId) {
      return next(new ErrorResponse('Product ID is required', 400));
    }

    const product = await Product.findById(productId);
    if (!product) {
      return next(new ErrorResponse('Product not found', 404));
    }

    if (product.stock < quantity) {
      return next(new ErrorResponse(`Only ${product.stock} items available in stock`, 400));
    }

    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = await Cart.create({
        user: req.user.id,
        items: [{
          product: productId,
          variant: {
            color: variant.color || null,
            size: variant.size || null
          },
          quantity: quantity,
          price: product.price
        }],
        total: product.price * quantity
      });
      
      const populatedCart = await Cart.findById(cart._id)
        .populate({
          path: 'items.product',
          select: 'name price images stock'
        });

      return res.status(200).json({
        success: true,
        action: 'added',
        message: 'Product added to cart',
        count: 1,
        total: cart.total,
        discount: cart.discount,
        data: populatedCart
      });
    }

    // Check if variant matches
    const existingItemIndex = cart.items.findIndex(item => 
      item.product.toString() === productId.toString() &&
      item.variant.color === (variant.color || null) &&
      item.variant.size === (variant.size || null)
    );

    let action = '';
    
    if (existingItemIndex > -1) {
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;
      
      if (product.stock < newQuantity) {
        return next(new ErrorResponse(`Only ${product.stock} items available in stock. You already have ${cart.items[existingItemIndex].quantity} in cart.`, 400));
      }
      
      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].price = product.price;
      action = 'updated';
    } else {
      cart.items.push({
        product: productId,
        variant: {
          color: variant.color || null,
          size: variant.size || null
        },
        quantity: quantity,
        price: product.price
      });
      action = 'added';
    }

    await recalculateCart(cart);
    await cart.save();

    const populatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'items.product',
        select: 'name price images stock'
      })
      .populate('coupon', 'code discountType discountValue');

    res.status(200).json({
      success: true,
      action: action,
      message: `Product ${action} to cart`,
      count: populatedCart.items.length,
      total: populatedCart.total,
      discount: populatedCart.discount,
      data: populatedCart
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update cart item quantity
// @route   PUT /api/v1/cart/update-quantity/:itemId
// @access  Private
exports.updateItemQuantity = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    const { itemId } = req.params;

    if (quantity === undefined || quantity < 1) {
      return next(new ErrorResponse('Valid quantity is required (minimum 1)', 400));
    }

    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return next(new ErrorResponse('Cart not found', 404));
    }

    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
    
    if (itemIndex === -1) {
      return next(new ErrorResponse('Item not found in cart', 404));
    }

    const product = await Product.findById(cart.items[itemIndex].product);
    if (!product) {
      return next(new ErrorResponse('Product not found', 404));
    }

    if (product.stock < quantity) {
      return next(new ErrorResponse(`Only ${product.stock} items available in stock`, 400));
    }

    cart.items[itemIndex].quantity = quantity;
    cart.items[itemIndex].price = product.price;

    await recalculateCart(cart);
    await cart.save();

    const populatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'items.product',
        select: 'name price images stock'
      })
      .populate('coupon', 'code discountType discountValue');

    res.status(200).json({
      success: true,
      message: 'Quantity updated successfully',
      count: populatedCart.items.length,
      total: populatedCart.total,
      discount: populatedCart.discount,
      data: populatedCart
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove item from cart
// @route   DELETE /api/v1/cart/remove/:itemId
// @access  Private
exports.removeCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return next(new ErrorResponse('Cart not found', 404));
    }

    const itemIndex = cart.items.findIndex(item => item._id.toString() === req.params.itemId);
    
    if (itemIndex === -1) {
      return next(new ErrorResponse('Item not found in cart', 404));
    }

    cart.items.splice(itemIndex, 1);
    
    await recalculateCart(cart);
    await cart.save();

    const populatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'items.product',
        select: 'name price images stock'
      })
      .populate('coupon', 'code discountType discountValue');

    res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      count: populatedCart.items.length,
      total: populatedCart.total,
      discount: populatedCart.discount,
      data: populatedCart
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Clear entire cart
// @route   DELETE /api/v1/cart/clear
// @access  Private
exports.clearCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return next(new ErrorResponse('Cart not found', 404));
    }

    cart.items = [];
    cart.total = 0;
    cart.coupon = null;
    cart.discount = 0;
    cart.updatedAt = Date.now();
    await cart.save();

    res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      data: cart
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get cart count
// @route   GET /api/v1/cart/count
// @access  Private
exports.getCartCount = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    
    const count = cart ? cart.items.length : 0;
    const totalQuantity = cart ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
    
    res.status(200).json({
      success: true,
      count: count,
      totalQuantity: totalQuantity
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get cart total
// @route   GET /api/v1/cart/total
// @access  Private
exports.getCartTotal = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    const total = cart ? cart.total : 0;
    
    res.status(200).json({
      success: true,
      total: total
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Apply coupon to cart
// @route   POST /api/v1/cart/apply-coupon
// @access  Private
exports.applyCoupon = async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      return next(new ErrorResponse('Coupon code is required', 400));
    }

    const cart = await Cart.findOne({ user: req.user.id }).populate({
      path: 'items.product',
      select: 'price'
    });

    if (!cart || cart.items.length === 0) {
      return next(new ErrorResponse('Your cart is empty', 400));
    }

    const couponObj = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    
    if (!couponObj) {
      return next(new ErrorResponse('Invalid or inactive coupon code', 400));
    }

    const now = new Date();
    if (new Date(couponObj.startDate) > now || new Date(couponObj.endDate) < now) {
      return next(new ErrorResponse('Coupon has expired or is not yet active', 400));
    }

    if (couponObj.usageLimit && couponObj.usedCount >= couponObj.usageLimit) {
      return next(new ErrorResponse('Coupon usage limit reached', 400));
    }

    // Calculate subtotal
    let subtotal = 0;
    cart.items.forEach(item => {
      subtotal += item.price * item.quantity;
    });

    if (couponObj.minOrderAmount && subtotal < couponObj.minOrderAmount) {
      return next(new ErrorResponse(`Minimum purchase amount of ₹${couponObj.minOrderAmount} is required for this coupon`, 400));
    }

    cart.coupon = couponObj._id;
    await recalculateCart(cart);
    await cart.save();

    const populatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'items.product',
        select: 'name price images stock'
      })
      .populate('coupon', 'code discountType discountValue');

    res.status(200).json({
      success: true,
      message: `Coupon "${couponObj.code}" applied successfully!`,
      total: populatedCart.total,
      discount: populatedCart.discount,
      data: populatedCart
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove coupon from cart
// @route   POST /api/v1/cart/remove-coupon
// @access  Private
exports.removeCoupon = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return next(new ErrorResponse('Cart not found', 404));
    }

    cart.coupon = null;
    cart.discount = 0;
    
    // Recalculate totals
    let subtotal = 0;
    cart.items.forEach(item => {
      subtotal += item.price * item.quantity;
    });
    cart.total = subtotal;
    cart.updatedAt = Date.now();

    await cart.save();

    const populatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'items.product',
        select: 'name price images stock'
      });

    res.status(200).json({
      success: true,
      message: 'Coupon removed successfully',
      total: populatedCart.total,
      discount: populatedCart.discount,
      data: populatedCart
    });
  } catch (error) {
    next(error);
  }
};
