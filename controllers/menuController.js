const multer = require('multer');
const Menu = require('../models/menuModel');
const Merchant = require('../models/merchantModel')
const ApiFeatures = require('../utils/apiFeatures');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const sharp = require('sharp');

/* const multerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/img/menu');
  },
  filename: function (req, file, cb) {
    const ext = file.mimetype.split('/')[1];
    cb(null, `menu-${req.body.name}-${Date.now()}.${ext}`);
  },
});
 */

const multerStorage = multer.memoryStorage();
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not An Image! Pls upload only images.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});
exports.uploadMenuPhoto = upload.single('image');

exports.resizeMenuPhoto = (req, res, next) => {
  if (!req.file) return next();

  req.file.filename = `menu-${req.body.name}-${Date.now()}.jpeg`;

  sharp(req.file.buffer)
    .resize(500, 500)
    .toFormat('jpeg')
    .jpeg({ quality: 90 })
    .toFile(`uploads/img/menu/${req.file.filename}`);

  next();
};

exports.getAllBeverage = (req, res, next) => {
  req.query.category = 'Beverage';
  next();
};

exports.getAppetizers = (req, res, next) => {
  req.query.category = 'Appetizers';
  next();
};

exports.getSpecials = (req, res, next) => {
  req.query.isSpecial = 'true';
  next();
};

exports.searchMenu = async (req, res, next) => {
  const query = req.query.query;
  if (!query) {
    return next();
  }
  const searchRegex = new RegExp(query, 'i');
  req.query = {
    $or: [{ name: searchRegex }, { description: searchRegex }],
  };

  next();
};

exports.getPublicMenu = catchAsync(async (req, res, next) => {

    const merchantId = req.params.id;
  
    const merchant = await Merchant.findById(merchantId).select('status isActive');
  
    if (!merchant) {
        return next(new AppError('No Merchant found with that ID.', 404));
    }

  /*   if (merchant.status !== 'approved' || merchant.isActive !== true) {
        return next(new AppError('This restaurant is currently unavailable for ordering.', 403));
    } */
    if (merchant.status !== 'pending' || merchant.isActive !== true) {
        return next(new AppError('This restaurant is currently unavailable for ordering.', 403));
    }
    
    // 2. Fetch all menu items belonging to the Merchant
    // Note: You might need a way to filter out items marked as 'isDeleted' or 'out of stock' here.
    const allMenu = await Menu.find({ 
        restaurant: merchantId,
        // Assuming your menu items have a field to indicate they are visible/in stock
        // e.g., isAvailable: true 
    })
    .select('-__v -restaurant -isDeleted'); // Exclude sensitive/internal fields
     console.log(allMenu)
    // 3. Construct Image URLs (Essential for the client app)
    const menuWithImages = allMenu.map((menu) => ({
        ...menu.toObject(),
        // Re-use your existing logic for image URL construction
        image: menu.image ? `${req.protocol}://${req.get('host')}/img/menu/${menu.image}` : null, 
    }));

    res.status(200).json({
        status: 'success',
        result: allMenu.length,
        menu: menuWithImages,
    });
});







exports.getAllMenu = catchAsync(async (req, res,next) => {
  console.log(req.user)
  if (!req.user?.restaurant) {
    return next(new AppError('You are not assigned to a restaurant', 400));
  }
  const features = new ApiFeatures(Menu.find({ restaurant: req.user.restaurant._id }), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const allMenu = await features.query;

  const menuWithImages = allMenu.map((menu) => ({
    ...menu.toObject(),
    image: `${req.protocol}://${req.get('host')}/img/menu/${menu.image}`, // Construct URL
  }));

  res.status(200).json({
    status: 'success',
    requestedAt: req.requestTime,
    result: allMenu.length,
    menu: menuWithImages,
  });
});

exports.getMenu = catchAsync(async (req, res, next) => {
  const menu = await Menu.findOne({
  _id: req.params.id,
  restaurant: req.user.restaurant._id, // <-- restrict to restaurant
});

  if (!menu) {
    return next(new AppError('No Menu item Found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    menu,
  });
});

exports.createNewMenu = catchAsync(async (req, res, next) => {
  if (!req.user.restaurant) {
    return next(new AppError('You are not assigned to a restaurant', 400));
  }
  if (req.file) {
    req.body.image = req.file.filename;
  }
  console.log(req.body);
  const newMenu = await Menu.create({
    ...req.body, 
    restaurant: req.user.restaurant._id,
    image: req.file ? req.file.filename : undefined,
  });
  res.status(201).json({
    status: 'success',
    menu: newMenu,
  });
});

exports.updateMenu = catchAsync(async (req, res, next) => {
  console.log(req.body);
  if (!req.user.restaurant) {
    return next(new AppError('You are not assigned to a restaurant', 400));
  }
  if (req.file) {
    req.body.image = req.file.filename; // Save filename to the 'photo' field
  }
  const menu = await Menu.findOneAndUpdate({ _id: req.params.id, restaurant: req.user.restaurant._id }, req.body, {
    runValidators: true,
    new: true,
  });
  if (!menu) {
    return next(new AppError('No Menu item Found with that ID', 404));
  }
  res.status(200).json({
    status: 'success',
    menu,
  });
});

exports.deleteMenu = catchAsync(async (req, res, next) => {
  if (!req.user.restaurant) {
    return next(new AppError('You are not assigned to a restaurant', 400));
  }
  const menu = await Menu.findOneAndUpdate({_id: req.params.id,
  restaurant: req.user.restaurant._id},{isDeleted:true},{new:true});
  if (!menu) {
    return next(new AppError('No Menu item Found with that ID', 404));
  }
  res.status(204).json({
    status: 'success',
    menu: null,
  });
});
