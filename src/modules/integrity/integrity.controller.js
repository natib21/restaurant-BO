const catchAsync = require('../../../utils/catchAsync');
const AppError = require('../../../utils/appError');
const { SystemIntegrityService } = require('./system-integrity.service');

function assertSuperAdmin(req) {
  const role = req.user?.role;
  if (role?.name === 'SUPER-ADMIN' || role?.isSystemRole === true) {
    return;
  }
  throw new AppError('System integrity reports require SUPER-ADMIN access', 403);
}

/**
 * GET /api/v1/system/integrity/report?merchantId=&domains=branch,menu
 */
exports.getIntegrityReport = catchAsync(async (req, res) => {
  assertSuperAdmin(req);

  const { merchantId, domains } = req.query;
  const domainList =
    typeof domains === 'string' && domains.length > 0
      ? domains.split(',').map(s => s.trim())
      : undefined;

  const report = await SystemIntegrityService.runFullAudit({
    merchantId: merchantId || undefined,
    domains: domainList,
  });

  res.status(200).json({
    status: 'success',
    data: report,
  });
});
