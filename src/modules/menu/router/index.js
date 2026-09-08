/**
 * @file src/modules/menu/router/index.js
 * @description Main router aggregator for menu module
 * Combines all sub-routers into a single router
 * 
 * NOTE: This file exports existing route files from the router/ folder
 * The routes maintain backward compatibility with existing API structure
 */

const express = require('express');
const router = express.Router();

// Import existing route files (moved to router/ folder)
const menusRoutes = require('./menus.routes');
const menuGroupsRoutes = require('./menu-groups.routes');
const combosRoutes = require('./combos.routes');
const branchMenuGroupsRoutes = require('./branch-menu-groups.routes');

// Mount routes (keeping original paths for backward compatibility)
// These paths are relative to /api/v1/ as mounted in src/routes/index.js
router.use('/menus', menusRoutes);
router.use('/menu-groups', menuGroupsRoutes);
router.use('/combos', combosRoutes);
router.use('/branch-menu-groups', branchMenuGroupsRoutes);

module.exports = router;
