/**
 * @file src/modules/branch/controller/BranchUserAssignmentController.js
 * @description Controller for manual branch assignment endpoints
 */

const catchAsync = require('../../../../utils/catchAsync');
const AppError = require('../../../common/errors');
const { BranchUserAssignmentService } = require('../service/BranchUserAssignmentService');

/**
 * POST /api/v1/users/:userId/branches
 * Assign one or more branches to a user
 *
 * Request body:
 * {
 *   "branchId": "507f1f77bcf86cd799439011"  // single branch
 *   // OR
 *   "branchIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]  // multiple
 * }
 */
exports.assignBranchesToUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { branchId, branchIds } = req.body;

  // Support both single branchId and multiple branchIds
  const targetBranchIds = branchIds || (branchId ? [branchId] : null);

  if (!targetBranchIds) {
    return next(
      new AppError(
        'Request body must include either "branchId" (single) or "branchIds" (array)',
        400
      )
    );
  }

  const result = await BranchUserAssignmentService.assignBranchesToUser(
    userId,
    targetBranchIds,
    req
  );

  res.status(200).json({
    status: 'success',
    message: result.message,
    refreshHint: result.refreshHint,
    data: {
      user: {
        _id: result._id,
        firstName: result.firstName,
        lastName: result.lastName,
        phone: result.phone,
        email: result.email,
        branches: result.branch,
      },
    },
  });
});

/**
 * DELETE /api/v1/users/:userId/branches/:branchId
 * Remove a branch from a user's access
 */
exports.unassignBranchFromUser = catchAsync(async (req, res, next) => {
  const { userId, branchId } = req.params;

  const result = await BranchUserAssignmentService.unassignBranchesFromUser(
    userId,
    [branchId],
    req
  );

  res.status(200).json({
    status: 'success',
    message: result.message,
    refreshHint: result.refreshHint,
    data: {
      user: {
        _id: result._id,
        firstName: result.firstName,
        lastName: result.lastName,
        phone: result.phone,
        email: result.email,
        branches: result.branch,
      },
    },
  });
});

/**
 * GET /api/v1/users/:userId/branches
 * Get all branches assigned to a user
 */
exports.getUserBranches = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  const result = await BranchUserAssignmentService.getUserBranches(userId, req);

  res.status(200).json({
    status: 'success',
    data: result,
  });
});
