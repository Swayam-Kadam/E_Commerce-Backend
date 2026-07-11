const connecToMongo = require('./config/db')
const express = require('express')
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

connecToMongo();
const app = express()
const port = 4000

app.use(express.json())
app.use(express.urlencoded({ extended: true })); // For form data
app.use(cors());
app.use(cookieParser());


// Mount routers
app.use('/api/v1/auth',require('./routes/auth'));
app.use('/api/v1/product',require('./routes/product'));
app.use('/api/v1/review',require('./routes/review'));
app.use('/api/v1/whishlist',require('./routes/whishlist'));
app.use('/api/v1/cart',require('./routes/cart'));
app.use('/api/v1/payment',require('./routes/payment'));
app.use('/api/v1/order',require('./routes/order'));
app.use('/api/v1/settings',require('./routes/settings'));
app.use('/api/v1/dashboard',require('./routes/dashboard'));


app.listen(port,()=>{
    console.log(`App Listening at http://localhost:${port}`)
})

