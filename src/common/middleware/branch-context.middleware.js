const { BranchService } = require('../../modules/branch');

/**
 * Enriches req.ctx.branchId from body/query when staff operates on a branch.
 * Does not block requests — use BranchControlService.assertBranchAccess in services.
 */
function enrichBranchContext(req, res, next) {
  const branchId =
    req.body?.branchId || req.query?.branchId || req.params?.branchId || req.ctx?.branchId;

  if (branchId && req.ctx) {
    req.ctx.branchId = branchId;
  }

  if (req.user && branchId && process.env.BRANCH_ACCESS_ENFORCEMENT === 'true') {
    try {
      BranchService.assertBranchAccess(req.user, branchId);
    } catch (error) {
      return next(error);
    }
  }

  next();
}

module.exports = { enrichBranchContext };
