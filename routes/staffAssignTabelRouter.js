// routes/staffAssignmentRoutes.js
const express = require('express');
const staffAssignmentController = require('../controllers/staffAssignTableController');
const authController = require('../controllers/authController');

const router = express.Router();

// Protect all routes
router.use(authController.protect);
router.use(authController.restrictTo());

// Main routes
router
  .route('/')
  .post(staffAssignmentController.assignTablesToStaff)      // Assign tables
  .get(staffAssignmentController.getAllAssignments);        // History + filter

router.get('/current', staffAssignmentController.getCurrentAssignments); // Active now

router.patch('/:id/end', staffAssignmentController.endAssignment);       // End shift

module.exports = router;