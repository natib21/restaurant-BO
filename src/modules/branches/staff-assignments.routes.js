/**
 * @file src/modules/branches/staff-assignments.routes.js
 * @description Staff-to-table assignment management.
 *
 * All routes require JWT auth + task RBAC.
 *
 * Middleware pipeline:
 *   protect → restrictTo() → handler
 */

const express = require('express');
const { protect, restrictTo } = require('../../common/guards/auth.guard');
const staffAssignmentController = require('../branch/controller/staff-assignment.controller');

const router = express.Router();

router.use(protect);
router.use(restrictTo());

router
  .route('/')
  .post(staffAssignmentController.assignTablesToStaff)
  .get(staffAssignmentController.getAllAssignments);

router.get('/current', staffAssignmentController.getCurrentAssignments);
router.patch('/:id/end', staffAssignmentController.endAssignment);

module.exports = router;
