/**
 * @file merchantController.js
 * @description Handles all CRUD operations for merchants, including media uploads,
 *              user management within merchants, approval workflows, and statistics.
 *              Supports both back-office (system admin) and merchant self-management.
 */

const multer = require('multer');
const sharp = require('sharp');
const Merchant = require('../models/merchantModel');
const ApiFeatures = require('../utils/apiFeatures');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const mongoose = require('mongoose');
const fs = require('fs');

/* ===================================================================
   1. MULTER SETUP: Handle file uploads (logo, cover, documents)
   =================================================================== */

// Store files in memory to allow processing with Sharp before saving
const multerStorage = multer.memoryStorage();

/**
 * Filter to allow only image files for logo & coverImage
 * Documents are handled separately (no filtering needed)
 */
const multerFilter = (req, file, cb) => {
  if (file.fieldname === 'documents') {
    // Allow any file type for documents
    cb(null, true);
  } else if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images for logo/cover.', 400), false);
  }
};

// Configure multer to accept multiple fields
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});

/**
 * Middleware: Upload up to 1 logo, 1 cover image, and 10 documents
 */
exports.uploadMerchantPhotos = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 },
  { name: 'documents', maxCount: 10 },
]);

/* ===================================================================
   2. IMAGE & DOCUMENT PROCESSING (Sharp + Filesystem)
   =================================================================== */

/**
 * Middleware: Resize images and save to disk, store document metadata
 * Runs after multer, before create/update
 */
exports.processMerchantMedia = catchAsync(async (req, res, next) => {
  // --- Process Logo ---
  if (req.files?.logo?.[0]) {
    const logoFile = req.files.logo[0];
    const logoFilename = `merchant-logo-${Date.now()}-${logoFile.originalname.split('.').slice(0, -1).join('.')}.jpeg`;

    await sharp(logoFile.buffer)
      .resize(300, 300, { fit: 'cover' })
      .toFormat('jpeg')
      .jpeg({ quality: 90 })
      .toFile(`public/img/merchants/${logoFilename}`);

    req.body.logo = logoFilename;
  }

  // --- Process Cover Image ---
  if (req.files?.coverImage?.[0]) {
    const coverFile = req.files.coverImage[0];
    const coverFilename = `merchant-cover-${Date.now()}-${coverFile.originalname.split('.').slice(0, -1).join('.')}.jpeg`;

    await sharp(coverFile.buffer)
      .resize(1200, 400, { fit: 'cover' })
      .toFormat('jpeg')
      .jpeg({ quality: 90 })
      .toFile(`public/img/merchants/${coverFilename}`);

    req.body.coverImage = coverFilename;
  }

  // --- Process Documents (no resize, just save + metadata) ---
  if (req.files?.documents) {
    const docs = req.files.documents;
    req.body.documents = [];

    docs.forEach((file, index) => {
      const docFilename = `${Date.now()}-${file.originalname}`;
      const docPath = `public/img/merchants/documents/${docFilename}`;

      // Save file to disk
      fs.writeFileSync(docPath, file.buffer);

      // Push metadata
      req.body.documents.push({
        name: file.originalname,
        type: req.body.documentTypes?.[index] || 'unknown',
        url: `/img/merchants/documents/${docFilename}`,
        uploadedAt: new Date(),
      });
    });
  }

  next();
});

/* ===================================================================
   3. VALIDATION MIDDLEWARE
   =================================================================== */

/**
 * Validate required fields and location coordinates before creating/updating
 */
const validateMerchantData = (req, res, next) => {
  const required = ['businessName', 'ownerName', 'phone', 'taxId', 'location'];
  for (const field of required) {
    if (!req.body[field]) {
      return next(new AppError(`Please provide ${field}`, 400));
    }
  }

  const coords = req.body.location?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2 || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') {
    return next(new AppError('Location coordinates must be [longitude, latitude] as numbers', 400));
  }

  next();
};

/* ===================================================================
   4. CRUD OPERATIONS
   =================================================================== */

/**
 * GET /api/v1/merchants
 * Fetch all merchants with filtering, sorting, pagination
 * Includes image URLs and counts
 */
exports.getAllMerchants = catchAsync(async (req, res) => {
  const features = new ApiFeatures(Merchant.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const merchants = await features.query
    .populate('approvedBy', 'firstName lastName email')
    .lean(); // Use lean for performance

  const baseUrl = `${req.protocol}://${req.get('host')}/img/merchants`;

  const merchantsWithImages = merchants.map(m => ({
    ...m,
    logo: m.logo ? `${baseUrl}/${m.logo}` : null,
    coverImage: m.coverImage ? `${baseUrl}/${m.coverImage}` : null,
    documentCount: m.documents?.length || 0,
    userCount: m.users?.length || 0,
  }));

  res.status(200).json({
    status: 'success',
    results: merchantsWithImages.length,
    data: { merchants: merchantsWithImages },
  });
});

/**
 * GET /api/v1/merchants/:id
 * Get single merchant with populated users and roles
 */
exports.getMerchant = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findById(req.params.id)
    .populate('approvedBy', 'firstName lastName email')
    .populate({
      path: 'users',
      select: 'firstName lastName phone email role isActive',
      populate: { path: 'role', select: 'name context description' },
    });

  if (!merchant) return next(new AppError('Merchant not found', 404));

  const baseUrl = `${req.protocol}://${req.get('host')}/img/merchants`;
  const merchantObj = merchant.toObject();

  res.status(200).json({
    status: 'success',
    data: {
      merchant: {
        ...merchantObj,
        logo: merchantObj.logo ? `${baseUrl}/${merchantObj.logo}` : null,
        coverImage: merchantObj.coverImage ? `${baseUrl}/${merchantObj.coverImage}` : null,
      },
    },
  });
});

/**
 * POST /api/v1/merchants
 * Create new merchant (back-office only)
 * Sets status to 'pending', approvedBy = current user
 */
exports.createNewMerchant = catchAsync(async (req, res, next) => {
  // Run validation
  validateMerchantData(req, res, () => {});

  // Prevent duplicates
  const exists = await Merchant.findOne({
    $or: [
      { phone: req.body.phone },
      { taxId: req.body.taxId },
      { businessName: req.body.businessName },
    ],
  });
  if (exists) return next(new AppError('Merchant already exists with this phone, tax ID, or name', 400));

  req.body.status = 'pending';
  req.body.isActive = true;
  req.body.approvedBy = req.user._id;

  const merchant = await Merchant.create(req.body);
  const populated = await Merchant.findById(merchant._id).populate('approvedBy', 'firstName lastName email');

  res.status(201).json({
    status: 'success',
    data: { merchant: populated },
  });
});

/**
 * PATCH /api/v1/merchants/:id
 * Update merchant (block sensitive fields)
 */
exports.updateMerchant = catchAsync(async (req, res, next) => {
  const blocked = ['phone', 'taxId', 'businessName'];
  for (const field of blocked) {
    if (req.body[field]) return next(new AppError(`Cannot update ${field}`, 400));
  }

  if (req.body.status === 'approved') {
    req.body.approvedBy = req.user._id;
  }

  const merchant = await Merchant.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  }).populate('approvedBy', 'firstName lastName email');

  if (!merchant) return next(new AppError('Merchant not found', 404));

  res.status(200).json({ status: 'success', data: { merchant } });
});

/**
 * DELETE /api/v1/merchants/:id
 * Soft-delete: set status=inactive, isActive=false, deactivate users
 */
exports.deleteMerchant = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findByIdAndUpdate(
    req.params.id,
    { status: 'inactive', isActive: false },
    { new: true }
  );

  if (!merchant) return next(new AppError('Merchant not found', 404));

  // Deactivate all associated users
  await User.updateMany(
    { restaurant: req.params.id },
    { isActive: false, role: null, restaurant: null }
  );

  res.status(200).json({
    status: 'success',
    message: 'Merchant deactivated and users disabled',
  });
});

/* ===================================================================
   5. WORKFLOW: Approve, Suspend, Activate
   =================================================================== */

/**
 * PATCH /api/v1/merchants/:id/approve
 * Approve pending merchant
 */
exports.approveMerchant = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findById(req.params.id);
  if (!merchant) return next(new AppError('Merchant not found', 404));
  if (merchant.status !== 'pending') return next(new AppError('Only pending merchants can be approved', 400));

  const updated = await Merchant.findByIdAndUpdate(
    req.params.id,
    { status: 'approved', approvedBy: req.user._id, isActive: true },
    { new: true, runValidators: true }
  ).populate('approvedBy', 'firstName lastName email');

  res.status(200).json({
    status: 'success',
    message: 'Merchant approved',
    data: { merchant: updated },
  });
});

/**
 * PATCH /api/v1/merchants/:id/suspend
 * Suspend merchant with reason
 */
exports.suspendMerchant = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  const merchant = await Merchant.findByIdAndUpdate(
    req.params.id,
    {
      status: 'suspended',
      isActive: false,
      suspendedReason: reason || 'No reason provided',
      suspendedAt: new Date(),
    },
    { new: true }
  ).populate('approvedBy', 'firstName lastName email');

  if (!merchant) return next(new AppError('Merchant not found', 404));

  res.status(200).json({
    status: 'success',
    message: 'Merchant suspended',
    data: { merchant },
  });
});

/**
 * PATCH /api/v1/merchants/:id/activate
 * Reactivate suspended merchant
 */
exports.activateMerchant = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findByIdAndUpdate(
    req.params.id,
    { status: 'approved', isActive: true, suspendedReason: null, suspendedAt: null },
    { new: true }
  ).populate('approvedBy', 'firstName lastName email');

  if (!merchant) return next(new AppError('Merchant not found', 404));

  res.status(200).json({
    status: 'success',
    message: 'Merchant reactivated',
    data: { merchant },
  });
});

/* ===================================================================
   6. STATISTICS & SUBSCRIPTION
   =================================================================== */

/**
 * GET /api/v1/merchants/:id/stats
 * Get merchant stats: user count, plan, etc.
 */
exports.getMerchantStats = catchAsync(async (req, res, next) => {
  const stats = await Merchant.aggregate([
    { $match: { _id: mongoose.Types.ObjectId(req.params.id) } },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: 'restaurant',
        as: 'users',
        pipeline: [{ $match: { role: { $ne: null } } }],
      },
    },
    {
      $project: {
        businessName: 1,
        status: 1,
        subscriptionPlan: 1,
        userCount: { $size: '$users' },
        cuisineType: 1,
        createdAt: 1,
      },
    },
  ]);

  if (!stats.length) return next(new AppError('Merchant not found', 404));

  res.status(200).json({ status: 'success', data: { stats: stats[0] } });
});

/**
 * PATCH /api/v1/merchants/:id/subscription
 * Update subscription plan
 */
exports.updateSubscription = catchAsync(async (req, res, next) => {
  const { plan } = req.body;
  const valid = ['free', 'basic', 'pro', 'enterprise'];
  if (!valid.includes(plan)) return next(new AppError('Invalid plan', 400));

  const merchant = await Merchant.findByIdAndUpdate(
    req.params.id,
    { subscriptionPlan: plan, updatedAt: new Date() },
    { new: true }
  );

  if (!merchant) return next(new AppError('Merchant not found', 404));

  res.status(200).json({ status: 'success', data: { merchant } });
});

/* ===================================================================
   7. MERCHANT USER MANAGEMENT (Staff CRUD)
   =================================================================== */

/**
 * POST /api/v1/merchants/:id/users
 * Create a user under this merchant (back-office or merchant admin)
 */
exports.createMerchantUser = catchAsync(async (req, res, next) => {
  console.log(req.user)
  const merchantId = req.user.merchant._id;
  
  const { firstName, lastName, phone, email, password, role } = req.body;

  // Validate merchant
  const merchant = await Merchant.findById(merchantId);
  if (!merchant) return next(new AppError('Merchant not found', 404));

  // Validate required fields
  if (!firstName || !phone || !password  || !role) {
    return next(new AppError('All fields are required: firstName, phone, password, role', 400));
  }

  // Validate role belongs to this merchant
  const roleDoc = await Role.findById(role);
  if (!roleDoc || roleDoc.context !== 'merchant' || String(roleDoc.merchant) !== merchantId) {
    return next(new AppError('Invalid role or role not assigned to this merchant', 400));
  }

  // Prevent duplicate phone/email
  const exists = await User.findOne({ $or: [{ phone }, { email }] });
  if (exists) return next(new AppError('Phone or email already in use', 400));

  // Create user
  const user = await User.create({
    firstName,
    lastName,
    phone,
    email,
    password,
    passwordConfirm :password,
    business: merchant.businessName,
    merchant: merchantId,
    role: roleDoc._id,
    isActive: true,
  });

  const populated = await User.findById(user._id)
    .populate('role', 'name context')
    .select('firstName lastName phone email role isActive');

  res.status(201).json({ status: 'success', data: { user: populated } });
});

/**
 * PATCH /api/v1/merchants/:id/users/:userId
 * Update user details (cannot change password or merchant)
 */
exports.updateMerchantUser = catchAsync(async (req, res, next) => {
  const { id: merchantId, userId } = req.params;
  const { firstName, lastName, email, phone, role, isActive } = req.body;

  const merchant = await Merchant.findById(merchantId);
  if (!merchant) return next(new AppError('Merchant not found', 404));

  const user = await User.findById(userId);
  if (!user || String(user.restaurant) !== merchantId) {
    return next(new AppError('User not found or not linked to this merchant', 404));
  }

  // Validate role if updating
  if (role) {
    const roleDoc = await Role.findById(role);
    if (!roleDoc || roleDoc.context !== 'merchant' || String(roleDoc.restaurant) !== merchantId) {
      return next(new AppError('Invalid role for this merchant', 400));
    }
  }

  // Block sensitive updates
  const blocked = ['password', 'passwordConfirm', 'restaurant', 'business'];
  if (blocked.some(f => req.body[f])) {
    return next(new AppError('Cannot update password or merchant assignment here', 400));
  }

  const update = { firstName, lastName, email, phone, role, isActive };
  Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

  const updated = await User.findByIdAndUpdate(userId, update, {
    new: true,
    runValidators: true,
  })
    .populate('role', 'name context')
    .select('firstName lastName phone email role isActive');

  res.status(200).json({ status: 'success', data: { user: updated } });
});

/**
 * DELETE /api/v1/merchants/:id/users/:userId
 * Soft-delete: deactivate user and remove role/merchant link
 */
exports.deleteMerchantUser = catchAsync(async (req, res, next) => {
  const { id: merchantId, userId } = req.params;

  const merchant = await Merchant.findById(merchantId);
  if (!merchant) return next(new AppError('Merchant not found', 404));

  const user = await User.findById(userId);
  if (!user || String(user.restaurant) !== merchantId) {
    return next(new AppError('User not found or not associated', 404));
  }

  await User.findByIdAndUpdate(userId, {
    isActive: false,
    role: null,
    restaurant: null,
    business: null,
  });

  res.status(200).json({ status: 'success', message: 'User deactivated and unlinked' });
});

/**
 * GET /api/v1/merchants/:id/users
 * List all users under this merchant
 */
exports.getMerchantUsers = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findById(req.params.id)
    .populate({
      path: 'users',
      select: 'firstName lastName phone email role isActive',
      populate: { path: 'role', select: 'name context description' },
    })
    .select('businessName users');

  if (!merchant) return next(new AppError('Merchant not found', 404));

  res.status(200).json({
    status: 'success',
    data: {
      merchant: merchant.businessName,
      users: merchant.users || [],
    },
  });
});


exports.createMerchantRole = catchAsync(async (req, res, next) => {
  const { name, description, tasks } = req.body;
  const merchantId = req.user.merchant._id;

  // Validate tasks
  if (tasks && tasks.length > 0) {
    const validTasks = await Task.find({ _id: { $in: tasks } });
    if (validTasks.length !== tasks.length) {
      return next(new AppError('One or more tasks are invalid', 400));
    }
  }

  // Prevent duplicate name
  const exists = await Role.findOne({
    name: name.toUpperCase(),
    merchant: merchantId,
  });
  if (exists) return next(new AppError('Role name already exists', 400));

  const role = await Role.create({
    name: name.toUpperCase(),
    description,
    tasks,
    merchant: merchantId,
    isSystemRole: false,
    isSubscriptionBased: false,
  });

  res.status(201).json({
    status: 'success',
    data: { role },
  });
});

// ===================================================================
// GET ALL ROLES (merchant only)
// ===================================================================
exports.getAllMerchantRoles = catchAsync(async (req, res, next) => {
   const merchantId = req.user.merchant._id;
  const roles = await Role.find({ merchant: merchantId })
    .populate('tasks', 'name target method')
    .select('name description tasks createdAt');

  res.status(200).json({
    status: 'success',
    results: roles.length,
    data: { roles },
  });
});

// ===================================================================
// GET SINGLE ROLE
// ===================================================================
exports.getMerchantRole = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const role = await Role.findOne({
    _id: req.params.roleId,
    merchant: merchantId
  }).populate('tasks');

  if (!role) return next(new AppError('Role not found', 404));

  res.status(200).json({
    status: 'success',
    data: { role },
  });
});

// ===================================================================
// UPDATE ROLE
// ===================================================================
exports.updateMerchantRole = catchAsync(async (req, res, next) => {
   const merchantId = req.user.merchant._id;
  const role = await Role.findOne({
    _id: req.params.roleId,
    merchant: merchantId,
  });

  if (!role) return next(new AppError('Role not found', 404));

  // Prevent changing merchant or system flags
  delete req.body.merchant;
  delete req.body.isSystemRole;
  delete req.body.isSubscriptionBased;

  const updated = await Role.findByIdAndUpdate(req.params.roleId, req.body, {
    new: true,
    runValidators: true,
  }).populate('tasks');

  res.status(200).json({
    status: 'success',
    data: { role: updated },
  });
});

// ===================================================================
// DELETE ROLE
// ===================================================================
exports.deleteMerchantRole = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const role = await Role.findOne({
    _id: req.params.roleId,
    merchant: merchantId,
  });

  if (!role) return next(new AppError('Role not found', 404));
  if (role.isSystemRole) return next(new AppError('Cannot delete system role', 400));

  await Role.findByIdAndDelete(req.params.roleId);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});