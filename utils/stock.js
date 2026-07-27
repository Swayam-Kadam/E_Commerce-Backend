const Product = require('../models/ProductSchema');

/**
 * Atomically decrement product stock if enough units remain.
 * Safe under concurrent checkouts (last-unit race).
 *
 * @param {import('mongoose').Types.ObjectId|string} productId
 * @param {number} quantity
 * @param {import('mongoose').ClientSession|null} session
 * @returns {Promise<boolean>} true if stock was decremented
 */
async function decrementStockIfAvailable(productId, quantity, session = null) {
  const qty = Number(quantity);
  if (!productId || !Number.isFinite(qty) || qty < 1) {
    return false;
  }

  const options = session ? { session } : {};
  const result = await Product.updateOne(
    { _id: productId, stock: { $gte: qty } },
    { $inc: { stock: -qty } },
    options
  );

  return result.modifiedCount === 1;
}

/**
 * Restore stock previously decremented in this request (rollback helper).
 * Prefer aborting a MongoDB transaction instead when possible.
 */
async function restoreStock(productId, quantity, session = null) {
  const qty = Number(quantity);
  if (!productId || !Number.isFinite(qty) || qty < 1) {
    return;
  }

  const options = session ? { session } : {};
  await Product.updateOne(
    { _id: productId },
    { $inc: { stock: qty } },
    options
  );
}

module.exports = {
  decrementStockIfAvailable,
  restoreStock,
};
