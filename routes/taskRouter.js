const express = require('express');
const taskController = require('../controllers/taskController');
const authController = require('../controllers/authController');

const router = express.Router();

// Restrict all routes to merchant admins
// router.use(authController.protect, authController.restrictTo('admin'));

// Routes for task management
router.get('/', taskController.getAllTasks); // List all tasks
router.post('/sync', taskController.syncTasks); // Sync tasks from Task API
router.post('/', taskController.createTask); // Create a single task
router.patch('/:id', taskController.updateTask); // Update a task
router.delete('/:id', taskController.deleteTask); // Delete a task

module.exports = router;