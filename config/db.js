const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connecToMongo = async () => {
  const mongoURI = process.env.MONGO_URI;

  if (!mongoURI) {
    throw new Error('MONGO_URI is not set');
  }

  try {
    const conn = await mongoose.connect(mongoURI);
    logger.info('Database connection successful');
    return conn;
  } catch (error) {
    logger.error(`Database connection failed: ${error.message}`);
    throw error;
  }
};

module.exports = connecToMongo;
