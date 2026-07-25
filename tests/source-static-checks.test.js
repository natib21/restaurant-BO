const fs = require('fs');
const path = require('path');

describe('static source-file sanity checks', () => {
  test('connection.ts EOF has no stray dangling chars and ends with }', () => {
    const file = path.join(process.cwd(), 'src', 'common', 'database', 'connection.ts');
    const content = fs.readFileSync(file, 'utf8');
    const trimmed = content.trimEnd();
    expect(trimmed.endsWith('}')).toBe(true);
    const last = trimmed.charAt(trimmed.length - 1);
    expect(last).toBe('}');
    const lines = trimmed.split('\n').filter(l => l.trim().length > 0);
    const lastLine = lines[lines.length - 1].trim();
    expect(lastLine).not.toMatch(/^[a-z]$/);
    expect(trimmed.indexOf(')')).toBeGreaterThan(-1);
  });

  test('env.ts loadEnv function returns cached (not cached.data)', () => {
    const file = path.join(process.cwd(), 'src', 'config', 'env.ts');
    const content = fs.readFileSync(file, 'utf8');
    const match = content.match(/export function loadEnv\(\)[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    expect(match[0]).toMatch(/return cached;/);
    expect(match[0]).not.toMatch(/return cached\.data/);
  });

  test('routes/index.js mounts /api/v1/session (no sessio typo)', () => {
    const file = path.join(process.cwd(), 'src', 'routes', 'index.js');
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toMatch(/\/api\/v1\/session/);
    expect(content).not.toMatch(/\/api\/v1\/sessio['"`,]/);
  });

  test('inventory/index.js exports capitalized service and repository files', () => {
    const file = path.join(process.cwd(), 'src', 'modules', 'inventory', 'index.js');
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toMatch(/service\/InventoryService\.js/);
    expect(content).toMatch(/repository\/InventoryRepository\.js/);
  });

  test('socket-server.ts uses double-cast as unknown as for promisified jwt.verify', () => {
    const file = path.join(process.cwd(), 'src', 'infrastructure', 'websocket', 'socket-server.ts');
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toMatch(/as unknown as/);
  });

  test('request-context.ts augmentation declares user, tableId, tableSession on Express.Request', () => {
    const file = path.join(process.cwd(), 'src', 'common', 'types', 'request-context.ts');
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toMatch(/interface Request[\s\S]*user\?/);
    expect(content).toMatch(/tableId\?:/);
    expect(content).toMatch(/tableSession\?:/);
  });

  test('uuid dependency is pinned to v9.x (CommonJS compatible with Jest)', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
    );
    expect(typeof pkg.dependencies.uuid).toBe('string');
    expect(/^\^9|^9/.test(pkg.dependencies.uuid)).toBe(true);
  });

  test('pre-commit hook script exists in .githooks/pre-commit', () => {
    const hook = path.join(process.cwd(), '.githooks', 'pre-commit');
    expect(fs.existsSync(hook)).toBe(true);
  });

  test('package.json has lint, test, verify scripts', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
    );
    expect(typeof pkg.scripts.test).toBe('string');
    expect(typeof pkg.scripts.lint).toBe('string');
    expect(typeof pkg.scripts['verify:pre-commit']).toBe('string');
  });
});
