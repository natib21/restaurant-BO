const Menu = require('../models/menuModel');

exports.getAllMenu = async (req, res) => {
  try {
    const allMenu = await Menu.find();

    res.status(200).json({
      status: 'success',
      requestedAt: req.requestTime,
      result: allMenu.length,
      menu: allMenu,
    });
  } catch (err) {
    res.status(404).json({
      status: 'Fail',
      message: 'it is empty',
    });
  }
};

exports.getMenu = async (req, res) => {
  try {
    const menu = await Menu.findById(req.params.id);
    res.status(200).json({
      status: 'success',
      menu,
    });
  } catch (err) {
    res.status(404).json({
      status: 'fail',
      message: 'Not Found',
    });
  }
};

exports.createNewMenu = async (req, res) => {
  try {
    const newMenu = await Menu.create(req.body);
    res.status(201).json({
      status: 'success',
      menu: newMenu,
    });
  } catch (err) {
    res.status(400).json({
      status: 'Fail',
      message: err,
    });
  }
};

exports.updateMenu = async (req, res) => {
  try {
    const menu = await Menu.findByIdAndUpdate(req.params.id, req.body, {
      runValidators: true,
      new: true,
    });
    res.status(200).json({
      status: 'success',
      menu,
    });
  } catch (err) {
    res.status(400).json({
      status: 'Fail',
      message: err,
    });
  }
};
exports.deleteMenu = async (req, res) => {
  try {
    await Menu.findOneAndDelete(req.params.id);
    res.status(204).json({
      status: 'success',
      menu: null,
    });
  } catch (err) {
    res.status(400).json({
      status: 'Fail',
      message: err,
    });
  }
};
