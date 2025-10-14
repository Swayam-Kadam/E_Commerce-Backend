const cloudinary = require('cloudinary').v2;
require('dotenv').config();
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer Storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'ecommerce-products',
    format: async (req, file) => ('png','jpg'), // or jpg, webp, etc.
    public_id: (req, file) => {
      // Generate unique filename
      const timestamp = Date.now();
      return `product-${timestamp}`;
    },
  },
});

module.exports = { cloudinary, storage };