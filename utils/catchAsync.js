module.exports = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(err => {
      console.error('Async controller error:', err);
      next(err);
    });
  };
};
