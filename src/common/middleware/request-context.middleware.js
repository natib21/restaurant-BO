const { v4: uuidv4 } = require('uuid');

function initRequestContext(req, res, next) {
  const requestId = uuidv4().slice(0, 8);
  const requestTime = new Date().toISOString();

  req.ctx = {
    requestId,
    requestTime,
    actorType: 'system',
  };
  req.requestId = requestId;
  req.requestTime = requestTime;
  res.locals.requestId = requestId;
  next();
}

function syncRequestContext(req, res, next) {
  if (!req.ctx) return next();

  if (req.user) {
    req.ctx.actorType = 'staff';
    req.ctx.actorId = req.user._id;
    req.ctx.merchantId = req.ctx.merchantId ?? req.user.merchant?._id;
  } else if (req.customerId || req.ctx.customerId) {
    req.ctx.actorType = 'customer';
  } else if (req.merchantId) {
    req.ctx.actorType = 'anonymous';
  }

  req.ctx.merchantId = req.ctx.merchantId ?? req.merchantId;
  req.ctx.branchId = req.ctx.branchId ?? req.branchId;
  req.ctx.customerId = req.ctx.customerId ?? req.customerId;
  req.ctx.tableId = req.ctx.tableId ?? req.tableId;

  next();
}

module.exports = { initRequestContext, syncRequestContext };
