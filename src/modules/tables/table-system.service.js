/**
 * @deprecated Table logic lives in `src/modules/branch/service/BranchService.js`.
 */
const { BranchService } = require('../branch');

const TableSystemService = {
  validateTransition: BranchService.validateTableTransition.bind(BranchService),
  transitionStatus: BranchService.transitionTableStatus.bind(BranchService),
  generateSignedQr: BranchService.generateSignedTableQr.bind(BranchService),
  validateTableForSession: BranchService.validateTableForSession.bind(BranchService),
  getActiveSession: BranchService.getActiveSession.bind(BranchService),
  verifyQrScan: BranchService.verifyQrScan.bind(BranchService),
};

module.exports = { TableSystemService };
