const AppError = require('../../../../utils/appError');

const validate = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (err) {
    // If it's a Zod error, format it
    if (err.errors) {
      const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return next(new AppError(`Validation Error: ${messages}`, 400));
    }
    next(err);
  }
};

module.exports = { validate };
