const fs = require('fs');

const menu = JSON.parse(fs.readFileSync(`${__dirname}/../dev-doc/menu.json`));

exports.checkId = (req, res, next, val) => {
  if (req.params.id * 1 > menu.length) {
    console.log(`Menu Id Is:- ${val}`);
    return res.status(404).json({
      status: 'Failed',
      message: 'Invalid Id',
    });
  }
  next();
};

exports.checkBody = (req, res, next) => {
  const { name, price } = req.body;

  if (!name || !price) {
    return res
      .status(400)
      .json({ status: 'Failed', message: 'pls Enter name and price' });
  }
  next();
};

exports.getAllMenu = (req, res) => {
  res.status(200).json({
    status: 'success',
    requestedAt: req.requestTime,
    result: menu.length,
    menu: menu,
  });
};

exports.getMenu = (req, res) => {
  const id = req.params.id * 1;
  const menuItem = menu.find((item) => item.id === id);

  res.status(200).json({ status: 'success', menuItem });
};

exports.createNewMenu = (req, res) => {};

exports.updateMenu = (req, res) => {
  const id = req.params.id * 1;
  const menuItem = menu.find((item) => item.id === id);

  res
    .status(200)
    .json({ status: 'success', data: { tour: '<Update tour here ... />' } });
};
exports.deleteMenu = (req, res) => {
  const id = req.params.id * 1;
  const menuItem = menu.find((item) => item.id === id);

  res.status(204).json({
    status: 'success',
    menu: null,
  });
};
