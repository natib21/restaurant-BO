/**
 * @file utils/globalErrorHandler.js
 * @description Express global error handler middleware.
 * Handles all operational and programming errors uniformly.
 */

const AppError = require('./appError');

const handleCastError = err => new AppError(`Invalid ${err.path}: ${err.value}.`, 400);

const handleDuplicateKeyError = err => {
  let message = 'Duplicate field value. Please use another value.';
  try {
    if (err.keyValue) {
      const field = Object.keys(err.keyValue)[0];
      const value = err.keyValue[field];
      message = `${field.charAt(0).toUpperCase() + field.slice(1)} "${value}" already exists.`;
    } else if (err.errmsg) {
      const match =
        err.errmsg.match(/dup key: {[^}]*"([^"]+)"[^}]*}/) ||
        err.errmsg.match(/"([^"]+)".*dup key/);
      if (match?.[1]) message = `Duplicate value: "${match[1]}". Please use another value.`;
    } else if (err.message?.includes('dup key')) {
      const match = err.message.match(/"([^"]+)"/);
      if (match) message = `Duplicate value: "${match[1]}".`;
    }
  } catch {
    // fall through to generic message
  }
  return new AppError(message, 400);
};

const handleValidationError = err => {
  const errors = Object.values(err.errors).map(el => el.message);
  return new AppError(`Invalid input: ${errors.join(', ')}`, 400);
};

const handleJWTError        = () => new AppError('Invalid token. Please log in again.', 401);
const handleJWTExpiredError = () => new AppError('Your session has expired. Please log in again.', 401);

const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    message: err.message,
    errors: [{ status: err.status, code: err.code, stack: err.stack, fullError: err }],
  });
};

const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    const errors = err.errors ? [{ message: err.message, details: err.errors }] : [];
    res.sendError(err.message, err.statusCode, errors);
  } else {
    console.error('UNHANDLED ERROR 🔥', err);
    res.sendError('Something went wrong. Please try again later.', 500, []);
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status     = err.status     || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err, name: err.name, code: err.code };
    if (error.name === 'CastError')        error = handleCastError(error);
    if (error.code === 11000)              error = handleDuplicateKeyError(error);
    if (error.name === 'ValidationError')  error = handleValidationError(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
    sendErrorProd(error, res);
  }
};
