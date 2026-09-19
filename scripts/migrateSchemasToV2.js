/**
 * One-time migration: production schema hardening (v2)
 *
 * - Merge User.wishlist into Wishlist collection, then unset User.wishlist
 * - Expand legacy variants[0].{color[],size[]} into SKU rows (first SKU gets full stock)
 * - Backfill product/category slugs
 * - Set reviewCount from Review aggregation; unset Product.reviews
 * - Ensure isActive defaults
 *
 * Usage (from Backend/):
 *   node scripts/migrateSchemasToV2.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/UserSchema');
const Wishlist = require('../models/WishlistSchema');
const Product = require('../models/ProductSchema');
const Category = require('../models/CategorySchema');
const Review = require('../models/ReviewSchema');
const { slugify } = require('../utils/slug');
const { normalizeVariants } = require('../utils/productVariants');

async function uniqueSlugFor(Model, base, excludeId = null) {
  const root = slugify(base) || 'item';
  let candidate = root;
  let n = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const filter = { slug: candidate };
    if (excludeId) filter._id = { $ne: excludeId };
    const exists = await Model.exists(filter);
    if (!exists) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

async function migrateWishlists() {
  const users = await User.collection
    .find({ wishlist: { $exists: true, $ne: [] } })
    .toArray();

  let merged = 0;
  for (const user of users) {
    const productIds = (user.wishlist || []).filter(Boolean);
    if (productIds.length === 0) continue;

    let wishlist = await Wishlist.findOne({ user: user._id });
    if (!wishlist) {
      wishlist = await Wishlist.create({
        user: user._id,
        products: productIds,
      });
    } else {
      const set = new Set(wishlist.products.map((id) => id.toString()));
      productIds.forEach((id) => set.add(id.toString()));
      wishlist.products = [...set];
      await wishlist.save();
    }
    merged += 1;
  }

  const unsetResult = await User.collection.updateMany(
    { wishlist: { $exists: true } },
    { $unset: { wishlist: '' } }
  );

  console.log(
    `[wishlist] merged ${merged} user wishlists; unset field on ${unsetResult.modifiedCount} users`
  );
}

async function migrateProducts() {
  const products = await Product.find({});
  let variantUpdated = 0;
  let slugUpdated = 0;

  for (const product of products) {
    const raw = (product.variants || []).map((v) =>
      typeof v.toObject === 'function' ? v.toObject() : v
    );
    const first = raw[0];
    const isLegacy =
      first &&
      (Array.isArray(first.color) || Array.isArray(first.size)) &&
      !first.sku;

    const needsSkuNormalize =
      isLegacy ||
      (raw.length > 0 && raw.some((v) => !v.sku));

    if (needsSkuNormalize) {
      const { variants, totalStock } = normalizeVariants(
        raw,
        product.stock || 0,
        product._id.toString()
      );
      product.variants = variants;
      product.stock = variants.length > 0 ? totalStock : product.stock;
      variantUpdated += 1;
    } else if (product.variants?.length > 0) {
      product.stock = product.variants.reduce(
        (sum, v) => sum + (Number(v.stock) || 0),
        0
      );
    }

    if (!product.slug) {
      product.slug = await uniqueSlugFor(Product, product.name, product._id);
      slugUpdated += 1;
    }

    if (product.isActive === undefined || product.isActive === null) {
      product.isActive = true;
    }

    // Clear legacy reviews array if present in DB
    if (product.reviews !== undefined) {
      product.set('reviews', undefined);
      product.markModified('reviews');
    }

    await product.save();
  }

  await Product.collection.updateMany({}, { $unset: { reviews: '' } });

  console.log(
    `[products] normalized variants on ${variantUpdated}; slugs on ${slugUpdated}; cleared reviews[]`
  );
}

async function migrateCategories() {
  const categories = await Category.find({});
  let n = 0;
  for (const cat of categories) {
    if (!cat.slug) {
      cat.slug = await uniqueSlugFor(Category, cat.name, cat._id);
      await cat.save();
      n += 1;
    }
  }
  console.log(`[categories] backfilled ${n} slugs`);
}

async function migrateReviewCounts() {
  const stats = await Review.aggregate([
    {
      $group: {
        _id: '$product',
        averageRating: { $avg: '$rating' },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  for (const row of stats) {
    await Product.findByIdAndUpdate(row._id, {
      averageRating: Math.round(row.averageRating * 10) / 10,
      reviewCount: row.reviewCount,
    });
  }

  // Zero out products with no reviews
  const reviewedIds = stats.map((s) => s._id);
  await Product.updateMany(
    { _id: { $nin: reviewedIds } },
    { $set: { averageRating: 0, reviewCount: 0 } }
  );

  console.log(`[reviews] synced reviewCount/averageRating for ${stats.length} products`);
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is required');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Running migrateSchemasToV2...');

  await migrateWishlists();
  await migrateCategories();
  await migrateProducts();
  await migrateReviewCounts();

  console.log('Migration complete.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
