const catchAsync = require('../../../utils/catchAsync');
const AppError = require('../../common/errors');
const { AuthService } = require('./auth.service');
const sendEmail = require('../../../utils/email');

function sendTokenResponse(user, statusCode, res) {
  const token = AuthService.signToken(user);
  const env = process.env.NODE_ENV || 'development';

  const cookieOptions = {
    expires: new Date(
      Date.now() + (Number(process.env.JWT_COOKIE_EXPIRES_IN) || 7) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    sameSite: env === 'production' ? 'none' : 'lax',
    path: '/',
  };
  if (env === 'production') cookieOptions.secure = true;

  res.cookie('jwt', token, cookieOptions);

  res.status(statusCode).json({
    status: 'success',
    token,
    data: { user: AuthService.buildAuthResponse(user) },
  });
}

exports.signup = catchAsync(async (req, res, next) => {
  console.log('SignUp req body:', req.body);
  const user = await AuthService.signup(req.body);
  sendTokenResponse(user, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  console.log('Login req body:', req.body);

  const user = await AuthService.login(req.body.email, req.body.password);
  sendTokenResponse(user, 200, res);
});

exports.logout = (req, res) => {
  res.cookie('jwt', '', {
    expires: new Date(0),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  });
  res.status(200).json({ status: 'success', message: 'Logged out successfully' });
};

exports.changePassword = catchAsync(async (req, res, next) => {
  const { password, newPassword, confirmNewPassword } = req.body;
  const user = await AuthService.changePassword(
    req.user.id,
    password,
    newPassword,
    confirmNewPassword
  );
  sendTokenResponse(user, 200, res);
});

exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { user, resetToken } = await AuthService.forgotPassword(req.body.email);
  const { loadEnv } = require('../../config/env');
  const env = loadEnv();
  const frontendBase = (env.FRONTEND_URL || env.APP_URL || '').replace(/\/$/, '');
  const resetURL = frontendBase
    ? `${frontendBase}/reset-password/${resetToken}`
    : `${req.protocol}://${req.get('host')}/api/v1/auth/reset-password/${resetToken}`;
  const message = `Reset your password using this link: ${resetURL}\n\nOr send a PATCH request to /api/v1/auth/reset-password/${resetToken} with password and passwordConfirm.`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Your password reset token (valid for 10 min)',
      message,
    });
    res.status(200).json({ status: 'success', message: 'Token sent to email' });
  } catch {
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new AppError('There was an error sending the email. Try again later.', 500));
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  const user = await AuthService.resetPassword(
    req.params.token,
    req.body.password,
    req.body.passwordConfirm
  );
  sendTokenResponse(user, 200, res);
});
