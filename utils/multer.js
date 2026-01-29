// utils/multer.js
const multer = require('multer');
const AppError = require('./appError');

const memoryStorage = multer.memoryStorage();

const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new AppError('Only image files are allowed', 400), false);
  }
};

exports.uploadImage = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});
