/**
 * Verify menu, combo, and order API paths (static + optional live).
 * Run: node scripts/verify-frontend-api-paths.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const FE_QUERIES = path.resolve(
  __dirname,
  '../../restaurant-merchant-app/src/api/Queries'
);

const checks = [
  {
    file: 'menuQueries.ts',
    mustNotInclude: ['/v1/menuGroup'],
    paths: [
      { fe: '/v1/menu-group', be: 'GET/POST /api/v1/menu-group' },
      { fe: '/v1/menu/', be: 'menu item routes' },
    ],
  },
  {
    file: 'comboQueries.ts',
    mustNotInclude: ['/v1/menuCombo'],
    paths: [{ fe: '/v1/combo', be: 'combo routes' }],
  },
  {
    file: 'orderQuery.ts',
    mustNotInclude: ['`/v1/order/${branchId}`'],
    paths: [
      { fe: '/v1/order/active', be: 'GET active orders' },
      { fe: '/v1/order/completed', be: 'GET completed orders' },
      { fe: '/v1/order/${orderId}/pay', be: 'POST mark paid' },
    ],
  },
  {
    file: 'authQueries.ts',
    paths: [
      { fe: '/v1/auth/signup', be: 'signup' },
      { fe: '/v1/users/me', be: 'get me' },
    ],
  },
  {
    file: 'merchantQueries.ts',
    mustNotInclude: ['/v1/merchants'],
    paths: [{ fe: '/v1/merchant/', be: 'merchant routes' }],
  },
];

const liveChecks = [
  ['GET', '/api/v1/menu-group'],
  ['GET', '/api/v1/combo'],
  ['GET', '/api/v1/order/active'],
  ['GET', '/api/v1/order/completed'],
  ['GET', '/api/v1/order/pending'],
  ['POST', '/api/v1/order/000000000000000000000000/pay'],
  ['GET', '/api/v1/users/me'],
  ['GET', '/api/v1/merchant/me'],
  ['GET', '/api/v1/menuGroup'],
  ['GET', '/api/v1/menuCombo'],
];

function request(method, urlPath) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: 'localhost', port: 8000, path: urlPath, method, timeout: 3000 },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

async function main() {
  let failed = 0;

  console.log('=== Static frontend path checks ===\n');
  for (const group of checks) {
    const filePath = path.join(FE_QUERIES, group.file);
    const content = fs.readFileSync(filePath, 'utf8');

    for (const bad of group.mustNotInclude || []) {
      if (content.includes(bad)) {
        console.error(`FAIL ${group.file}: still contains ${bad}`);
        failed += 1;
      }
    }

    for (const { fe, be } of group.paths) {
      const token = fe.replace('${orderId}', '').replace('${branchId}', '');
      if (content.includes(token)) {
        console.log(`OK ${group.file}: ${fe} -> ${be}`);
      } else {
        console.error(`FAIL ${group.file}: missing ${fe}`);
        failed += 1;
      }
    }
  }

  console.log('\n=== Live backend checks (non-404 = route exists) ===\n');
  const health = await request('GET', '/health');
  if (health === null) {
    console.log('SKIP live checks — backend not running on :8000');
  } else {
    console.log(`Health: ${health}`);
    for (const [method, p] of liveChecks) {
      const status = await request(method, p);
      const exists = status !== null && status !== 404;
      console.log(`${exists ? 'OK' : 'FAIL'} ${method} ${p} -> ${status ?? 'no response'}`);
      if (!exists && !p.includes('menuGroup') && !p.includes('menuCombo')) {
        failed += 1;
      }
    }
  }

  console.log(`\n${failed === 0 ? 'All checks passed' : failed + ' check(s) failed'}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
