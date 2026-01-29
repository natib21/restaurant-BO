const AppError = require('../utils/appError');

const handleCastErrorDb = err => {
  const message = `invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

/* const handleDuplicationErrorDb = err => {
  const errmMsg = err.errorResponse.errmsg;
  const regex = /dup key: { name: "(.*?)" }/;

  const match = errmMsg.match(regex);

  const duplicateName = match[0];
  const message = `Duplicate field Values: ${duplicateName} `;
  return new AppError(message, 400);
}; */
const handleDuplicationErrorDb = err => {
  let message = 'Duplicate field value. Please use another value.';

  try {
    // Case 1: Modern MongoDB driver (err.keyValue exists)
    if (err.keyValue) {
      const field = Object.keys(err.keyValue)[0];
      const value = err.keyValue[field];
      message = `${field.charAt(0).toUpperCase() + field.slice(1)} "${value}" already exists.`;
    }
    // Case 2: Old format or Atlas (use errmsg)
    else if (err.errmsg) {
      const match =
        err.errmsg.match(/dup key: {[^}]*"([^"]+)"[^}]*}/) ||
        err.errmsg.match(/"([^"]+)".*dup key/);
      if (match && match[1]) {
        message = `Duplicate value: "${match[1]}". Please use another value.`;
      }
    }
    // Case 3: Fallback from err.message
    else if (err.message && err.message.includes('dup key')) {
      const match = err.message.match(/"([^"]+)"/);
      if (match) message = `Duplicate value: "${match[1]}".`;
    }
  } catch (e) {
    // If anything fails, fall back to generic message
    console.warn('Failed to parse duplicate error:', e);
  }

  return new AppError(message, 400);
};

const handleValidationError = err => {
  const errors = Object.values(err.errors).map(el => el.message);

  const message = `Invalid input Data ${errors.join(', ')}`;
  return new AppError(message, 400);
};

const handleJWTError = () => new AppError('Invalid token, please log in again', 401);

const handleJWTExpireError = () => new AppError('Your Token has expired', 401);

const sendErrorForDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    console.error('ERROR 🔥', err);
    res.status(500).json({
      status: 'Error',
      message: 'Something went Very Wrong !',
    });
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'err';

  if (process.env.NODE_ENV === 'development') {
    sendErrorForDev(err, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err, name: err.name, code: err.code };

    if (error.name === 'CastError') error = handleCastErrorDb(error);
    if (error.code === 11000) error = handleDuplicationErrorDb(error);
    if (error.name === 'ValidationError') error = handleValidationError(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpireError();
    sendErrorProd(error, res);
  }
};
