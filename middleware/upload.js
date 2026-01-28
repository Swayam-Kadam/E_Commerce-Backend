// const multer = require('multer');
// const { storage } = require('../config/cloudinary');

// const upload = multer({
//   storage: storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024, // 5MB limit
//   },
//   fileFilter: (req, file, cb) => {
//     // Check if file is an image
//     if (file.mimetype.startsWith('image/')) {
//       cb(null, true);
//     } else {
//       cb(new Error('Only image files are allowed!'), false);
//     }
//   }
// });

// // Middleware for multiple images with error handling
// const uploadProductImages = (req, res, next) => {
//   upload.array('images', 5)(req, res, function (err) {
//     if (err instanceof multer.MulterError) {
//       // A Multer error occurred when uploading
//       return res.status(400).json({
//         success: false,
//         message: `Upload error: ${err.message}`
//       });
//     } else if (err) {
//       // An unknown error occurred
//       return res.status(400).json({
//         success: false,
//         message: err.message
//       });
//     }
//     // Everything went fine
//     next();
//   });
// };

// module.exports = { uploadProductImages };

const multer = require('multer');
const { storage } = require('../config/cloudinary');

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Middleware for multiple images with error handling
const uploadProductImages = (req, res, next) => {
  upload.array('images', 5)(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`
      });
    } else if (err) {
      // An unknown error occurred
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    // Everything went fine
    next();
  });
};

// Middleware for single avatar image upload
const uploadAvatar = (req, res, next) => {
  upload.single('avatar')(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`
      });
    } else if (err) {
      // An unknown error occurred
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    // Everything went fine
    next();
  });
};

// Middleware for single image upload (generic)
const uploadSingleImage = (fieldName) => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`
        });
      } else if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  };
};

module.exports = { uploadProductImages, uploadAvatar, uploadSingleImage };