const User = require('../models/UserSchema');
const Order = require('../models/OrderSchema');
const Product = require('../models/ProductSchema');
const Review = require('../models/ReviewSchema');

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];

const emptyMonthly = () => Array(12).fill(0);
const emptyQuarterly = () => Array(4).fill(0);

const buildPeriodData = (orders, year) => {
  const monthlySales = emptyMonthly();
  const monthlyRevenue = emptyMonthly();
  const quarterlySales = emptyQuarterly();
  const quarterlyRevenue = emptyQuarterly();

  orders.forEach((order) => {
    const createdAt = new Date(order.createdAt);
    if (Number.isNaN(createdAt.getTime())) return;
    if (createdAt.getFullYear() !== year) return;

    const month = createdAt.getMonth();
    const quarter = Math.floor(month / 3);
    const amount = Number(order.totalAmount) || 0;

    monthlySales[month] += 1;
    monthlyRevenue[month] += amount;
    quarterlySales[quarter] += 1;
    quarterlyRevenue[quarter] += amount;
  });

  const toProfit = (revenues) => revenues.map((value) => Number((value * 0.45).toFixed(2)));

  return {
    monthly: {
      labels: MONTH_LABELS,
      sales: monthlySales,
      revenue: monthlyRevenue.map((value) => Number(value.toFixed(2))),
      profit: toProfit(monthlyRevenue)
    },
    quarterly: {
      labels: QUARTER_LABELS,
      sales: quarterlySales,
      revenue: quarterlyRevenue.map((value) => Number(value.toFixed(2))),
      profit: toProfit(quarterlyRevenue)
    }
  };
};

const calcGrowthRate = (orders) => {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
  const lastMonth = lastMonthDate.getMonth();
  const lastMonthYear = lastMonthDate.getFullYear();

  let thisMonthRevenue = 0;
  let lastMonthRevenue = 0;

  orders.forEach((order) => {
    const createdAt = new Date(order.createdAt);
    if (Number.isNaN(createdAt.getTime())) return;

    const amount = Number(order.totalAmount) || 0;
    if (createdAt.getFullYear() === thisYear && createdAt.getMonth() === thisMonth) {
      thisMonthRevenue += amount;
    }
    if (createdAt.getFullYear() === lastMonthYear && createdAt.getMonth() === lastMonth) {
      lastMonthRevenue += amount;
    }
  });

  if (lastMonthRevenue === 0) {
    return thisMonthRevenue > 0 ? 100 : 0;
  }

  return Number((((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1));
};

// @desc    Get admin dashboard stats and chart data
// @route   GET /api/v1/dashboard
// @access  Private/Admin
exports.getDashboardStats = async (req, res, next) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();

    const [totalUsers, totalProducts, totalReviews, orders] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Product.countDocuments(),
      Review.countDocuments(),
      Order.find({
        paymentStatus: { $in: ['completed', 'pending'] }
      })
        .select('totalAmount createdAt paymentStatus orderStatus')
        .lean()
    ]);

    const paidOrders = orders.filter(
      (order) => order.paymentStatus === 'completed' || order.orderStatus !== 'cancelled'
    );

    const totalOrders = paidOrders.length;
    const totalRevenue = paidOrders.reduce(
      (sum, order) => sum + (Number(order.totalAmount) || 0),
      0
    );
    const growthRate = calcGrowthRate(paidOrders);
    const charts = buildPeriodData(paidOrders, year);

    const recentOrders = await Order.find()
      .populate({
        path: 'user',
        select: 'username email'
      })
      .populate({
        path: 'items.product',
        select: 'name images price'
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.status(200).json({
      success: true,
      message: 'Dashboard data fetched successfully',
      data: {
        stats: {
          totalUsers,
          totalProducts,
          totalReviews,
          totalOrders,
          totalRevenue: Number(totalRevenue.toFixed(2)),
          growthRate
        },
        charts,
        recentOrders,
        year
      }
    });
  } catch (error) {
    next(error);
  }
};
