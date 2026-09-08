const { validateBody } = require('../../common/validators/validate');

const signupSchema = {
  firstName: { required: true, type: 'string', minLength: 1 },
  lastName: { required: true, type: 'string', minLength: 1 },
  phone: { required: true, type: 'string', minLength: 10 },
  email: { required: true, type: 'string', email: true },
  business: { required: true, type: 'string', minLength: 2 },
  password: { required: true, type: 'string', minLength: 8 },
  passwordConfirm: { required: true, type: 'string', minLength: 8 },
  _match: ['password', 'passwordConfirm'],
};

const loginSchema = {
  email: { required: true, type: 'string', email: true },
  password: { required: true, type: 'string', minLength: 1 },
};

const changePasswordSchema = {
  password: { required: true, type: 'string' },
  newPassword: { required: true, type: 'string', minLength: 8 },
  confirmNewPassword: { required: true, type: 'string', minLength: 8 },
  _match: ['newPassword', 'confirmNewPassword'],
};

const forgotPasswordSchema = {
  email: { required: true, type: 'string', email: true },
};

const resetPasswordSchema = {
  password: { required: true, type: 'string', minLength: 8 },
  passwordConfirm: { required: true, type: 'string', minLength: 8 },
  _match: ['password', 'passwordConfirm'],
};

module.exports = {
  validateSignup: validateBody(signupSchema),
  validateLogin: validateBody(loginSchema),
  validateChangePassword: validateBody(changePasswordSchema),
  validateForgotPassword: validateBody(forgotPasswordSchema),
  validateResetPassword: validateBody(resetPasswordSchema),
};
