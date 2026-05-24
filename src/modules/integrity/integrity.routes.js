const express = require('express');
const authController = require('../../../controllers/authController');
const integrityController = require('./integrity.controller');

const router = express.Router();

router.use(authController.protect);

router.get('/report', integrityController.getIntegrityReport);

module.exports = router;
