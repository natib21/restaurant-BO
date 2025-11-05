const multer = require('multer');
const sharp = require('sharp');
const Merchant = require('../models/merchantModel');
const ApiFeatures = require('../utils/apiFeatures');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

// ------------------- MULTER SETUP -------------------
const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) cb(null, true);
  else cb(new AppError('Not an image! Please upload only images.', 400), false);
};

const upload = multer({
   storage: multerStorage,
   fileFilter: multerFilter,
  
  });

// upload both logo and coverImage
exports.uploadMerchantPhotos = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 },
  { name: 'documents', maxCount: 10 }
]);

// Resize images using sharp
exports.processMerchantMedia = catchAsync(async (req, res, next) => {
  // Process logo
  if (req.files?.logo) {
    req.files.logo[0].filename = `merchant-logo-${Date.now()}-${req.files.logo[0].originalname.split('.').slice(0, -1).join('.')}.jpeg`;
    await sharp(req.files.logo[0].buffer)
      .resize(300, 300)
      .toFormat('jpeg')
      .jpeg({ quality: 90 })
      .toFile(`public/img/merchants/${req.files.logo[0].filename}`);
    req.body.logo = req.files.logo[0].filename;
  }

  // Process cover image
  if (req.files?.coverImage) {
    req.files.coverImage[0].filename = `merchant-cover-${Date.now()}-${req.files.coverImage[0].originalname.split('.').slice(0, -1).join('.')}.jpeg`;
    await sharp(req.files.coverImage[0].buffer)
      .resize(1200, 400)
      .toFormat('jpeg')
      .jpeg({ quality: 90 })
      .toFile(`public/img/merchants/${req.files.coverImage[0].filename}`);
    req.body.coverImage = req.files.coverImage[0].filename;
  }

  // Process documents (store as-is, no resizing)
  if (req.files?.documents) {
    req.body.documents = req.files.documents.map((file, index) => ({
      type: req.body.documentTypes?.[index] || 'unknown',
      url: `/img/merchants/documents/${file.originalname}`,
      name: file.originalname,
      uploadedAt: new Date()
    }));
    
    // Save documents to filesystem
    req.files.documents.forEach(file => {
      require('fs').writeFileSync(
        `public/img/merchants/documents/${file.originalname}`,
        file.buffer
      );
    });
  }

  next();
});

// ------------------- VALIDATION MIDDLEWARE -------------------
const validateMerchantData = (req, res, next) => {
  const requiredFields = ['businessName', 'ownerName', 'phone', 'taxId', 'location'];
  
  for (let field of requiredFields) {
    if (!req.body[field]) {
      return next(new AppError(`Please provide ${field}`, 400));
    }
  }
  
  // Validate coordinates
  if (req.body.location?.coordinates && 
      !Array.isArray(req.body.location.coordinates) || 
      req.body.location.coordinates.length !== 2) {
    return next(new AppError('Location coordinates must be [longitude, latitude]', 400));
  }
  
  next();
};

// ------------------- CRUD -------------------

// Get all merchants (with optional filtering, sorting, pagination)
exports.getAllMerchants = catchAsync(async (req, res) => {
  const features = new ApiFeatures(Merchant.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

 const merchants = await features.query
    .populate('approvedBy', 'firstName lastName email')
    .lean()

  const merchantsWithImages = merchants.map(merchant => ({
    ...merchant,
    logo: merchant.logo 
      ? `${req.protocol}://${req.get('host')}/img/merchants/${merchant.logo}`
      : null,
    coverImage: merchant.coverImage
      ? `${req.protocol}://${req.get('host')}/img/merchants/${merchant.coverImage}`
      : null,
    documentCount: merchant.documents?.length || 0,
    userCount: merchant.users?.length || 0
  }));

  res.status(200).json({
    status: 'success',
    results: merchants.length,
    data: {
      merchants: merchantsWithImages
    }
  });
});

// Get a single merchant
exports.getMerchant = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findById(req.params.id)
    .populate('approvedBy', 'firstName lastName email')
    .populate({
      path: 'users',
      select: 'firstName lastName phone role email',
      populate: { path: 'role', select: 'name context' }
    });

  if (!merchant) {
    return next(new AppError('Merchant not found', 404));
  }

  // Add image URLs
  const merchantWithImages = {
    ...merchant.toObject(),
    logo: merchant.logo 
      ? `${req.protocol}://${req.get('host')}/img/merchants/${merchant.logo}`
      : null,
    coverImage: merchant.coverImage
      ? `${req.protocol}://${req.get('host')}/img/merchants/${merchant.coverImage}`
      : null
  };

  res.status(200).json({
    status: 'success',
    data: { merchant: merchantWithImages }
  });
});

// Create new merchant
exports.createNewMerchant = catchAsync(async (req, res, next) => {
  req.body.status = 'pending';
  req.body.isActive = true;
  req.body.approvedBy = req.user._id; // Backoffice admin
  
  // Validate required fields
  validateMerchantData(req, res, next);

  const existingMerchant = await Merchant.findOne({
    $or: [
      { phone: req.body.phone },
      { taxId: req.body.taxId },
      { businessName: req.body.businessName }
    ]
  });
   if (existingMerchant) {
    return next(new AppError('Merchant already exists with this phone, tax ID, or business name', 400));
  }
  const newMerchant = await Merchant.create(req.body);
const populatedMerchant = await Merchant.findById(newMerchant._id)
    .populate('approvedBy', 'firstName lastName email');
  res.status(201).json({
    status: 'success',
    data:{
      merchant: populatedMerchant,
    }
    
  });
});

// Update merchant
exports.updateMerchant = catchAsync(async (req, res, next) => {
  // Prevent updating certain fields
  const blockedFields = ['phone', 'taxId', 'businessName'];
  blockedFields.forEach(field => {
    if (req.body[field]) {
      return next(new AppError(`Cannot update ${field}`, 400));
    }
  });

  // Handle status change
  if (req.body.status === 'approved') {
    req.body.approvedBy = req.user._id;
  }

  const merchant = await Merchant.findByIdAndUpdate(
    req.params.id,
    req.body,
    { 
      new: true, 
      runValidators: true 
    }
  ).populate('approvedBy', 'firstName lastName email');

  if (!merchant) {
    return next(new AppError('Merchant not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { merchant }
  });
});

// Delete merchant
exports.deleteMerchant = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findByIdAndUpdate(
    req.params.id,
    { 
      status: 'inactive',
      isActive: false 
    },
    { new: true }
  );

  if (!merchant) {
    return next(new AppError('Merchant not found', 404));
  }

  // Deactivate associated users
  await User.updateMany(
    { restaurant: req.params.id },
    { 
      isActive: false,
      role: null // Remove merchant role
    }
  );

  res.status(200).json({
    status: 'success',
    message: 'Merchant deactivated successfully'
  });
});


// 6. APPROVE MERCHANT
exports.approveMerchant = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findByIdAndUpdate(
    req.params.id,
    { 
      status: 'approved',
      approvedBy: req.user._id,
      isActive: true
    },
    { 
      new: true, 
      runValidators: true 
    }
  ).populate('approvedBy', 'firstName lastName email');

  if (!merchant) {
    return next(new AppError('Merchant not found', 404));
  }

  if (merchant.status !== 'pending') {
    return next(new AppError('Only pending merchants can be approved', 400));
  }

  res.status(200).json({
    status: 'success',
    message: 'Merchant approved successfully',
    data: { merchant }
  });
});

// 7. SUSPEND MERCHANT
exports.suspendMerchant = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  
  const merchant = await Merchant.findByIdAndUpdate(
    req.params.id,
    { 
      status: 'suspended',
      isActive: false,
      suspendedReason: reason || 'No reason provided',
      suspendedAt: new Date()
    },
    { new: true }
  ).populate('approvedBy', 'firstName lastName email');

  if (!merchant) {
    return next(new AppError('Merchant not found', 404));
  }

  res.status(200).json({
    status: 'success',
    message: 'Merchant suspended successfully',
    data: { merchant }
  });
});

// 8. ACTIVATE/REACTIVATE MERCHANT
exports.activateMerchant = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findByIdAndUpdate(
    req.params.id,
    { 
      status: 'approved',
      isActive: true,
      suspendedReason: null,
      suspendedAt: null
    },
    { new: true }
  ).populate('approvedBy', 'firstName lastName email');

  if (!merchant) {
    return next(new AppError('Merchant not found', 404));
  }

  res.status(200).json({
    status: 'success',
    message: 'Merchant activated successfully',
    data: { merchant }
  });
});

// 9. GET MERCHANT STATISTICS
exports.getMerchantStats = catchAsync(async (req, res, next) => {
  const stats = await Merchant.aggregate([
    {
      $match: { _id: mongoose.Types.ObjectId(req.params.id) }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: 'restaurant',
        as: 'users',
        pipeline: [{ $match: { role: { $ne: null } } }]
      }
    },
    {
      $project: {
        businessName: 1,
        status: 1,
        subscriptionPlan: 1,
        userCount: { $size: '$users' },
        cuisineType: 1,
        createdAt: 1
      }
    }
  ]);

  if (!stats.length) {
    return next(new AppError('Merchant not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { stats: stats[0] }
  });
});

// 10. UPDATE SUBSCRIPTION PLAN
exports.updateSubscription = catchAsync(async (req, res, next) => {
  const { plan } = req.body;
  
  const validPlans = ['free', 'basic', 'pro', 'enterprise'];
  if (!validPlans.includes(plan)) {
    return next(new AppError('Invalid subscription plan', 400));
  }

  const merchant = await Merchant.findByIdAndUpdate(
    req.params.id,
    { 
      subscriptionPlan: plan,
      updatedAt: new Date()
    },
    { new: true }
  );

  if (!merchant) {
    return next(new AppError('Merchant not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { merchant }
  });
});


// New CRUD for merchant users
exports.createMerchantUser = catchAsync(async (req, res, next) => {
  const merchantId = req.params.id;
  const { firstName, lastName, phone, email, password, passwordConfirm, role } = req.body;

  // Validate merchant existence
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) {
    return next(new AppError('Merchant not found', 404));
  }

  // Validate required fields
  if (!firstName || !phone || !password || !passwordConfirm || !role) {
    return next(new AppError('Please provide firstName, phone, password, passwordConfirm, and role', 400));
  }

  // Validate role
  const roleDoc = await Role.findById(role);
  if (!roleDoc || roleDoc.context !== 'merchant' || String(roleDoc.restaurant) !== String(merchantId)) {
    return next(new AppError('Invalid role or role does not belong to this merchant', 400));
  }

  // Validate unique fields
  const existingUser = await User.findOne({ $or: [{ phone }, { email }] });
  if (existingUser) {
    return next(new AppError('User with this phone or email already exists', 400));
  }

  // Create user
  const newUser = await User.create({
    firstName,
    lastName,
    phone,
    email,
    password,
    passwordConfirm,
    business: merchant.businessName,
    restaurant: merchantId,
    role: roleDoc._id,
    isActive: true,
  });

  // Populate role for response
  const populatedUser = await User.findById(newUser._id)
    .populate('role', 'name context')
    .select('firstName lastName phone email role');

  res.status(201).json({
    status: 'success',
    data: { user: populatedUser },
  });
});

exports.updateMerchantUser = catchAsync(async (req, res, next) => {
  const merchantId = req.params.id;
  const userId = req.params.userId;
  const { firstName, lastName, email, phone, role, isActive } = req.body;

  // Validate merchant existence
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) {
    return next(new AppError('Merchant not found', 404));
  }

  // Validate user existence and association
  const user = await User.findById(userId);
  if (!user || String(user.restaurant) !== String(merchantId)) {
    return next(new AppError('User not found or not associated with this merchant', 404));
  }

  // Validate role if provided
  if (role) {
    const roleDoc = await Role.findById(role);
    if (!roleDoc || roleDoc.context !== 'merchant' || String(roleDoc.restaurant) !== String(merchantId)) {
      return next(new AppError('Invalid role or role does not belong to this merchant', 400));
    }
  }

  // Prevent updating sensitive fields
  const blockedFields = ['password', 'passwordConfirm', 'restaurant', 'business'];
  blockedFields.forEach(field => {
    if (req.body[field]) {
      return next(new AppError(`Cannot update ${field}`, 400));
    }
  });

  // Update user
  const updateData = { firstName, lastName, email, phone, role, isActive };
  Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

  const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  })
    .populate('role', 'name context')
    .select('firstName lastName phone email role isActive');

  if (!updatedUser) {
    return next(new AppError('User not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { user: updatedUser },
  });
});

exports.deleteMerchantUser = catchAsync(async (req, res, next) => {
  const merchantId = req.params.id;
  const userId = req.params.userId;

  // Validate merchant existence
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) {
    return next(new AppError('Merchant not found', 404));
  }

  // Validate user existence and association
  const user = await User.findById(userId);
  if (!user || String(user.restaurant) !== String(merchantId)) {
    return next(new AppError('User not found or not associated with this merchant', 404));
  }

  // Deactivate user instead of deleting
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { isActive: false, role: null, restaurant: null },
    { new: true }
  );

  res.status(200).json({
    status: 'success',
    message: 'User deactivated successfully',
  });
});

// Existing getMerchantUsers (unchanged)
exports.getMerchantUsers = catchAsync(async (req, res, next) => {
  const merchantId = req.params.id;
  const merchant = await Merchant.findById(merchantId)
    .populate({
      path: 'users',
      select: 'firstName lastName phone role email',
      populate: { path: 'role', select: 'name context' },
    })
    .select('businessName users');

  if (!merchant) {
    return next(new AppError('Merchant not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      merchant: merchant.businessName,
      users: merchant.users || [],
    },
  });
});