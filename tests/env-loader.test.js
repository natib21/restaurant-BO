const path = require('path');

describe('env loader (src/config/env.js)', () => {
  const ENV_MODULE = path.resolve(process.cwd(), 'src', 'config', 'env.js');

  function reloadModule() {
    delete require.cache[ENV_MODULE];
    return require('../src/config/env');
  }

  beforeEach(() => {
    delete require.cache[ENV_MODULE];
  });

  afterAll(() => {
    delete require.cache[ENV_MODULE];
  });

  test('loadEnv() returns object with NODE_ENV + JWT_SECRET + no .data wrapper field', () => {
    const env = reloadModule();
    process.env.NODE_ENV = 'test';
    const result = env.loadEnv();
    expect(typeof result).toBe('object');
    expect(result).toBe(process.env);
    expect(typeof result.NODE_ENV).toBe('string');
    expect(typeof result.JWT_SECRET).toBe('string');
    expect(result.JWT_SECRET.length).toBeGreaterThanOrEqual(16);
    expect(result).not.toHaveProperty('data');
    expect(result).not.toHaveProperty('success');
    expect(result).not.toHaveProperty('error');
  });

  test('loadEnv() throws when JWT_SECRET is missing', () => {
    const env = reloadModule();
    const origSecret = process.env.JWT_SECRET;
    try {
      delete process.env.JWT_SECRET;
      expect(() => env.loadEnv()).toThrow(/JWT_SECRET/);
    } finally {
      process.env.JWT_SECRET = origSecret;
    }
  });

  test('loadEnv() throws when JWT_SECRET is present but shorter than 16 chars', () => {
    const env = reloadModule();
    const origSecret = process.env.JWT_SECRET;
    try {
      process.env.JWT_SECRET = 'short';
      expect(() => env.loadEnv()).toThrow(/at least 16 characters/);
    } finally {
      process.env.JWT_SECRET = origSecret;
    }
  });

  test('loadEnv() returns same process.env reference when called multiple times (identity)', () => {
    const env = reloadModule();
    const a = env.loadEnv();
    const b = env.loadEnv();
    expect(a).toBe(b);
  });

  test('getMongoUri() returns a mongodb:// prefixed URI for test/development', () => {
    const env = reloadModule();
    process.env.NODE_ENV = 'test';
    const uri = env.getMongoUri();
    expect(typeof uri).toBe('string');
    expect(uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://')).toBe(true);
  });

  test('getCorsOrigins() returns default localhost origins + onrender fallback', () => {
    const env = reloadModule();
    const orig = process.env.CORS_ORIGINS;
    delete process.env.CORS_ORIGINS;
    try {
      const origins = env.getCorsOrigins();
      expect(Array.isArray(origins)).toBe(true);
      expect(origins).toEqual(
        expect.arrayContaining([
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'http://localhost:5174',
          'http://127.0.0.1:5174',
          'https://restaurant-bo.onrender.com',
        ])
      );
    } finally {
      if (orig) process.env.CORS_ORIGINS = orig;
    }
  });

  test('getCorsOrigins() appends custom origins from env', () => {
    const env = reloadModule();
    const orig = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = 'https://app.example.com,https://demo.example.com';
    try {
      const origins = env.getCorsOrigins();
      expect(origins).toContain('https://app.example.com');
      expect(origins).toContain('https://demo.example.com');
    } finally {
      if (orig) process.env.CORS_ORIGINS = orig;
      else delete process.env.CORS_ORIGINS;
    }
  });
});
