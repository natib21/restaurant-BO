const catchAsync = require('../../../utils/catchAsync');
const { TableSystemService } = require('./table-system.service');
const { getMerchantId } = require('../../common/utils/tenant-scope');

exports.regenerateQr = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const result = await TableSystemService.generateSignedQr(req.params.id, merchantId);
  res.status(200).json({
    status: 'success',
    data: {
      tableId: result.table._id,
      qrUrl: result.url,
      data: result.data,
      signature: result.signature,
    },
  });
});

exports.transitionStatus = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const { status, branchId } = req.body;
  const result = await TableSystemService.transitionStatus({
    tableId: req.params.id,
    merchantId,
    branchId,
    toStatus: status,
  });
  res.status(200).json({ status: 'success', data: result });
});
