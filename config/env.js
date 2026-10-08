const REQUIRED_ENV = [
  'MONGO_URI',
  'JWT_SECRET',
  'REDIS_URL',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);

  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
    missing.push('CORS_ORIGIN');
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

module.exports = validateEnv;
