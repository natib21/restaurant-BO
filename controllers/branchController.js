// controllers/branchController.js
const Branch = require('../models/branchModel');
const Merchant = require('../models/merchantModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const APIFeatures = require('../utils/apiFeatures');

// ============================================
// 1. CREATE NEW BRANCH (Merchant Admin)
// ============================================
exports.createBranch = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const {
    name,
    phone,
    city,
    subCity,
    specificArea,
    building,
    location, // This is the object containing { coordinates, type, city, etc. }
    isMain,
  } = req.body;

  // 1. Check if location and coordinates exist
  if (!name || !city || !location || !location.coordinates) {
    return next(new AppError('Name, city, and coordinates are required', 400));
  }

  // 2. Prevent multiple main branches
  if (isMain) {
    const existingMain = await Branch.findOne({ merchant: merchantId, isMain: true });
    if (existingMain) {
      return next(new AppError('Only one main branch allowed', 400));
    }
  }

  // 3. Create the branch using location.coordinates
  const branch = await Branch.create({
    name,
    merchant: merchantId,
    phone,
    location: {
      type: 'Point',
      // FIX: Use location.coordinates instead of the undefined 'coordinates' variable
      coordinates: location.coordinates,
      city,
      subCity,
      specificArea,
      building,
      formattedAddress: `${specificArea || ''}, ${subCity || ''}, ${city}`
        .replace(/^,\s*/, '')
        .trim(),
    },
    isMain: isMain || false,
    isActive: req.body.isActive ?? true, // Good to include this from frontend
    settings: req.body.settings || {},
    branding: req.body.branding || {},
  });

  res.status(201).json({
    status: 'success',
    data: { branch },
  });
});
// ============================================
// 2. GET ALL BRANCHES (Merchant Admin)
// ============================================
exports.getAllBranches = catchAsync(async (req, res, next) => {
  console.log(req.user);
  const merchantId = req.user.merchant._id;

  const features = new APIFeatures(Branch.find({ merchant: merchantId }), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const branches = await features.query
    .select('-qrSecretKey')
    .populate('merchant', 'businessName slug');

  res.status(200).json({
    status: 'success',
    results: branches.length,
    data: { branches },
  });
});

// ============================================
// 3. GET SINGLE BRANCH (By shortCode or ID)
// ============================================
exports.getBranch = catchAsync(async (req, res, next) => {
  const query =
    req.params.id?.length === 6
      ? { shortCode: req.params.id.toUpperCase() }
      : { _id: req.params.id };

  const branch = await Branch.findOne(query)
    .select('-qrSecretKey')
    .populate('merchant', 'businessName slug brandColor');

  if (!branch) {
    return next(new AppError('Branch not found', 404));
  }

  // Public access allowed (for QR)
  res.status(200).json({
    status: 'success',
    data: { branch },
  });
});

// ============================================
// 4. UPDATE BRANCH (Merchant Admin)
// ============================================
exports.updateBranch = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

  if (req.body.isMain) {
    // Auto-downgrade others
    await Branch.updateMany(
      { merchant: merchantId, _id: { $ne: req.params.id } },
      { isMain: false }
    );
  }

  const branch = await Branch.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    {
      name: req.body.name,
      phone: req.body.phone,
      'location.coordinates': req.body.coordinates,
      'location.city': req.body.city,
      'location.subCity': req.body.subCity,
      'location.specificArea': req.body.specificArea,
      'location.building': req.body.building,
      'location.formattedAddress': req.body.formattedAddress,
      isMain: req.body.isMain,
      isActive: req.body.isActive,
      settings: req.body.settings,
      branding: req.body.branding,
    },
    { new: true, runValidators: true }
  ).select('-qrSecretKey');

  if (!branch) {
    return next(new AppError('Branch not found or unauthorized', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { branch },
  });
});

// ============================================
// 5. DELETE / DEACTIVATE BRANCH
// ============================================
exports.deleteBranch = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;

  const branch = await Branch.findOneAndUpdate(
    { _id: req.params.id, merchant: merchantId },
    { isActive: false },
    { new: true }
  );

  if (!branch) {
    return next(new AppError('Branch not found or unauthorized', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// ============================================
// 6. REGENERATE QR CODES (Invalidate all)
// ============================================
exports.regenerateQRCodes = catchAsync(async (req, res, next) => {
  const merchantId = req.user.merchant._id;
  const branchId = req.params.id;

  const branch = await Branch.findOne({ _id: branchId, merchant: merchantId });
  if (!branch) return next(new AppError('Branch not found', 404));

  branch.qrVersion += 1;
  branch.qrSecretKey = crypto.randomBytes(64).toString('hex');
  await branch.save();

  res.status(200).json({
    status: 'success',
    message: 'All QR codes invalidated. New ones generated.',
    data: { qrVersion: branch.qrVersion },
  });
});

// ============================================
// 7. GET NEARBY BRANCHES (Public - For "Find Restaurant")
// ============================================
exports.getNearbyBranches = catchAsync(async (req, res, next) => {
  const { lat, lng, maxDistance = 5000 } = req.query; // meters

  if (!lat || !lng) {
    return next(new AppError('lat and lng query params required', 400));
  }

  const branches = await Branch.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
        distanceField: 'distance',
        maxDistance: parseInt(maxDistance),
        spherical: true,
      },
    },
    {
      $match: { isActive: true },
    },
    {
      $lookup: {
        from: 'merchants',
        localField: 'merchant',
        foreignField: '_id',
        as: 'merchant',
      },
    },
    { $unwind: '$merchant' },
    {
      $project: {
        name: 1,
        shortCode: 1,
        publicUrl: 1,
        phone: 1,
        'location.formattedAddress': 1,
        distance: 1,
        'merchant.businessName': 1,
        'merchant.slug': 1,
        'merchant.brandColor': 1,
      },
    },
  ]);

  res.status(200).json({
    status: 'success',
    results: branches.length,
    data: { branches },
  });
});
exports.inviteBranchManager = catchAsync(async (req, res, next) => {
  const { email, phone, branchId, firstName } = req.body;

  const invitation = await Invitation.create({
    email,
    phone,
    branch: branchId,
    invitedBy: req.user._id,
    role: 'BRANCH-MANAGER',
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  // Send SMS/email with link:
  // https://menuroom.et/invite/abc123
  await sendInvitationSMS(phone, invitation.token);

  res.status(201).json({
    status: 'success',
    message: 'Invitation sent successfully',
  });
});
