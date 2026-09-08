const { validateBody } = require('../src/common/validators/validate');
const AppError = require('../utils/appError');

describe('validateBody', () => {
  const validateLogin = validateBody({
    email: { required: true, type: 'string', email: true },
    password: { required: true, type: 'string', minLength: 1 },
  });

  it('passes valid login body', done => {
    const req = { body: { email: 'test@example.com', password: 'secret' } };
    validateLogin(req, {}, err => {
      expect(err).toBeUndefined();
      done();
    });
  });

  it('rejects missing email', done => {
    const req = { body: { password: 'secret' } };
    validateLogin(req, {}, err => {
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(400);
      done();
    });
  });
});
