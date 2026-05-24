const AppError = require('../../../../utils/appError');

function assertValidStaffOrderType(orderType) {
  if (!orderType || !['dine_in', 'takeaway', 'delivery'].includes(orderType)) {
    throw new AppError('Valid orderType is required (dine_in, takeaway, delivery)', 400);
  }
}

function assertDineInTableId(orderType, tableId) {
  if (orderType === 'dine_in' && !tableId) {
    throw new AppError('tableId is required for dine-in orders', 400);
  }
}

module.exports = {
  assertValidStaffOrderType,
  assertDineInTableId,
};
