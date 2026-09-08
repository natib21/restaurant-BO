/**
 * @file src/modules/categories/controller/category.controller.js
 * @description HTTP request handlers for category endpoints
 * 
 * Responsibilities:
 * - Request/response handling
 * - Merchant ID extraction
 * - Response formatting using sendResponse
 * - Error handling via catchAsync
 */

const catchAsync = require('../../../../utils/catchAsync');
const { sendResponse } = require('../../../../utils/sendResponse');
const { CategoryService } = require('../service/category.service');
const { getMerchantId } = require('../../../common/utils/tenant-scope');

// ══════════════════════════════════════════════════════════════════════════
// CREATE CATEGORY
// ══════════════════════════════════════════════════════════════════════════

exports.createCategory = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const userId = req.user._id;

  const category = await CategoryService.createCategory(req.body, merchantId, userId);

  sendResponse(res, 201, 'category', category);
});

// ══════════════════════════════════════════════════════════════════════════
// GET ALL CATEGORIES
// ══════════════════════════════════════════════════════════════════════════

exports.getAllCategories = catchAsync(async (req, res) => {
  const categories = await CategoryService.getAllCategories(req);

  sendResponse(res, 200, 'categories', categories, {
    results: categories.length
  });
});

// ══════════════════════════════════════════════════════════════════════════
// GET ACTIVE CATEGORIES ONLY
// ══════════════════════════════════════════════════════════════════════════

exports.getActiveCategories = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);

  const categories = await CategoryService.getActiveCategories(merchantId);

  sendResponse(res, 200, 'categories', categories, {
    results: categories.length
  });
});

// ══════════════════════════════════════════════════════════════════════════
// GET SINGLE CATEGORY
// ══════════════════════════════════════════════════════════════════════════

exports.getCategoryById = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);

  const category = await CategoryService.getCategoryById(req.params.id, merchantId);

  sendResponse(res, 200, 'category', category);
});

// ══════════════════════════════════════════════════════════════════════════
// UPDATE CATEGORY
// ══════════════════════════════════════════════════════════════════════════

exports.updateCategory = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);
  const userId = req.user._id;

  const category = await CategoryService.updateCategory(
    req.params.id,
    req.body,
    merchantId,
    userId
  );

  sendResponse(res, 200, 'category', category);
});

// ══════════════════════════════════════════════════════════════════════════
// DELETE CATEGORY (SOFT DELETE)
// ══════════════════════════════════════════════════════════════════════════

exports.deleteCategory = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);

  await CategoryService.deleteCategory(req.params.id, merchantId);

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// ══════════════════════════════════════════════════════════════════════════
// RESTORE CATEGORY
// ══════════════════════════════════════════════════════════════════════════

exports.restoreCategory = catchAsync(async (req, res) => {
  const merchantId = getMerchantId(req);

  const category = await CategoryService.restoreCategory(req.params.id, merchantId);

  sendResponse(res, 200, 'category', category, {
    message: 'Category restored successfully'
  });
});
