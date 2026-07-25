const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const fileController = require('./file.controller');
const { requireCapability } = require('../../common/guards/capability.guard');
const { CAPABILITIES } = require('../../common/capabilities/capabilities');

const router = express.Router();

// ✅ 1. PUBLIC ROUTES (No authentication required)
// Move this BEFORE the protect middleware
router.get('/:id/content', fileController.getFileContent);

// ✅ 2. PROTECTED ROUTES (Authentication required)
router.use(protect);
router.use(restrictTo());

router.post(
  '/upload',
  requireCapability(CAPABILITIES.FILE_MANAGE),
  fileController.uploadMiddleware,
  fileController.uploadFile
);

router.get('/entity', requireCapability(CAPABILITIES.FILE_MANAGE), fileController.listEntityFiles);
router.delete('/:id', requireCapability(CAPABILITIES.FILE_MANAGE), fileController.deleteFile);

module.exports = router;