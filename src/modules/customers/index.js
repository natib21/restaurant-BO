const { protectTableSession } = require('./customer-session.guard');
const customerAuthController = require('./controllers/customer-auth.controller');
const customerSelfController = require('./controllers/customer-self.controller');
const customerStaffController = require('./controllers/customer-staff.controller');
const { protectCustomer } = require('./guards/protect-customer.guard');

module.exports = {
  protectTableSession,
  protectCustomer,
  customerAuthController,
  customerSelfController,
  customerStaffController,
};
