const express = require('express');

function collectMountedPathsFromRouter(router, prefix = '') {
  const paths = [];
  if (!router || !router.stack) return paths;
  router.stack.forEach(layer => {
    if (layer.route) {
      const p = prefix + layer.route.path;
      if (p && !paths.includes(p)) paths.push(p);
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      const mountPath = layer.regexp ? layerRegexpToPath(layer.regexp, layer.keys) : '';
      const nested = collectMountedPathsFromRouter(layer.handle, prefix + mountPath);
      nested.forEach(p => {
        if (!paths.includes(p)) paths.push(p);
      });
    } else if (typeof layer.handle === 'function' && layer.path) {
      paths.push(prefix + (layer.path || ''));
    }
  });
  return paths;
}

function layerRegexpToPath(regexp, keys) {
  if (!regexp) return '';
  const full = regexp.toString();
  const fastMatch = full.match(/^\/\^\\\/(.*?)\\\/\?\(\?=\\\/\|\$\)/);
  if (fastMatch) {
    return '/' + fastMatch[1].replace(/\\\//g, '/');
  }
  const simple = full.match(/^\/\^\\\/((?:[\w-]+\\\/)*[\w-]+)\$/);
  if (simple) {
    return '/' + simple[1].replace(/\\\//g, '/');
  }
  return '';
}

function extractUseMounts() {
  const router = require('../src/routes/index');
  const mounts = [];
  router.stack.forEach(layer => {
    const p = layerRegexpToPath(layer.regexp, layer.keys);
    if (p) mounts.push(p);
  });
  return mounts;
}

describe('global route integrity (src/routes/index.js)', () => {
  let mounts;

  beforeAll(() => {
    jest.isolateModules(() => {
      mounts = extractUseMounts();
    });
  });

  test('session route mount has no typo (sessio) and uses correct path', () => {
    expect(mounts).toContain('/api/v1/session');
    expect(mounts).not.toContain('/api/v1/sessio');
  });

  test('core domain routes are mounted', () => {
    const required = [
      '/api/v1/auth',
      '/api/v1/merchant',
      '/api/v1/users',
      '/api/v1/branch',
      '/api/v1/table',
      '/api/v1/customer',
      '/api/v1/session',
      '/api/v1/menu',
      '/api/v1/menu-group',
      '/api/v1/branch-menu-group',
      '/api/v1/combo',
      '/api/v1/order',
      '/api/v1/ingredients',
      '/api/v1/inventory',
      '/api/v1/recipes',
      '/api/v1/suppliers',
      '/api/v1/purchase-orders',
      '/api/v1/staff-assignments',
      '/api/v1/roles',
      '/api/v1/tasks',
      '/api/v1/subscriptions',
      '/api/v1/analytics',
      '/api/v1/files',
      '/api/v1/system/integrity',
    ];
    required.forEach(p => {
      expect(mounts).toContain(p);
    });
  });

  test('every v1 mount path starts with /api/v1 or known legacy aliases (/api/auth, /health)', () => {
    const allowedPrefixes = ['/api/v1/', '/api/auth', '/health', '/ready'];
    mounts.forEach(p => {
      const ok = allowedPrefixes.some(prefix => p.startsWith(prefix));
      if (!ok) {
        // eslint-disable-next-line no-console
        console.log('Unexpected mount path:', p);
      }
      expect(ok).toBe(true);
    });
  });

  test('router exports an express Router / has stack array', () => {
    expect(Array.isArray(mounts)).toBe(true);
    expect(mounts.length).toBeGreaterThan(10);
  });
});
