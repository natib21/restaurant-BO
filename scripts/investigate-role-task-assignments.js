/**
 * @file scripts/investigate-role-task-assignments.js
 * @description Investigation script for RBAC Item 1: Task/Capability Configuration
 * 
 * Queries Role collection to understand which roles have menu-related tasks assigned.
 * This is investigation only — no fixes applied.
 */

const mongoose = require('mongoose');
const { getMongoUri } = require('../src/config/env');
const Role = require('../models/roleModel');
const Task = require('../models/taskModel');

async function investigateRoleTaskAssignments() {
  try {
    const mongoUri = getMongoUri();
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to database\n');

    console.log('='.repeat(80));
    console.log('RBAC ITEM 1 INVESTIGATION: Role Task Assignments');
    console.log('='.repeat(80));
    console.log();

    // Get all roles with their tasks populated
    const roles = await Role.find({})
      .populate({
        path: 'tasks',
        select: 'name endpoint method isMerchant description',
      })
      .select('name isSystemRole tasks capabilities description')
      .lean();

    console.log(`Found ${roles.length} roles in the system\n`);

    // Menu-related endpoints we're investigating
    const menuEndpoints = [
      // Menu Items
      { endpoint: '/api/v1/menus', method: 'POST', description: 'Create menu item' },
      { endpoint: '/api/v1/menus/:id', method: 'PATCH', description: 'Update menu item' },
      { endpoint: '/api/v1/menus/:id', method: 'DELETE', description: 'Delete menu item' },
      
      // Menu Groups
      { endpoint: '/api/v1/menu-groups', method: 'POST', description: 'Create menu group' },
      { endpoint: '/api/v1/menu-groups/:id', method: 'PATCH', description: 'Update menu group' },
      { endpoint: '/api/v1/menu-groups/:id', method: 'DELETE', description: 'Delete menu group' },
      
      // Branch Menu Groups
      { endpoint: '/api/v1/branch-menu-groups', method: 'POST', description: 'Create branch menu group' },
      { endpoint: '/api/v1/branch-menu-groups/:id', method: 'PATCH', description: 'Update branch menu group' },
      { endpoint: '/api/v1/branch-menu-groups/:id', method: 'DELETE', description: 'Delete branch menu group' },
      
      // Combos
      { endpoint: '/api/v1/combos', method: 'POST', description: 'Create combo' },
      { endpoint: '/api/v1/combos/:id', method: 'PATCH', description: 'Update combo' },
      { endpoint: '/api/v1/combos/:id', method: 'DELETE', description: 'Delete combo' },
    ];

    // Normalize endpoint patterns for matching
    function normalizeEndpoint(endpoint) {
      return endpoint.replace(/:id/g, ':id').replace(/\/$/, '');
    }

    const normalizedMenuEndpoints = menuEndpoints.map(e => ({
      ...e,
      normalized: normalizeEndpoint(e.endpoint),
    }));

    console.log('--- ROLE-BY-ROLE ANALYSIS ---\n');

    for (const role of roles) {
      console.log(`Role: ${role.name}`);
      console.log(`  isSystemRole: ${role.isSystemRole || false}`);
      console.log(`  Description: ${role.description || 'N/A'}`);
      console.log(`  Capabilities: ${role.capabilities?.length > 0 ? role.capabilities.join(', ') : 'None'}`);
      console.log(`  Total Tasks: ${role.tasks?.length || 0}`);

      if (role.isSystemRole) {
        console.log(`  ⚠️  BYPASSES ALL TASK CHECKS (isSystemRole=true)\n`);
        continue;
      }

      if (!role.tasks || role.tasks.length === 0) {
        console.log(`  ⚠️  NO TASKS ASSIGNED (would be denied access to all protected routes)\n`);
        continue;
      }

      // Check for menu-related task assignments
      const menuTasks = [];
      for (const task of role.tasks) {
        const normalizedTask = normalizeEndpoint(task.endpoint || '');
        const match = normalizedMenuEndpoints.find(
          e => e.normalized === normalizedTask && e.method === task.method
        );
        if (match) {
          menuTasks.push({
            endpoint: task.endpoint,
            method: task.method,
            description: match.description,
            taskName: task.name,
          });
        }
      }

      if (menuTasks.length > 0) {
        console.log(`  🔍 MENU WRITE TASKS ASSIGNED (${menuTasks.length}):`);
        for (const t of menuTasks) {
          console.log(`     - ${t.method} ${t.endpoint}`);
          console.log(`       (${t.description})`);
        }
        console.log();
      } else {
        console.log(`  ✓ No menu write tasks assigned\n`);
      }
    }

    console.log('\n--- SUMMARY: WHO CAN WRITE TO MENU ENDPOINTS? ---\n');

    const rolesWithMenuWriteAccess = [];
    for (const role of roles) {
      if (role.isSystemRole) {
        rolesWithMenuWriteAccess.push({
          role: role.name,
          reason: 'BYPASSES ALL CHECKS (isSystemRole=true)',
          taskCount: 0,
        });
        continue;
      }

      if (!role.tasks || role.tasks.length === 0) continue;

      const menuTasks = role.tasks.filter(task => {
        const normalizedTask = normalizeEndpoint(task.endpoint || '');
        return normalizedMenuEndpoints.some(
          e => e.normalized === normalizedTask && e.method === task.method
        );
      });

      if (menuTasks.length > 0) {
        rolesWithMenuWriteAccess.push({
          role: role.name,
          reason: `Has ${menuTasks.length} menu write task(s) assigned`,
          taskCount: menuTasks.length,
        });
      }
    }

    if (rolesWithMenuWriteAccess.length === 0) {
      console.log('✓ NO roles (other than system roles) have menu write tasks assigned.');
      console.log('  This means task assignment is correctly restricted.\n');
    } else {
      console.log('Found roles with menu write access:\n');
      for (const entry of rolesWithMenuWriteAccess) {
        console.log(`  - ${entry.role}: ${entry.reason}`);
      }
      console.log();
    }

    console.log('\n--- TASK MANAGEMENT APPROACH ---\n');

    // Check if there's a seed script
    const fs = require('fs');
    const seedScriptExists = fs.existsSync('./scripts/seed-roles-and-tasks.js');
    console.log(`Seed Script: ${seedScriptExists ? '✓ EXISTS (scripts/seed-roles-and-tasks.js)' : '❌ NOT FOUND'}`);

    // Check all tasks to see patterns
    const allTasks = await Task.find({}).select('name endpoint method isMerchant').lean();
    console.log(`Total Tasks in DB: ${allTasks.length}`);
    
    const merchantScopedTasks = allTasks.filter(t => t.isMerchant === true);
    console.log(`  - Merchant-scoped (isMerchant=true): ${merchantScopedTasks.length}`);
    console.log(`  - System-wide (isMerchant=false): ${allTasks.length - merchantScopedTasks.length}`);

    // Check menu-specific tasks
    const menuRelatedTasks = allTasks.filter(task => {
      const normalizedTask = normalizeEndpoint(task.endpoint || '');
      return normalizedMenuEndpoints.some(e => e.normalized === normalizedTask);
    });

    console.log(`\nMenu-related tasks in Task collection: ${menuRelatedTasks.length}`);
    if (menuRelatedTasks.length > 0) {
      console.log('Menu write tasks available:');
      for (const task of menuRelatedTasks) {
        console.log(`  - ${task.method} ${task.endpoint} (isMerchant: ${task.isMerchant})`);
      }
    }

    console.log('\n--- CONFIDENCE ASSESSMENT ---\n');

    if (seedScriptExists) {
      console.log('✓ Task assignment appears to be managed via seed script');
      console.log('  - Confidence: HIGH (reproducible, version-controlled)');
      console.log('  - Risk: LOW (changes require code commit + re-seeding)');
    } else {
      console.log('⚠️  No seed script found');
      console.log('  - Confidence: MEDIUM (may be manual DB edits or admin UI)');
      console.log('  - Risk: MEDIUM (changes could be made ad-hoc)');
    }

    console.log('\n--- RECOMMENDATION ---\n');

    if (rolesWithMenuWriteAccess.length <= 1) {
      console.log('Current task assignment is RESTRICTIVE (only SUPER-MERCHANT-ADMIN or system roles).');
      console.log('Adding requireCapability() would be REDUNDANT unless:');
      console.log('  1. You plan to introduce more granular roles (e.g., Menu Editor, Menu Viewer)');
      console.log('  2. You want defense-in-depth (task RBAC + capability layer)');
      console.log('  3. You need audit trail separation (capability logs vs task logs)');
      console.log('\nRecommendation: DEFER requireCapability() addition unless one of above applies.');
    } else {
      console.log('Multiple roles have menu write access beyond SUPER-MERCHANT-ADMIN.');
      console.log('Adding requireCapability() would provide ADDITIONAL SECURITY LAYER.');
      console.log('\nRecommendation: ADD requireCapability(MENU_MANAGE) to all menu write endpoints.');
    }

    console.log('\n' + '='.repeat(80));
    console.log('INVESTIGATION COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error during investigation:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Disconnected from database');
  }
}

investigateRoleTaskAssignments();
