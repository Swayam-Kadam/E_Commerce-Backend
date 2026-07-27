const mongoose = require('mongoose')
require('dotenv').config();
const mongoURI = process.env.MONGO_URI

const connecToMongo = async () => {
  try {
    const conn = await mongoose.connect(mongoURI, {});
    console.log(`Database Connection Successful: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Database Connection Failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connecToMongo