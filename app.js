require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const errorHandler = require('./middleware/errorMiddleware');
const { apiLimiter } = require('./middleware/rateLimiter');

const app = express();

function allowedOrigins() {
  const configured = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    return configured;
  }

  if (process.env.NODE_ENV === 'production') {
    return [];
  }

  return [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ];
}

const origins = allowedOrigins();

app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use((req, _res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body);
  if (req.params) mongoSanitize.sanitize(req.params);
  if (req.query) mongoSanitize.sanitize(req.query);
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', apiLimiter);

app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/product', require('./routes/product'));
app.use('/api/v1/category', require('./routes/category'));
app.use('/api/v1/review', require('./routes/review'));
app.use('/api/v1/whishlist', require('./routes/whishlist'));
app.use('/api/v1/cart', require('./routes/cart'));
app.use('/api/v1/payment', require('./routes/payment'));
app.use('/api/v1/order', require('./routes/order'));
app.use('/api/v1/settings', require('./routes/settings'));
app.use('/api/v1/dashboard', require('./routes/dashboard'));
app.use('/api/v1/coupon', require('./routes/coupon'));

app.use(errorHandler);

module.exports = app;
