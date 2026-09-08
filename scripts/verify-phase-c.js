/**
 * @file scripts/verify-phase-c.js
 * @description Manual verification script for Phase C implementation
 * 
 * Run with: node scripts/verify-phase-c.js
 */

const ApiFeatures = require('../utils/apiFeatures');
const { sendResponse } = require('../utils/sendResponse');

console.log('====================================');
console.log('Phase C Manual Verification');
console.log('====================================\n');

// Test 1: ApiFeatures exists and has required methods
console.log('✓ Test 1: ApiFeatures Utility');
try {
  const mockQuery = { find: () => mockQuery, sort: () => mockQuery, select: () => mockQuery, skip: () => mockQuery, limit: () => mockQuery };
  const mockQueryString = { search: 'test', sort: 'name', fields: 'name,price', page: 1, limit: 10 };
  
  const features = new ApiFeatures(mockQuery, mockQueryString);
  
  if (typeof features.search !== 'function') throw new Error('search() method missing');
  if (typeof features.filter !== 'function') throw new Error('filter() method missing');
  if (typeof features.sort !== 'function') throw new Error('sort() method missing');
  if (typeof features.limitFields !== 'function') throw new Error('limitFields() method missing');
  if (typeof features.paginate !== 'function') throw new Error('paginate() method missing');
  
  console.log('  ✅ ApiFeatures class exists');
  console.log('  ✅ search() method exists');
  console.log('  ✅ filter() method exists');
  console.log('  ✅ sort() method exists');
  console.log('  ✅ limitFields() method exists');
  console.log('  ✅ paginate() method exists');
} catch (error) {
  console.log('  ❌ FAILED:', error.message);
  process.exit(1);
}

console.log('\n✓ Test 2: sendResponse Helper');
try {
  if (typeof sendResponse !== 'function') {
    throw new Error('sendResponse is not a function');
  }
  
  // Mock response object
  const mockRes = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.body = data;
      return this;
    }
  };
  
  // Test list response
  sendResponse(mockRes, 200, 'menus', [{ id: 1 }, { id: 2 }], { results: 2 });
  
  if (mockRes.statusCode !== 200) throw new Error('Status code not set correctly');
  if (mockRes.body.status !== 'success') throw new Error('Status not set to success');
  if (!mockRes.body.data) throw new Error('Data object missing');
  if (!mockRes.body.data.menus) throw new Error('Resource key not set');
  if (mockRes.body.results !== 2) throw new Error('Results count not set');
  
  console.log('  ✅ sendResponse function exists');
  console.log('  ✅ Status code set correctly');
  console.log('  ✅ Response envelope structure correct');
  console.log('  ✅ Resource key dynamic');
  console.log('  ✅ Extra fields (results) merged correctly');
} catch (error) {
  console.log('  ❌ FAILED:', error.message);
  process.exit(1);
}

console.log('\n✓ Test 3: Response Shape Validation');
try {
  const mockRes = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.body = data;
      return this;
    }
  };
  
  // Test different response patterns
  
  // List response
  sendResponse(mockRes, 200, 'menus', [{}, {}], { results: 2 });
  if (!mockRes.body.results) throw new Error('List response missing results field');
  if (!Array.isArray(mockRes.body.data.menus)) throw new Error('List response data not an array');
  console.log('  ✅ List response shape correct');
  
  // Single resource response
  sendResponse(mockRes, 200, 'menu', { id: 1, name: 'Test' });
  if (mockRes.body.results) throw new Error('Single resource should not have results field');
  if (typeof mockRes.body.data.menu !== 'object') throw new Error('Single resource data not an object');
  console.log('  ✅ Single resource response shape correct');
  
  // Action response with message
  sendResponse(mockRes, 200, 'menu', { id: 1 }, { message: 'Updated successfully' });
  if (!mockRes.body.message) throw new Error('Action response missing message field');
  console.log('  ✅ Action response shape correct');
  
  // Delete response
  sendResponse(mockRes, 204, null, null);
  if (mockRes.statusCode !== 204) throw new Error('Delete response status code incorrect');
  console.log('  ✅ Delete response (204) correct');
  
} catch (error) {
  console.log('  ❌ FAILED:', error.message);
  process.exit(1);
}

console.log('\n✓ Test 4: File Structure');
try {
  const fs = require('fs');
  const path = require('path');
  
  // Check that files exist
  const filesToCheck = [
    { path: 'utils/apiFeatures.js', name: 'ApiFeatures utility' },
    { path: 'utils/sendResponse.js', name: 'sendResponse helper' },
    { path: 'src/modules/menu/service/MenuService.js', name: 'MenuService' },
    { path: 'src/modules/menu/controller/menu.controller.js', name: 'menu.controller' },
    { path: 'src/modules/menu/controller/menu-group.controller.js', name: 'menu-group.controller' },
    { path: 'src/modules/menu/controller/combo.controller.js', name: 'combo.controller' },
    { path: 'src/modules/menu/controller/branch-menu-group.controller.js', name: 'branch-menu-group.controller' }
  ];
  
  filesToCheck.forEach(file => {
    const fullPath = path.join(__dirname, '..', file.path);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${file.path}`);
    }
    console.log(`  ✅ ${file.name} exists`);
  });
  
} catch (error) {
  console.log('  ❌ FAILED:', error.message);
  process.exit(1);
}

console.log('\n✓ Test 5: Code Inspection - MenuService');
try {
  const fs = require('fs');
  const path = require('path');
  
  const serviceFile = fs.readFileSync(
    path.join(__dirname, '../src/modules/menu/service/MenuService.js'),
    'utf-8'
  );
  
  // Check for ApiFeatures usage
  if (!serviceFile.includes('ApiFeatures')) {
    throw new Error('ApiFeatures not imported in MenuService');
  }
  console.log('  ✅ ApiFeatures imported in MenuService');
  
  // Check for search() method calls
  if (!serviceFile.includes('.search(')) {
    throw new Error('search() method not called in MenuService');
  }
  console.log('  ✅ search() method called');
  
  // Check for filter() method calls
  if (!serviceFile.includes('.filter()')) {
    throw new Error('filter() method not called in MenuService');
  }
  console.log('  ✅ filter() method called');
  
  // Check for sort() method calls
  if (!serviceFile.includes('.sort()')) {
    throw new Error('sort() method not called in MenuService');
  }
  console.log('  ✅ sort() method called');
  
  // Check for paginate() method calls
  if (!serviceFile.includes('.paginate()')) {
    throw new Error('paginate() method not called in MenuService');
  }
  console.log('  ✅ paginate() method called');
  
  // Check for proper merchant scoping
  if (!serviceFile.includes('merchant: merchantId')) {
    throw new Error('Merchant scoping pattern not found');
  }
  console.log('  ✅ Merchant scoping pattern found');
  
} catch (error) {
  console.log('  ❌ FAILED:', error.message);
  process.exit(1);
}

console.log('\n✓ Test 6: Code Inspection - Controllers');
try {
  const fs = require('fs');
  const path = require('path');
  
  const controllers = [
    'menu.controller.js',
    'menu-group.controller.js',
    'combo.controller.js',
    'branch-menu-group.controller.js'
  ];
  
  controllers.forEach(controller => {
    const controllerFile = fs.readFileSync(
      path.join(__dirname, '../src/modules/menu/controller', controller),
      'utf-8'
    );
    
    // Check for sendResponse usage
    if (!controllerFile.includes('sendResponse')) {
      throw new Error(`sendResponse not used in ${controller}`);
    }
    console.log(`  ✅ sendResponse imported and used in ${controller}`);
  });
  
} catch (error) {
  console.log('  ❌ FAILED:', error.message);
  process.exit(1);
}

console.log('\n====================================');
console.log('✅ ALL VERIFICATION TESTS PASSED');
console.log('====================================');
console.log('\nPhase C Implementation verified successfully!');
console.log('\nNext steps:');
console.log('1. Run integration tests with real database');
console.log('2. Test API endpoints manually with Postman/curl');
console.log('3. Verify merchant isolation');
console.log('4. Test query parameters');
console.log('5. Share frontend migration guide with frontend team');
console.log('\n');
