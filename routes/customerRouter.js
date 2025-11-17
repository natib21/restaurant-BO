// routes/customerRoutes.js
const express = require('express');
const customerController = require('../controllers/customerController');
const authController = require('../controllers/authController');

const router = express.Router({ mergeParams: true });

router.post('/login', customerController.loginOrCreate);
router.use(authController.protect); // below routes need merchant login
router.get('/', customerController.getAllCustomers);
router.get('/:id', customerController.getCustomer);

module.exports = router;
