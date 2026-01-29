// controllers/invitationController.js
const Invitation = require('../models/Invitation');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Email = require('../utils/email');

exports.sendInvitation = catchAsync(async (req, res, next) => {
  const { email, branchId, roleName = 'BRANCH-MANAGER', message } = req.body;

  // Validate
  const branch = await Branch.findOne({ _id: branchId, merchant: req.user.merchant });
  if (!branch) return next(new AppError('Branch not found', 404));

  const role = await Role.findOne({ name: roleName, isSystemRole: true });
  if (!role) return next(new AppError('Invalid role', 400));

  // Prevent duplicate pending invite
  const existing = await Invitation.findOne({
    email,
    branch: branchId,
    used: false,
    expiresAt: { $gt: Date.now() },
  });
  if (existing) return next(new AppError('Invitation already sent', 400));

  // Create invitation
  const invitation = await Invitation.create({
    email,
    branch: branchId,
    role: role._id,
    invitedBy: req.user._id,
    message,
  });

  // Send email
  try {
    await new Email({
      email,
      name: email.split('@')[0],
    }).sendInvitation({
      inviteLink: invitation.inviteLink,
      businessName: req.user.merchant.businessName,
      branchName: branch.name,
      roleName: role.name,
      message: message || `You've been invited to join the team!`,
    });

    res.status(201).json({
      status: 'success',
      message: 'Invitation sent successfully',
      data: { invitationId: invitation._id },
    });
  } catch (err) {
    await Invitation.deleteOne({ _id: invitation._id });
    return next(new AppError('Failed to send email. Try again.', 500));
  }
});
