process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRE = '15m';
process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET = 'test-razorpay-secret';

const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

jest.mock('razorpay', () => {
  const orders = {
    create: jest.fn(),
    fetch: jest.fn(),
  };
  const Razorpay = jest.fn().mockImplementation(() => ({ orders }));
  Razorpay.orders = orders;
  return Razorpay;
});

const Razorpay = require('razorpay');
const app = require('../app');
const User = require('../models/UserSchema');
const Product = require('../models/ProductSchema');
const Category = require('../models/CategorySchema');
const Cart = require('../models/CartSchema');
const Order = require('../models/OrderSchema');
const { hashRefreshToken } = require('../utils/refreshToken');

const address = {
  street: '1 Main Street',
  city: 'Pune',
  state: 'MH',
  zipCode: '411001',
  country: 'India',
};

let replSet;

function signPayment(orderId, paymentId) {
  return crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

async function registerUser(username, email) {
  const response = await request(app).post('/api/v1/auth/register').send({
    username,
    email,
    password: 'password123',
  });
  return response;
}

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(replSet.getUri());
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.createIndexes())
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) {
    await replSet.stop();
  }
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
  Razorpay.orders.fetch.mockImplementation(async (id) => ({
    id,
    amount: 10000,
    currency: 'INR',
  }));
});

describe('health and auth', () => {
  test('health endpoint returns ok', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  test('register rejects passwords shorter than 8 characters', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      username: 'shortpw',
      email: 'short@example.com',
      password: 'short',
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/at least 8 characters/);
  });

  test('register stores a hash of the refresh token and login can rotate it', async () => {
    const registered = await registerUser('alice', 'alice@example.com');
    expect(registered.status).toBe(201);

    const rawRefresh = registered.body.tokens.refreshToken;
    const stored = await User.findById(registered.body.user.id).select('+refreshToken');
    expect(stored.refreshToken).toBe(hashRefreshToken(rawRefresh));
    expect(stored.refreshToken).not.toBe(rawRefresh);

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'alice@example.com',
      password: 'password123',
    });
    expect(login.status).toBe(200);

    const refreshed = await request(app).post('/api/v1/auth/refresh-token').send({
      refreshToken: login.body.tokens.refreshToken,
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.tokens.accessToken).toBeTruthy();

    const reused = await request(app).post('/api/v1/auth/refresh-token').send({
      refreshToken: login.body.tokens.refreshToken,
    });
    expect(reused.status).toBe(401);
  });

  test('legacy plaintext refresh tokens can still be rotated', async () => {
    const bcrypt = require('bcryptjs');
    const legacyToken = 'legacy-refresh-token';
    await User.create({
      username: 'legacy',
      email: 'legacy@example.com',
      password: await bcrypt.hash('password123', 10),
      role: 'user',
      refreshToken: legacyToken,
      refreshTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
    });

    const refreshed = await request(app).post('/api/v1/auth/refresh-token').send({
      refreshToken: legacyToken,
    });

    expect(refreshed.status).toBe(200);
    const stored = await User.findOne({ email: 'legacy@example.com' }).select('+refreshToken');
    expect(stored.refreshToken).toBe(hashRefreshToken(refreshed.body.tokens.refreshToken));
  });

  test('change password and delete account use the stored password hash', async () => {
    const registered = await registerUser('bob', 'bob@example.com');
    const token = registered.body.tokens.accessToken;

    const tooShort = await request(app)
      .put('/api/v1/settings/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'password123',
        newPassword: 'short',
        confirmPassword: 'short',
      });
    expect(tooShort.status).toBe(400);
    expect(tooShort.body.message).toMatch(/at least 8 characters/);

    const changed = await request(app)
      .put('/api/v1/settings/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'password123',
        newPassword: 'newpassword1',
        confirmPassword: 'newpassword1',
      });
    expect(changed.status).toBe(200);

    const oldLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'bob@example.com',
      password: 'password123',
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'bob@example.com',
      password: 'newpassword1',
    });
    expect(newLogin.status).toBe(200);

    const deleted = await request(app)
      .delete('/api/v1/settings/account')
      .set('Authorization', `Bearer ${newLogin.body.tokens.accessToken}`)
      .send({ password: 'newpassword1' });
    expect(deleted.status).toBe(200);
    expect(await User.findOne({ email: 'bob@example.com' })).toBeNull();
  });
});

describe('payment checkout', () => {
  async function seedBuyer({ username, email, stock, paymentId, orderId }) {
    const registered = await registerUser(username, email);
    const category = await Category.create({ name: `${username}-cat`, slug: `${username}-cat` });
    const product = await Product.create({
      name: `${username} shirt`,
      description: 'Test product',
      price: 100,
      category: category._id,
      stock,
      isActive: true,
    });
    await Cart.create({
      user: registered.body.user.id,
      items: [{ product: product._id, quantity: 1, price: 100 }],
      total: 100,
    });

    return {
      token: registered.body.tokens.accessToken,
      userId: registered.body.user.id,
      product,
      body: {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signPayment(orderId, paymentId),
        shippingAddress: address,
      },
    };
  }

  function verify(token, body) {
    return request(app)
      .post('/api/v1/payment/api/verify-payment')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  test('only one of two concurrent checkouts gets the last unit', async () => {
    const category = await Category.create({ name: 'shared-cat', slug: 'shared-cat' });
    const product = await Product.create({
      name: 'Last unit',
      description: 'Only one left',
      price: 100,
      category: category._id,
      stock: 1,
      isActive: true,
    });

    const first = await registerUser('buyer1', 'buyer1@example.com');
    const second = await registerUser('buyer2', 'buyer2@example.com');

    await Cart.create({
      user: first.body.user.id,
      items: [{ product: product._id, quantity: 1, price: 100 }],
      total: 100,
    });
    await Cart.create({
      user: second.body.user.id,
      items: [{ product: product._id, quantity: 1, price: 100 }],
      total: 100,
    });

    const bodyFor = (paymentId, orderId) => ({
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signPayment(orderId, paymentId),
      shippingAddress: address,
    });

    const [left, right] = await Promise.all([
      verify(first.body.tokens.accessToken, bodyFor('pay_a', 'order_a')),
      verify(second.body.tokens.accessToken, bodyFor('pay_b', 'order_b')),
    ]);

    const statuses = [left.status, right.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const failed = left.status === 409 ? left : right;
    expect(failed.body.code).toBe('OUT_OF_STOCK_AFTER_PAY');

    const updated = await Product.findById(product._id);
    expect(updated.stock).toBe(0);

    const orders = await Order.find({});
    expect(orders).toHaveLength(2);
    expect(orders.filter((order) => order.orderStatus === 'processing')).toHaveLength(1);
    expect(
      orders.filter(
        (order) => order.orderStatus === 'cancelled' && order.cancelReason === 'OUT_OF_STOCK'
      )
    ).toHaveLength(1);
  });

  test('verifying the same payment twice does not decrement stock again', async () => {
    const buyer = await seedBuyer({
      username: 'idem',
      email: 'idem@example.com',
      stock: 5,
      paymentId: 'pay_same',
      orderId: 'order_same',
    });

    const first = await verify(buyer.token, buyer.body);
    const second = await verify(buyer.token, buyer.body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.message).toMatch(/already verified/i);

    const updated = await Product.findById(buyer.product._id);
    expect(updated.stock).toBe(4);
    expect(await Order.countDocuments({ razorpayPaymentId: 'pay_same' })).toBe(1);

    const cart = await Cart.findOne({ user: buyer.userId });
    expect(cart.items).toHaveLength(0);
  });
});
