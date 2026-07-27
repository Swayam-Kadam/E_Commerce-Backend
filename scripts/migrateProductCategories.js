/**
 * One-time migration: convert legacy string product.category values
 * into Category documents + ObjectId refs (matches ProductSchema).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/ProductSchema');
const Category = require('../models/CategorySchema');

const titleCase = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));

(async () => {
  const uri =
    process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE;
  if (!uri) {
    console.error('Missing MongoDB connection string in env');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const products = await Product.collection.find({}).toArray();
  const unique = [
    ...new Set(
      products
        .map((p) => p.category)
        .filter((c) => c != null && c !== '')
        .map((c) => String(c))
    ),
  ];

  console.log('Unique raw categories:', unique);

  const rawToId = {};

  for (const raw of unique) {
    if (isObjectId(raw)) {
      const existing = await Category.findById(raw);
      if (existing) {
        rawToId[raw] = existing._id;
        continue;
      }
    }

    const name = titleCase(raw);
    let cat = await Category.findOne({
      name: { $regex: `^${name}$`, $options: 'i' },
    });
    if (!cat) {
      cat = await Category.create({
        name,
        description: `${name} products`,
      });
      console.log('Created category:', name, cat._id.toString());
    } else {
      console.log('Found category:', cat.name, cat._id.toString());
    }
    rawToId[raw] = cat._id;
  }

  let updated = 0;
  for (const p of products) {
    if (p.category == null || p.category === '') continue;
    const raw = String(p.category);
    const newId = rawToId[raw];
    if (!newId) continue;
    if (isObjectId(raw) && newId.toString() === raw) continue;

    await Product.collection.updateOne(
      { _id: p._id },
      { $set: { category: newId } }
    );
    updated += 1;
  }

  const cats = await Category.find({}).lean();
  console.log('Updated products:', updated);
  console.log(
    'Categories now:',
    cats.map((c) => c.name)
  );

  const check = await Product.find({})
    .populate('category', 'name')
    .limit(5)
    .lean();
  console.log(
    'Sample after migrate:',
    check.map((p) => ({
      name: p.name,
      category: p.category?.name || p.category,
    }))
  );

  await mongoose.disconnect();
  console.log('Migration complete');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
