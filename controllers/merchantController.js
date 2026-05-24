/**
 * @file merchantController.js
 * @description Handles all CRUD operations for merchants, including media uploads,
 *              user management within merchants, approval workflows, and statistics.
 *              Supports both back-office (system admin) and merchant self-management.
 */

const multer = require('multer');
const sharp = require('sharp');
const ApiFeatures = require('../utils/apiFeatures');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const Role = require('../models/roleModel');
const Merchant = require('../models/merchantModel');
const Task = require('../models/taskModel');
const Branch = require('../models/branchModel');
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
      .toFile(`uploads/img/merchants/${logoFilename}`);

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
      .toFile(`uploads/img/merchants/${coverFilename}`);

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
  if (
    !Array.isArray(coords) ||
    coords.length !== 2 ||
    typeof coords[0] !== 'number' ||
    typeof coords[1] !== 'number'
  ) {
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

  const merchants = await features.query.populate('approvedBy', 'firstName lastName email').lean(); // Use lean for performance

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
  if (exists)
    return next(new AppError('Merchant already exists with this phone, tax ID, or name', 400));

  req.body.status = 'pending';
  req.body.isActive = true;
  req.body.approvedBy = req.user._id;

  const merchant = await Merchant.create(req.body);
  const populated = await Merchant.findById(merchant._id).populate(
    'approvedBy',
    'firstName lastName email'
  );

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
  if (merchant.status !== 'pending')
    return next(new AppError('Only pending merchants can be approved', 400));

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
        foreignField: 'merchant',
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
  // 1. Merchant that is creating the user
  const merchant = req.user.merchant; // <-- populated in protect()
  const merchantId = merchant._id; // <-- use this

  // 2. Extract body
  const { firstName, lastName, phone, email, password, role, branch } = req.body;

  // 3. Required fields
  const required = { firstName, phone, password, role };
  const missing = Object.keys(required).find(k => !required[k]);
  if (missing) {
    return next(
      new AppError(`Missing required field: ${missing} (firstName, phone, password, role)`, 400)
    );
  }

  // 4. ----- ROLE VALIDATION -----
  const roleDoc = await Role.findOne({
    _id: role,
    merchant: merchantId, // must belong to this merchant
    isActive: true, // only active roles can be assigned
    isSystemRole: false, // merchants cannot assign system roles
  });

  if (!roleDoc) {
    return next(
      new AppError(
        'Invalid role: role does not exist, is inactive, or does not belong to your merchant',
        400
      )
    );
  }

  // 5. Prevent duplicate phone / email (across all users)
  const duplicate = await User.findOne({
    $or: [{ phone }, { email: email?.trim() }].filter(Boolean),
  });
  if (duplicate) {
    return next(new AppError('Phone or email already in use', 400));
  }
  if (branch && Array.isArray(branch) && branch.length > 0) {
    const validBranchCount = await Branch.countDocuments({
      _id: { $in: branch },
      merchant: merchantId,
    });

    if (validBranchCount !== branch.length) {
      return next(new AppError('One or more selected branches are invalid or unauthorized.', 400));
    }
  }
  // 6. Create the user
  const newUser = await User.create({
    firstName: firstName.trim(),
    lastName: lastName?.trim(),
    phone: phone.trim(),
    email: email?.trim().toLowerCase(),
    password,
    passwordConfirm: password, // you hash in pre-save hook
    business: merchant.businessName,
    merchant: merchantId,
    branch: branch || [],
    role: roleDoc._id,
    isActive: true,
  });

  // 7. Return clean response (no password, no internal fields)
  const populated = await User.findById(newUser._id)
    .select('firstName lastName phone email role isActive')
    .populate({
      path: 'role',
      select: 'name description',
    });

  res.status(201).json({
    status: 'success',
    data: { user: populated },
  });
});

exports.updateMerchantUser = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id; // ← Correct source
  const { id } = req.params;
  const { firstName, lastName, email, phone, role, isActive } = req.body;

  // Verify user belongs to this merchant
  const user = await User.findOne({
    _id: id,
    merchant: merchantId, // or business: merchantId
    // business: merchantId,
  });

  if (!user) {
    return next(new AppError('User not found or does not belong to your merchant', 404));
  }

  // Validate role if provided
  if (role !== undefined) {
    const roleDoc = await Role.findOne({
      _id: role,
      context: 'merchant',
      restaurant: merchantId,
    });
    if (!roleDoc) {
      return next(new AppError('Invalid role for this merchant', 400));
    }
  }

  // Block sensitive fields
  const blocked = ['password', 'passwordConfirm', 'restaurant', 'business'];
  if (blocked.some(f => f in req.body)) {
    return next(new AppError('Cannot update sensitive fields via this route', 400));
  }

  const update = { firstName, lastName, email, phone, role, isActive };
  Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

  const updatedUser = await User.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  })
    .populate('role', 'name description')
    .select('firstName lastName email phone role isActive');

  res.status(200).json({
    status: 'success',
    data: { user: updatedUser },
  });
});

// 2. DEACTIVATE USER (Soft Delete)
exports.deleteMerchantUser = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { id } = req.params;

  const user = await User.findOne({
    _id: id,
    merchant: merchantId,
  });

  if (!user) {
    return next(new AppError('User not found or does not belong to your merchant', 404));
  }

  await User.findByIdAndUpdate(id, {
    isActive: false,
  });

  res.status(200).json({
    status: 'success',
    message: 'User deactivated and unlinked successfully',
  });
});

// 3. REACTIVATE USER
exports.activateMerchantUser = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) return next(new AppError('User not found', 404));

  // Allow reactivation even if link was cleared during deactivation
  const wasLinked = [user.merchant, user.business].some(id => String(id) === String(merchantId));
  if (!wasLinked) {
    return next(new AppError('This user was never part of your merchant', 403));
  }

  if (user.isActive) {
    return next(new AppError('User is already active', 400));
  }

  const activatedUser = await User.findByIdAndUpdate(
    id,
    {
      isActive: true,
    },
    { new: true, runValidators: true }
  )
    .populate('role', 'name description')
    .select('firstName lastName email phone role isActive');

  res.status(200).json({
    status: 'success',
    message: 'User reactivated successfully',
    data: { user: activatedUser },
  });
});

// 4. GET ALL USERS (for this merchant)
exports.getMerchantUsers = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

  const merchant = await Merchant.findById(merchantId)
    .select('businessName')
    .populate({
      path: 'users',
      select: 'firstName lastName email phone role isActive',
      populate: { path: 'role', select: 'name description' },
    })
    .lean();

  if (!merchant) return next(new AppError('Merchant not found', 404));

  res.status(200).json({
    status: 'success',
    data: {
      merchantName: merchant.businessName,
      users: merchant.users || [],
    },
  });
});

// 5. GET SINGLE USER BY ID
exports.getMerchantUserById = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { id } = req.params;

  const merchant = await Merchant.findById(merchantId)
    .select('businessName')
    .populate({
      path: 'users',
      match: { _id: id, isActive: true },
      select: 'firstName lastName email phone role isActive',
      populate: { path: 'role', select: 'name description' },
    })
    .lean();

  if (!merchant || !merchant.users?.length) {
    return next(new AppError('User not found or not active', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      merchantName: merchant.businessName,
      user: merchant.users[0],
    },
  });
});
/**
 * GET /api/v1/merchants/me/branches/:branchId/users
 * Fetch all users assigned to a specific branch — for the authenticated merchant
 *
 * Query params (optional):
 *   ?isActive=true|false
 *   ?role=roleId
 */
exports.getMerchantUsersByBranch = catchAsync(async (req, res) => {
  const { BranchService } = require('../src/modules/branch');
  const { branch, users } = await BranchService.getMerchantUsersByBranch(req);

  res.status(200).json({
    status: 'success',
    results: users.length,
    data: { branch, users },
  });
});
exports.createMerchantRole = catchAsync(async (req, res, next) => {
  let { name, description, tasks } = req.body;
  const merchantId = req.user.merchant._id;
  console.log(name, merchantId, tasks);
  if (!name?.trim()) {
    return next(new AppError('Role name is required', 400));
  }
  if (!description?.trim()) {
    return next(new AppError('Role description is required', 400));
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return next(new AppError('At least one task must be assigned to the role', 400));
  }

  // Normalize
  name = name.trim().toUpperCase();
  description = description.trim();

  // 2. Prevent duplicate role name
  const exists = await Role.findOne({ name, merchant: merchantId });
  if (exists) {
    return next(new AppError('Role name already exists', 400));
  }

  // 3. Validate all task IDs
  const invalidId = tasks.find(id => !mongoose.Types.ObjectId.isValid(id));
  if (invalidId) {
    return next(new AppError(`Invalid task ID: ${invalidId}`, 400));
  }

  // 4. Verify all tasks exist
  const validTasks = await Task.find({ _id: { $in: tasks } });
  if (validTasks.length !== tasks.length) {
    return next(new AppError('One or more tasks do not exist', 400));
  }

  // 5. Create role
  const role = await Role.create({
    name,
    description,
    tasks, // ← tasks is guaranteed valid & non-empty
    merchant: merchantId,
    isSystemRole: false,
    isSubscriptionBased: false,
  });

  // 6. Populate response
  const populatedRole = await Role.findById(role._id).populate({
    path: 'tasks',
    select: 'name endpoint method description',
  });

  res.status(201).json({
    status: 'success',
    data: { role: populatedRole },
  });
});

// ===================================================================
// GET ALL ROLES (merchant only)
// ===================================================================
exports.getAllMerchantRoles = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const roles = await Role.find({ merchant: merchantId })
    .populate('tasks', 'name endpoint method')
    .select('name description tasks isActive createdAt');

  res.status(200).json({
    status: 'success',
    results: roles.length,
    data: { roles },
  });
});

// ===================================================================
// GET SINGLE ROLE
// ===================================================================
exports.getMerchantRoleById = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const role = await Role.findOne({
    _id: req.params.id,
    merchant: merchantId,
  }).populate('tasks');

  if (!role) return next(new AppError('Role not found', 404));

  res.status(200).json({
    status: 'success',
    data: { role },
  });
});
/**
 * GET /api/v1/merchants/me
 * Returns the full profile of the currently logged-in merchant
 */
exports.getMe = catchAsync(async (req, res, next) => {
  // 1. Get ID from the authenticated user
  const merchantId = req.user.merchant?._id || req.user.merchant;

  if (!merchantId) {
    return next(new AppError('No merchant associated with this user.', 404));
  }

  // 2. Find merchant and populate relevant data
  const merchant = await Merchant.findById(merchantId)
    .populate('approvedBy', 'firstName lastName email')
    .populate('masterMenu', 'name status'); // Populate menu if needed

  if (!merchant) {
    return next(new AppError('Merchant record not found.', 404));
  }

  // 3. Format URLs for logo and cover image
  const baseUrl = `${req.protocol}://${req.get('host')}/img/merchants`;
  const merchantObj = merchant.toObject();

  const formattedMerchant = {
    ...merchantObj,
    logo: merchantObj.logo ? `${baseUrl}/${merchantObj.logo}` : null,
    coverImage: merchantObj.coverImage ? `${baseUrl}/${merchantObj.coverImage}` : null,
  };

  res.status(200).json({
    status: 'success',
    data: {
      merchant: formattedMerchant,
    },
  });
});

/**
 * PATCH /api/v1/merchants/me
 * Allows the currently logged-in merchant to update their own profile data.
 * Protects sensitive fields from being modified via self-service.
 */
exports.updateMe = catchAsync(async (req, res, next) => {
  // 1. Get ID from the authenticated user
  const merchantId = req.user.merchant?._id || req.user.merchant;

  if (!merchantId) {
    return next(new AppError('No merchant associated with this user.', 404));
  }

  // 2. Filter out sensitive fields that merchants shouldn't change themselves
  // These fields should only be modified by System Admins via the /:id route
  const restrictedFields = [
    'status',
    'isActive',
    'taxId',
    'approvedBy',
    'subscriptionPlan',
    'suspendedReason',
    'suspendedAt',
    'createdAt',
  ];

  restrictedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      delete req.body[field];
    }
  });

  const updatedMerchant = await Merchant.findByIdAndUpdate(merchantId, req.body, {
    new: true,
    runValidators: true,
  }).populate('approvedBy', 'firstName lastName email');

  if (!updatedMerchant) {
    return next(new AppError('Merchant record not found.', 404));
  }

  // 4. Format URLs for images
  const baseUrl = `${req.protocol}://${req.get('host')}/img/merchants`;
  const merchantObj = updatedMerchant.toObject();

  const formattedMerchant = {
    ...merchantObj,
    logo: merchantObj.logo ? `${baseUrl}/${merchantObj.logo}` : null,
    coverImage: merchantObj.coverImage ? `${baseUrl}/${merchantObj.coverImage}` : null,
  };

  res.status(200).json({
    status: 'success',
    data: {
      merchant: formattedMerchant,
    },
  });
});
// ===================================================================
// UPDATE ROLE
// ===================================================================
/**
 * PATCH /api/v1/merchants/me/roles/:id
 * Update role (name, description, tasks) - FIXED & CLEAN
 */
exports.updateMerchantRole = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { id } = req.params;
  const { name, description, tasks } = req.body;

  const role = await Role.findOne({
    _id: id,
    merchant: merchantId,
  });

  if (!role) return next(new AppError('Role not found or does not belong to your merchant', 404));
  if (role.isSystemRole) return next(new AppError('Cannot modify system roles', 403));

  // Prevent changing critical fields
  delete req.body.merchant;
  delete req.body.isSystemRole;
  delete req.body.isSubscriptionBased;

  // If name is being updated → check for duplicate
  if (name) {
    const normalizedName = name.trim().toUpperCase();
    const duplicate = await Role.findOne({
      name: normalizedName,
      merchant: merchantId,
      _id: { $ne: id },
    });
    if (duplicate) return next(new AppError('Another role with this name already exists', 400));
    req.body.name = normalizedName;
  }

  // If tasks are being updated → validate them
  if (tasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return next(new AppError('Tasks must be a non-empty array', 400));
    }

    const invalidId = tasks.find(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidId) return next(new AppError(`Invalid task ID: ${invalidId}`, 400));

    const validTasks = await Task.find({ _id: { $in: tasks } });
    if (validTasks.length !== tasks.length) {
      return next(new AppError('One or more tasks do not exist', 400));
    }
  }

  const updatedRole = await Role.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  }).populate('tasks', 'name endpoint method description');

  res.status(200).json({
    status: 'success',
    data: { role: updatedRole },
  });
});

/**
 * DELETE /api/v1/merchants/roles/:id
 * Soft-delete a custom role → sets isActive = false
 * Prevents deletion if role is in use or is a system role
 */
exports.deleteMerchantRole = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { id } = req.params;

  const role = await Role.findOne({
    _id: id,
    merchant: merchantId,
  });

  if (!role) {
    return next(new AppError('Role not found or does not belong to your merchant', 404));
  }

  if (role.isSystemRole) {
    return next(new AppError('Cannot deactivate system roles', 403));
  }

  // Prevent deactivating a role that is currently assigned to users
  const inUse = await User.exists({ role: id, isActive: true });
  if (inUse) {
    return next(
      new AppError(
        'Cannot deactivate role: it is currently assigned to one or more active users',
        400
      )
    );
  }
  // SOFT DELETE → just set isActive = false
  await Role.findByIdAndUpdate(id, { isActive: false }, { new: true, runValidators: true });

  res.status(200).json({
    status: 'success',
    message: 'Role deactivated successfully',
    data: null,
  });
});

/**
 * PATCH /api/v1/merchants/roles/:id/reactivate
 * Reactivate a previously deactivated role
 */
exports.activateMerchantRole = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const { id } = req.params;

  const role = await Role.findOne({
    _id: id,
    merchant: merchantId,
    isActive: false, // must be inactive
  });

  if (!role) {
    return next(new AppError('Role not found or already active', 404));
  }

  if (role.isSystemRole) {
    return next(new AppError('System roles cannot be reactivated this way', 403));
  }

  const updated = await Role.findByIdAndUpdate(id, { isActive: true }, { new: true }).populate(
    'tasks'
  );

  res.status(200).json({
    status: 'success',
    message: 'Role reactivated successfully',
    data: { role: updated },
  });
});
