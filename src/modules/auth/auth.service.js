const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../../../models/userModel');
const Merchant = require('../../../models/merchantModel');
const Branch = require('../../../models/branchModel');
const Role = require('../../../models/roleModel');
const MenuGroup = require('../../../models/menuGroupModel');
const AppError = require('../../common/errors');
const sendEmail = require('../../../utils/email');
const { loadEnv } = require('../../config/env');
const { resolveBranchId } = require('../../common/guards/auth.guard');

class AuthService {
  static signToken(user) {
    if (!user?._id) throw new AppError('Invalid user for token generation', 500);

    const payload = { id: user._id.toString() };

    if (user.merchant?._id) payload.merchant = user.merchant._id.toString();
    else if (user.merchant) payload.merchant = user.merchant.toString();

    const branchId = resolveBranchId(user.branch);
    if (branchId) payload.branch = branchId;

    if (user.role?.name) payload.role = user.role.name;

    const env = loadEnv();
    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRE_IN || '7d',
    });
  }

  static buildAuthResponse(user) {
    const safe = user.toObject ? user.toObject() : { ...user };
    delete safe.password;
    delete safe.passwordConfirm;
    return safe;
  }

  static async signup(data) {
    const {
      firstName,
      lastName,
      phone,
      email,
      business: businessName,
      password,
      passwordConfirm,
    } = data;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const [existingUser, existingMerchant] = await Promise.all([
        User.findOne({ $or: [{ phone }, { email }] }).session(session),
        Merchant.findOne({ $or: [{ businessName }, { phone }] }).session(session),
      ]);

      if (existingUser) throw new AppError('Phone or email already in use', 400);
      if (existingMerchant) throw new AppError('Business name or phone already exists', 400);

      const [merchant] = await Merchant.create(
        [
          {
            businessName,
            slug: businessName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)/g, ''),
            phone,
            status: 'pending',
            mode: 'Test',
            branchCounter: 1,
          },
        ],
        { session }
      );

      const [mainBranch] = await Branch.create(
        [
          {
            merchant: merchant._id,
            name: `${businessName} - Main Branch`,
            phone,
            isMain: true,
            isActive: true,
            branchCode: 'BR-001',
            location: {
              type: 'Point',
              coordinates: [38.7578, 9.025],
              city: 'Addis Ababa',
              formattedAddress: `${businessName} - Main Branch, Addis Ababa, Ethiopia`,
            },
          },
        ],
        { session }
      );

      const superRole = await Role.findOne({ name: 'SUPER-MERCHANT-ADMIN' }).session(session);
      if (!superRole) throw new AppError('System role not found.', 500);

      const [newUser] = await User.create(
        [
          {
            firstName,
            lastName,
            phone,
            email: email.toLowerCase(),
            password,
            passwordConfirm,
            merchant: merchant._id,
            branch: [mainBranch._id],
            role: superRole._id,
            emailConfirmed: false,
          },
        ],
        { session }
      );

      await MenuGroup.create(
        [
          {
            merchant: merchant._id,
            branches: [mainBranch._id],
            name: 'All Items (System Default)',
            description: 'Hidden system group for all menu items.',
            visibility: 'always',
            priority: -100,
            isSystemDefault: true,
            isAlcoholMenu: false,
            items: [],
          },
        ],
        { session }
      );

      await session.commitTransaction();

      return User.findById(newUser._id)
        .select('-password -__v')
        .populate({
          path: 'role',
          select: 'name description',
          populate: { path: 'tasks', select: 'name endpoint method description' },
        })
        .populate('merchant', 'businessName slug status mode branchCounter')
        .populate('branch', 'name branchCode shortCode isMain publicUrl');
    } catch (err) {
      if (session.inTransaction()) await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  static async login(email, password) {
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.correctPassword(password, user.password))) {
      throw new AppError('Incorrect email or password', 401);
    }

    return User.findById(user._id)
      .populate({
        path: 'role',
        select: 'name endpoint description tasks',
        populate: { path: 'tasks', select: 'name endpoint method description' },
      })
      .populate({
        path: 'merchant',
        select: 'businessName slug status mode branchCounter brandColor logo',
      })
      .populate({ path: 'branch', select: 'name location isMain merchant isActive' });
  }

  static async changePassword(userId, currentPassword, newPassword, passwordConfirm) {
    const user = await User.findById(userId).select('+password');
    if (!user || !(await user.correctPassword(currentPassword, user.password))) {
      throw new AppError('Incorrect current password', 401);
    }
    user.password = newPassword;
    user.passwordConfirm = passwordConfirm;
    await user.save();
    return user;
  }

  static async forgotPassword(email) {
    const user = await User.findOne({ email });
    if (!user) throw new AppError('No user found with that email address', 404);

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });
    return { user, resetToken };
  }

  static async resetPassword(token, password, passwordConfirm) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetTokenExpires: { $gt: Date.now() },
    });

    if (!user) throw new AppError('Token is invalid or has expired', 400);

    user.password = password;
    user.passwordConfirm = passwordConfirm;
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpires = undefined;
    await user.save();
    return user;
  }
}

module.exports = { AuthService };
