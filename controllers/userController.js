const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

exports.getAllUser = catchAsync(async (req, res, next) => {
  const users = await User.find();

  // if (!allUsers) return next(new AppError(''));

  res.status(200).json({
    status: 'success',
    message: users.length,
    data: users,
  });
});

exports.updateMe = catchAsync(async (req, res, next) => {
  //  no password update
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'This is Not for Password update pls use /changePassword route',
        400
      )
    );
  }

  // update Document
  const filterdBody = filterObj(req.body, 'firstName', 'lastName', 'phone');

  const updatedUser = await User.findByIdAndUpdate(req.user.id, filterdBody, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    status: 'success',
    data: {
      updatedUser,
    },
  });
});

exports.deleteMe = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user.id, { isActive: false });

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.createNewUser = (req, res) => {
  res.status(500).json({
    status: 'Error',
    message: 'This route is not defined',
  });
};
exports.getUser = (req, res) => {
  res.status(500).json({
    status: 'Error',
    message: 'This route is not defined',
  });
};
exports.updateUser = catchAsync(async (req, res, next) => {
  console.log(req.body, req.params.id);

  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'This is Not for Password update pls use /changePassword route',
        400
      )
    );
  }

  // update Document
  const filterdBody = filterObj(
    req.body,
    'firstName',
    'lastName',
    'email',
    'phone',
    'role'
  );

  console.log(filterdBody);

  const updatedUser = await User.findByIdAndUpdate(req.params.id, filterdBody, {
    new: true,
    runValidators: true,
  });
  if (!updatedUser) {
    return next(new AppError('User Not Update', 404));
  }
  res.status(200).json({
    status: 'success',
    data: {
      updatedUser,
    },
  });
});

exports.deleteUser = catchAsync(async (req, res) => {
  console.log(req);
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: false });
  if (!user) {
    return next(new AppError('No User Found with that ID', 404));
  }
  res.status(204).json({
    status: 'success',
    menu: null,
  });
});
