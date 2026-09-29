const connecToMongo = require('./config/db')
const express = require('express')
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const errorHandler = require('./middleware/errorMiddleware');
const { getRedis } = require('./config/redis');
const { apiLimiter } = require('./middleware/rateLimiter');

connecToMongo();
const app = express()
const port = 4000

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

app.use(express.json())
app.use(express.urlencoded({ extended: true })); // For form data
app.use(cors());
app.use(cookieParser());
getRedis().ready.catch(err => {
    console.error('Redis connection failed:', err);
});

// Global API rate limit (auth routes also use a stricter authLimiter)
// app.use('/api', apiLimiter);

// Mount routers
app.use('/api/v1/auth',require('./routes/auth'));
app.use('/api/v1/product',require('./routes/product'));
app.use('/api/v1/category',require('./routes/category'));
app.use('/api/v1/review',require('./routes/review'));
app.use('/api/v1/whishlist',require('./routes/whishlist'));
app.use('/api/v1/cart',require('./routes/cart'));
app.use('/api/v1/payment',require('./routes/payment'));
app.use('/api/v1/order',require('./routes/order'));
app.use('/api/v1/settings',require('./routes/settings'));
app.use('/api/v1/dashboard',require('./routes/dashboard'));
app.use('/api/v1/coupon',require('./routes/coupon'));

app.use(errorHandler);

app.listen(port,()=>{
    console.log(`App Listening at http://localhost:${port}`)
})
