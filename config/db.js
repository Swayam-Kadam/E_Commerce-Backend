const mongoose = require('mongoose')
require('dotenv').config();
const mongoURI = process.env.MONGO_URI

const connecToMongo = () =>{
    mongoose.connect(mongoURI,{});
    console.log("Connection Successfull");
};

module.exports = connecToMongo