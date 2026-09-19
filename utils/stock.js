const Product = require('../models/ProductSchema');

/**
 * Atomically decrement stock if enough units remain.
 * When variantSku is provided, decrements that variant's stock and product.stock together.
 *
 * @param {import('mongoose').Types.ObjectId|string} productId
 * @param {number} quantity
 * @param {import('mongoose').ClientSession|null} session
 * @param {string|null} variantSku
 * @returns {Promise<boolean>} true if stock was decremented
 */
async function decrementStockIfAvailable(
  productId,
  quantity,
  session = null,
  variantSku = null
) {
  const qty = Number(quantity);
  if (!productId || !Number.isFinite(qty) || qty < 1) {
    return false;
  }

  const options = session ? { session } : {};

  if (variantSku) {
    const result = await Product.updateOne(
      {
        _id: productId,
        variants: { $elemMatch: { sku: variantSku, stock: { $gte: qty } } },
      },
      { $inc: { 'variants.$[v].stock': -qty, stock: -qty } },
      {
        ...options,
        arrayFilters: [{ 'v.sku': variantSku, 'v.stock': { $gte: qty } }],
      }
    );
    return result.modifiedCount === 1;
  }

  const result = await Product.updateOne(
    { _id: productId, stock: { $gte: qty } },
    { $inc: { stock: -qty } },
    options
  );

  return result.modifiedCount === 1;
}

/**
 * Restore stock previously decremented in this request (rollback helper).
 */
async function restoreStock(
  productId,
  quantity,
  session = null,
  variantSku = null
) {
  const qty = Number(quantity);
  if (!productId || !Number.isFinite(qty) || qty < 1) {
    return;
  }

  const options = session ? { session } : {};

  if (variantSku) {
    await Product.updateOne(
      { _id: productId, 'variants.sku': variantSku },
      { $inc: { 'variants.$[v].stock': qty, stock: qty } },
      {
        ...options,
        arrayFilters: [{ 'v.sku': variantSku }],
      }
    );
    return;
  }

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
