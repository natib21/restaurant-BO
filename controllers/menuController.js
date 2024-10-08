const Menu = require('../models/menuModel');

exports.getAllBeverage = (req, res, next) => {
  req.query.category = 'Beverage';
  next();
};

exports.getAllMenu = async (req, res) => {
  try {
    const queryObj = { ...req.query };

    const excludedFields = ['page', 'sort', 'limit', 'fields'];

    excludedFields.forEach((el) => delete queryObj[el]);

    let queryStr = JSON.stringify(queryObj);

    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);

    let query = Menu.find(JSON.parse(queryStr));

    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      console.log(sortBy);
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
    }

    if (req.query.fields) {
      const fields = req.query.fields.split(',').join(' ');
      query = query.select(fields);
    } else {
      query = query.select('-__v');
    }

    const page = req.query.page * 1 || 1;
    const limit = req.query.limit * 1 || 100;
    const skip = (page - 1) * limit;

    query = query.skip(skip).limit(limit);

    if (req.query.page) {
      const numTours = await Menu.countDocuments();
      if (skip >= numTours) throw new Error('This page does not exist');
    }

    const allMenu = await query;

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
