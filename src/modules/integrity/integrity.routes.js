const express = require('express');
const { protect } = require('../../common/guards/auth.guard');
const integrityController = require('./integrity.controller');

const router = express.Router();

router.use(protect);

router.get('/report', integrityController.getIntegrityReport);

module.exports = router;
